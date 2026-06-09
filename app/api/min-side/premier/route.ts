import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { createClient } from "@supabase/supabase-js"
import { arkiverTilMediaBibliotek } from "@/lib/media-bibliotek-arkiv"

export const dynamic = "force-dynamic"

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

async function getAuth() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false as const, status: 500 as const, feil: "Supabase er ikke konfigurert." }
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options)
        }
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const userId = user?.id ?? null
  const email = String(user?.email ?? "").trim().toLowerCase()
  if (!userId || !email || !isValidEmail(email)) {
    return { ok: false as const, status: 401 as const, feil: "Ikke innlogget." }
  }

  return { ok: true as const, userId, email, supabaseUrl }
}

function schemaFeil(msg?: string) {
  const text = String(msg ?? "")
  if (!/relation|table|column|does not exist/i.test(text)) return null
  return (
    "Premiearkiv mangler i Supabase. Kjør denne SQL-en i Supabase (SQL Editor), og prøv igjen:\n\n" +
    "create table if not exists public.lodd_premier (\n" +
    "  id uuid primary key default gen_random_uuid(),\n" +
    "  created_at timestamptz not null default now(),\n" +
    "  submitted_by_user_id uuid,\n" +
    "  submitted_by_epost text,\n" +
    "  tittel text not null,\n" +
    "  sponsor_navn text,\n" +
    "  sponsor_orgnr text,\n" +
    "  sponsor_nettsted text,\n" +
    "  verdi numeric,\n" +
    "  image_path text,\n" +
    "  status text not null default 'arkiv',\n" +
    "  admin_notat text,\n" +
    "  approved_at timestamptz,\n" +
    "  approved_by_epost text\n" +
    ");\n" +
    "create index if not exists lodd_premier_created_at_idx on public.lodd_premier (created_at desc);\n" +
    "create index if not exists lodd_premier_status_idx on public.lodd_premier (status);\n"
  )
}

async function requireAktivMedlem(auth: { userId: string; email: string; supabaseUrl: string }) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return { ok: false as const, status: 500 as const, feil: "Mangler SUPABASE_SERVICE_ROLE_KEY." }
  }

  const admin = createClient(auth.supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { data, error } = await admin
    .from("medlemmer")
    .select("id, aktiv, user_id")
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    const msg = String((error as { message?: string } | null)?.message ?? "")
    if (/column/i.test(msg) && /user_id/i.test(msg)) {
      return {
        ok: false as const,
        status: 500 as const,
        feil:
          "Medlemsregister-tabellen mangler feltet user_id. Kjør dette i Supabase (SQL Editor):\n\n" +
          "alter table public.medlemmer add column if not exists user_id uuid;",
      }
    }
    if (/column/i.test(msg) && /aktiv/i.test(msg)) {
      return {
        ok: false as const,
        status: 500 as const,
        feil:
          "Medlemsregister-tabellen mangler feltet aktiv. Kjør dette i Supabase (SQL Editor):\n\n" +
          "alter table public.medlemmer add column if not exists aktiv boolean not null default true;",
      }
    }
    return { ok: false as const, status: 400 as const, feil: "Kunne ikke hente medlemsstatus." }
  }

  if (!data?.id) {
    return {
      ok: false as const,
      status: 404 as const,
      feil:
        "Fant ikke medlemskap. Medlemskap må være koblet til innlogging (user_id).\n\n" +
        `Innloggings-ID: ${auth.userId}\n` +
        `E-post: ${auth.email}\n\n` +
        "Hvis du nylig har blitt lagt inn manuelt, må en superbruker koble medlemskapet til innloggingen i medlemsregisteret.",
    }
  }
  if (data.aktiv === false) {
    return { ok: false as const, status: 403 as const, feil: "Du er meldt ut." }
  }

  return { ok: true as const, admin, medlemId: data.id as string }
}

