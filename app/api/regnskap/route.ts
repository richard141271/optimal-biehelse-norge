import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export const dynamic = "force-dynamic"

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function parseMoney(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const normalized = trimmed.replace(/\s/g, "").replace(/\./g, "").replace(",", ".")
  const n = Number(normalized)
  if (!Number.isFinite(n)) return null
  return n
}

async function getLoggedInEmail() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) return null

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
  const email = (user?.email ?? "").trim().toLowerCase()
  return email || null
}

const schemaFeil =
  "Regnskap-tabellen i Supabase mangler felter. Kjør denne SQL-en i Supabase (SQL Editor), og prøv igjen:\n\n" +
  "create table if not exists public.regnskap_poster (\n" +
  "  id uuid primary key default gen_random_uuid(),\n" +
  "  created_at timestamptz not null default now(),\n" +
  "  dato date not null,\n" +
  "  type text not null,\n" +
  "  belop numeric not null,\n" +
  "  motpart text,\n" +
  "  vare text,\n" +
  "  notat text,\n" +
  "  bilag_path text,\n" +
  "  bilag_ocr_text text,\n" +
  "  kilde text\n" +
  ");\n"

const bucket = "bilag"

function describeError(error: unknown) {
  if (!error) return null
  if (typeof error === "string") return error
  if (error instanceof Error) return error.message || "Ukjent feil"
  const e = error as Record<string, unknown>
  const message = typeof e.message === "string" ? e.message : ""
  const errorCode = typeof e.error === "string" ? e.error : ""
  const statusCode =
    typeof e.statusCode === "number"
      ? String(e.statusCode)
      : typeof e.status === "number"
        ? String(e.status)
        : ""
  const parts = [message, errorCode && `code=${errorCode}`, statusCode && `status=${statusCode}`]
    .filter(Boolean)
    .join(" ")
    .trim()
  return parts || "Ukjent feil"
}

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { ok: false, feil: "Supabase er ikke konfigurert. Legg inn miljøvariabler først." },
      { status: 500 }
    )
  }

  const email = await getLoggedInEmail()
  if (!email) {
    return NextResponse.json({ ok: false, feil: "Ikke innlogget." }, { status: 401 })
  }

  if (!serviceRoleKey) {
    return NextResponse.json(
      { ok: false, feil: "Regnskap i admin krever SUPABASE_SERVICE_ROLE_KEY i miljøvariabler." },
      { status: 500 }
    )
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { data: roleRow } = await admin
    .from("medlemmer")
    .select("role")
    .eq("epost", email)
    .maybeSingle()
  if (roleRow?.role !== "admin" && roleRow?.role !== "superadmin") {
    return NextResponse.json({ ok: false, feil: "Ingen tilgang." }, { status: 403 })
  }

  const { data, error } = await admin
    .from("regnskap_poster")
    .select("id, created_at, dato, type, belop, motpart, vare, notat, bilag_path, kilde")
    .order("dato", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500)

  if (error) {
    const msg = String((error as { message?: string } | null)?.message ?? "")
    if ((/relation/i.test(msg) && /regnskap_poster/i.test(msg)) || /42p01/i.test(msg)) {
      return NextResponse.json({ ok: false, feil: schemaFeil }, { status: 500 })
    }
    return NextResponse.json({ ok: false, feil: "Kunne ikke hente regnskap." }, { status: 400 })
  }

  const rows = (data ?? []) as Record<string, unknown>[]
  const result = await Promise.all(
    rows.map(async (r) => {
      const path = typeof r.bilag_path === "string" ? r.bilag_path : null
      if (!path) return { ...r, bilag_url: null }
      const { data: signed } = await admin.storage.from(bucket).createSignedUrl(path, 60)
      return { ...r, bilag_url: signed?.signedUrl ?? null }
    })
  )

  return NextResponse.json({ ok: true, poster: result })
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { ok: false, feil: "Supabase er ikke konfigurert. Legg inn miljøvariabler først." },
      { status: 500 }
    )
  }

  const email = await getLoggedInEmail()
  if (!email) {
    return NextResponse.json({ ok: false, feil: "Ikke innlogget." }, { status: 401 })
  }

  if (!serviceRoleKey) {
    return NextResponse.json(
      { ok: false, feil: "Regnskap i admin krever SUPABASE_SERVICE_ROLE_KEY i miljøvariabler." },
      { status: 500 }
    )
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { data: roleRow } = await admin
    .from("medlemmer")
    .select("role")
    .eq("epost", email)
    .maybeSingle()
  if (roleRow?.role !== "admin" && roleRow?.role !== "superadmin") {
    return NextResponse.json({ ok: false, feil: "Ingen tilgang." }, { status: 403 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json(
      {
        ok: false,
        feil: "Ugyldig forespørsel (kunne ikke lese fil). Hvis du laster opp bilag: prøv et mindre bilde.",
      },
      { status: 400 }
    )
  }

  const type = String(form.get("type") ?? "").trim()
  const dato = String(form.get("dato") ?? "").trim() || todayIso()
  const belop = parseMoney(String(form.get("belop") ?? ""))
  const motpart = String(form.get("motpart") ?? "").trim()
  const vare = String(form.get("vare") ?? "").trim()
  const notat = String(form.get("notat") ?? "").trim()
  const bilagTekst = String(form.get("bilagTekst") ?? "").trim()
  const bilag = form.get("bilag")

  if (type !== "utgift" && type !== "inntekt") {
    return NextResponse.json({ ok: false, feil: "Velg type (utgift/inntekt)." }, { status: 400 })
  }

  if (!belop && belop !== 0) {
    return NextResponse.json({ ok: false, feil: "Skriv inn et gyldig beløp." }, { status: 400 })
  }

  let bilagPath: string | null = null
  if (bilag instanceof File && bilag.size > 0) {
    if (bilag.size > 4 * 1024 * 1024) {
      return NextResponse.json(
        { ok: false, feil: "Bilag er for stort (maks 4 MB)." },
        { status: 400 }
      )
    }

    const { error: createBucketError } = await admin.storage.createBucket(bucket, {
      public: false,
    })
    if (createBucketError) {
      const msg = String((createBucketError as { message?: string } | null)?.message ?? "")
      if (!/exists/i.test(msg) && !/already/i.test(msg)) {
        return NextResponse.json(
          {
            ok: false,
            feil: "Lagring av bilag er ikke satt opp i Supabase Storage. Lag en bucket som heter 'bilag' (private), og prøv igjen.",
          },
          { status: 500 }
        )
      }
    }

    const ext = (bilag.type || "").toLowerCase().includes("png")
      ? "png"
      : (bilag.type || "").toLowerCase().includes("webp")
        ? "webp"
        : "jpg"
    bilagPath = `${todayIso()}/${crypto.randomUUID()}.${ext}`
    const body = await bilag.arrayBuffer()
    const { error: uploadError } = await admin.storage
      .from(bucket)
      .upload(bilagPath, body, { upsert: false, contentType: bilag.type || undefined })
    if (uploadError) {
      const msg = describeError(uploadError)
      return NextResponse.json(
        {
          ok: false,
          feil: msg ? `Kunne ikke laste opp bilag: ${msg}` : "Kunne ikke laste opp bilag.",
        },
        { status: 400 }
      )
    }
  }

  const { error } = await admin.from("regnskap_poster").insert({
    type,
    dato,
    belop,
    motpart: motpart || null,
    vare: vare || null,
    notat: notat || null,
    bilag_path: bilagPath,
    bilag_ocr_text: bilagTekst || null,
    kilde: "manuelt",
  })

  if (error) {
    const msg = String((error as { message?: string } | null)?.message ?? "")
    if (
      (/(relation|column)/i.test(msg) && /regnskap_poster/i.test(msg)) ||
      /42p01/i.test(msg) ||
      /bilag_ocr_text/i.test(msg)
    ) {
      if (bilagPath) {
        await admin.storage.from(bucket).remove([bilagPath])
      }
      return NextResponse.json({ ok: false, feil: schemaFeil }, { status: 500 })
    }
    if (bilagPath) {
      await admin.storage.from(bucket).remove([bilagPath])
    }
    return NextResponse.json({ ok: false, feil: "Kunne ikke lagre regnskapspost." }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