export async function GET() {
  const auth = await getAuth()
  if (!auth.ok) return NextResponse.json({ ok: false, feil: auth.feil }, { status: auth.status })

  const gate = await requireAktivMedlem(auth)
  if (!gate.ok) return NextResponse.json({ ok: false, feil: gate.feil }, { status: gate.status })

  const { data, error } = await gate.admin
    .from("lodd_premier")
    .select("id, created_at, tittel, sponsor_navn, sponsor_orgnr, sponsor_nettsted, verdi, image_path, status, admin_notat")
    .eq("submitted_by_user_id", auth.userId)
    .order("created_at", { ascending: false })

  if (error) {
    const sf = schemaFeil((error as { message?: string } | null)?.message)
    return NextResponse.json(
      { ok: false, feil: sf ?? "Kunne ikke hente premier." },
      { status: sf ? 500 : 400 }
    )
  }

  const premier = (data ?? []).map((p) => ({
    ...p,
    image_url: null as string | null,
  }))

  for (const p of premier) {
    const path = String((p as { image_path?: unknown } | null)?.image_path ?? "").trim()
    if (!path) continue
    const { data: signed } = await gate.admin.storage
      .from("premier")
      .createSignedUrl(path, 60 * 15)
    if (signed?.signedUrl) {
      ;(p as { image_url: string | null }).image_url = signed.signedUrl
    }
  }

  return NextResponse.json({ ok: true, premier })
}

export async function POST(request: Request) {
  const auth = await getAuth()
  if (!auth.ok) return NextResponse.json({ ok: false, feil: auth.feil }, { status: auth.status })

  const gate = await requireAktivMedlem(auth)
  if (!gate.ok) return NextResponse.json({ ok: false, feil: gate.feil }, { status: gate.status })

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ ok: false, feil: "Ugyldig forespørsel (kunne ikke lese fil)." }, { status: 400 })
  }

  const tittel = String(form.get("tittel") ?? "").trim()
  const sponsorNavn = String(form.get("sponsorNavn") ?? "").trim()
  const sponsorOrgnr = String(form.get("sponsorOrgnr") ?? "").trim()
  const sponsorNettsted = String(form.get("sponsorNettsted") ?? "").trim()
  const verdiRaw = String(form.get("verdi") ?? "").trim()
  const verdi = verdiRaw ? Number(verdiRaw.replace(",", ".")) : null

  if (!tittel) {
    return NextResponse.json({ ok: false, feil: "Skriv inn tittel på premien." }, { status: 400 })
  }
  if (verdi != null && (!Number.isFinite(verdi) || verdi <= 0)) {
    return NextResponse.json({ ok: false, feil: "Ugyldig verdi." }, { status: 400 })
  }

  const file = form.get("bilde")
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, feil: "Legg ved et bilde av premien." }, { status: 400 })
  }

  const contentType = String(file.type ?? "")
  if (!contentType.startsWith("image/")) {
    return NextResponse.json({ ok: false, feil: "Bildefilen må være et bilde (image/*)." }, { status: 400 })
  }

  const maxBytes = 6 * 1024 * 1024
  if (file.size > maxBytes) {
    return NextResponse.json({ ok: false, feil: "Bildet er for stort. Prøv et mindre bilde." }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg"
  const path = `premier/${auth.userId}/${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await gate.admin.storage
    .from("premier")
    .upload(path, bytes, { contentType, upsert: false })

  if (uploadError) {
    return NextResponse.json(
      { ok: false, feil: "Kunne ikke lagre bildet. Sjekk at storage-bucketen 'premier' finnes (private)." },
      { status: 400 }
    )
  }

  try {
    await arkiverTilMediaBibliotek(gate.admin, {
      name: file.name,
      type: file.type,
      size: file.size,
      bytes: arrayBuffer,
    })
  } catch {}

  const { data: inserted, error } = await gate.admin
    .from("lodd_premier")
    .insert({
      submitted_by_user_id: auth.userId,
      submitted_by_epost: auth.email,
      tittel,
      sponsor_navn: sponsorNavn || null,
      sponsor_orgnr: sponsorOrgnr || null,
      sponsor_nettsted: sponsorNettsted || null,
      verdi: verdi == null ? null : verdi,
      image_path: path,
      status: "arkiv",
    })
    .select("id")
    .maybeSingle()

  if (error) {
    const sf = schemaFeil((error as { message?: string } | null)?.message)
    return NextResponse.json(
      { ok: false, feil: sf ?? "Kunne ikke lagre premien." },
      { status: sf ? 500 : 400 }
    )
  }

  return NextResponse.json({ ok: true, id: inserted?.id ?? null })
}
