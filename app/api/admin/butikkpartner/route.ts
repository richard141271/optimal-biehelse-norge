import { NextResponse } from "next/server"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { hasPermission, normalizeRole } from "@/lib/roller"

type Db = {
  public: {
    Tables: Record<
      string,
      {
        Row: Record<string, unknown>
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
        Relationships: unknown[]
      }
    >
  }
}

type AdminClient = SupabaseClient<Db>

const TABLE_AVTALE = "butikkpartner_avtale"
const TABLE_BILDER = "butikkpartner_bilder"
const BUCKET = "butikkpartner"

export const IMAGE_SLOTS = [
  "obno_hero",
  "prosjekt",
  "bievenn_qr",
  "bievenn_bilde",
  "lek_logo",
] as const

export type ImageSlot = (typeof IMAGE_SLOTS)[number]

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

const SCHEMA_SQL =
  "Mangler tabeller for butikkpartner. Kjør denne SQL-en i Supabase (SQL Editor), og prøv igjen:\n\n" +
  "create table if not exists public." +
  TABLE_AVTALE +
  " (\n" +
  "  id int primary key default 1,\n" +
  "  innhold text not null default '',\n" +
  "  oppdatert_at timestamptz not null default now(),\n" +
  "  oppdatert_av text\n" +
  ");\n\n" +
  "create table if not exists public." +
  TABLE_BILDER +
  " (\n" +
  "  slot text primary key,\n" +
  "  image_path text not null,\n" +
  "  oppdatert_at timestamptz not null default now(),\n" +
  "  oppdatert_av text\n" +
  ");\n"

function isMissingTable(message: string, table: string) {
  return /relation/i.test(message) && new RegExp(table, "i").test(message)
}

function toSafeStorageKey(v: string) {
  const s = String(v ?? "").trim()
  if (!s) return "x"
  const cleaned = s
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
  return cleaned || "x"
}

function extFromNameAndType(filename: string, type: string) {
  const name = String(filename ?? "").trim()
  const last = name.lastIndexOf(".")
  const ext = last > 0 ? name.slice(last + 1).trim().toLowerCase() : ""
  if (ext && ext.length <= 10) return ext
  const t = String(type ?? "").toLowerCase()
  if (t.includes("png")) return "png"
  if (t.includes("webp")) return "webp"
  if (t.includes("jpeg") || t.includes("jpg")) return "jpg"
  if (t.includes("svg")) return "svg"
  if (t.includes("gif")) return "gif"
  return "bin"
}

async function requireAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false as const, status: 500 as const, feil: "Supabase er ikke konfigurert." }
  }
  if (!serviceRoleKey) {
    return { ok: false as const, status: 500 as const, feil: "Mangler SUPABASE_SERVICE_ROLE_KEY." }
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // ignore
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

  const admin = createClient<Db>(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  const { data: roleRow } = await admin
    .from("medlemmer")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle()

  const ownerEmail = String(
    process.env.ADMIN_SUPERADMIN_EMAIL ?? process.env.ADMIN_BOOTSTRAP_EMAIL ?? "",
  )
    .trim()
    .toLowerCase()
  const role =
    ownerEmail && email === ownerEmail
      ? "superadmin"
      : normalizeRole(String((roleRow as { role?: unknown } | null)?.role ?? ""))

  if (!hasPermission(role, "admin_home")) {
    return { ok: false as const, status: 403 as const, feil: "Ingen tilgang." }
  }

  return { ok: true as const, userId, email, role, admin, supabaseUrl }
}

async function ensureBucket(admin: AdminClient) {
  const { error } = await admin.storage.createBucket(BUCKET, { public: true })
  if (!error) return { ok: true as const }
  const msg = String((error as { message?: string } | null)?.message ?? "")
  if (/(exists|already|duplicate|conflict|409)/i.test(msg)) return { ok: true as const }
  return { ok: false as const }
}

function publicImageUrl(supabaseUrl: string, path: string) {
  if (!path) return ""
  const base = supabaseUrl.replace(/\/$/, "")
  return `${base}/storage/v1/object/public/${BUCKET}/${path}`
}

async function fetchImages(admin: AdminClient) {
  const { data, error } = await admin.from(TABLE_BILDER).select("slot, image_path")
  if (error) {
    if (isMissingTable(String(error.message ?? ""), TABLE_BILDER)) return { ok: false as const, needSchema: true }
    return { ok: false as const, needSchema: false }
  }
  const map: Record<string, string> = {}
  for (const row of (data ?? []) as { slot: string; image_path: string }[]) {
    map[row.slot] = row.image_path
  }
  return { ok: true as const, images: map }
}

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return NextResponse.json({ ok: false, feil: auth.feil }, { status: auth.status })
  }
  const { admin, supabaseUrl } = auth

  const { data, error } = await admin
    .from(TABLE_AVTALE)
    .select("innhold, oppdatert_at, oppdatert_av")
    .eq("id", 1)
    .maybeSingle()

  if (error) {
    if (isMissingTable(String(error.message ?? ""), TABLE_AVTALE)) {
      return NextResponse.json({ ok: false, feil: SCHEMA_SQL }, { status: 500 })
    }
    return NextResponse.json(
      { ok: false, feil: "Kunne ikke hente butikkpartneravtalen." },
      { status: 400 },
    )
  }

  const imgRes = await fetchImages(admin)
  if (!imgRes.ok) {
    if (imgRes.needSchema) {
      return NextResponse.json({ ok: false, feil: SCHEMA_SQL }, { status: 500 })
    }
    return NextResponse.json(
      { ok: false, feil: "Kunne ikke hente bilder." },
      { status: 400 },
    )
  }

  const bilder: Record<string, string> = {}
  for (const slot of IMAGE_SLOTS) {
    const path = imgRes.images[slot]
    bilder[slot] = path ? publicImageUrl(supabaseUrl, path) : ""
  }

  return NextResponse.json({
    ok: true,
    innhold: String((data as { innhold?: string } | null)?.innhold ?? ""),
    oppdatert_at: (data as { oppdatert_at?: string | null } | null)?.oppdatert_at ?? null,
    oppdatert_av: (data as { oppdatert_av?: string | null } | null)?.oppdatert_av ?? null,
    bilder,
  })
}

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return NextResponse.json({ ok: false, feil: auth.feil }, { status: auth.status })
  }
  const { admin, email, supabaseUrl } = auth

  const contentType = request.headers.get("content-type") ?? ""
  const isFormData = contentType.includes("multipart/form-data")

  if (isFormData) {
    const bucketOk = await ensureBucket(admin)
    if (!bucketOk.ok) {
      return NextResponse.json({ ok: false, feil: "Storage er ikke satt opp." }, { status: 500 })
    }

    let form: FormData
    try {
      form = await request.formData()
    } catch {
      return NextResponse.json({ ok: false, feil: "Ugyldig forespørsel." }, { status: 400 })
    }

    const slot = String(form.get("slot") ?? "").trim()
    if (!IMAGE_SLOTS.includes(slot as ImageSlot)) {
      return NextResponse.json({ ok: false, feil: "Ugyldig bildeplass." }, { status: 400 })
    }

    const file = form.get("file")
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ ok: false, feil: "Ingen fil valgt." }, { status: 400 })
    }
    const t = String(file.type || "")
    if (!t.startsWith("image/")) {
      return NextResponse.json({ ok: false, feil: "Kun bilder er tillatt." }, { status: 400 })
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ ok: false, feil: "Bildet er for stort (maks 10 MB)." }, { status: 400 })
    }

    const ext = extFromNameAndType(file.name, file.type)
    const base = toSafeStorageKey(slot)
    const unique = Math.random().toString(36).slice(2, 10)
    const path = `${base}-${unique}.${ext}`
    const body = await file.arrayBuffer()

    const { data: oldRow, error: oldErr } = await admin
      .from(TABLE_BILDER)
      .select("image_path")
      .eq("slot", slot)
      .maybeSingle()
    const oldPath = oldErr ? "" : String((oldRow as { image_path?: string } | null)?.image_path ?? "")

    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(path, body, { upsert: false, contentType: file.type || undefined })

    if (uploadError) {
      const msg = String((uploadError as { message?: string } | null)?.message ?? "")
      return NextResponse.json(
        { ok: false, feil: msg ? `Kunne ikke laste opp: ${msg}` : "Kunne ikke laste opp." },
        { status: 400 },
      )
    }

    const { error: dbError } = await admin
      .from(TABLE_BILDER)
      .upsert(
        {
          slot,
          image_path: path,
          oppdatert_av: email,
          oppdatert_at: new Date().toISOString(),
        } as unknown as never,
        { onConflict: "slot" },
      )

    if (dbError) {
      await admin.storage.from(BUCKET).remove([path]).catch(() => {})
      if (isMissingTable(String(dbError.message ?? ""), TABLE_BILDER)) {
        return NextResponse.json({ ok: false, feil: SCHEMA_SQL }, { status: 500 })
      }
      return NextResponse.json(
        { ok: false, feil: "Kunne ikke lagre bilde." },
        { status: 400 },
      )
    }

    if (oldPath && oldPath !== path) {
      await admin.storage.from(BUCKET).remove([oldPath]).catch(() => {})
    }

    return NextResponse.json({
      ok: true,
      slot,
      imageUrl: publicImageUrl(supabaseUrl, path),
    })
  }

  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, feil: "Ugyldig forespørsel." }, { status: 400 })
  }

  const innhold = String(body.innhold ?? "")
  if (innhold.length > 200_000) {
    return NextResponse.json(
      { ok: false, feil: "Avtalen er for lang (maks 200 000 tegn)." },
      { status: 400 },
    )
  }

  const { data, error } = await admin
    .from(TABLE_AVTALE)
    .upsert(
      { id: 1, innhold, oppdatert_av: email, oppdatert_at: new Date().toISOString() } as unknown as never,
      { onConflict: "id" },
    )
    .select("innhold, oppdatert_at, oppdatert_av")
    .maybeSingle()

  if (error) {
    if (isMissingTable(String(error.message ?? ""), TABLE_AVTALE)) {
      return NextResponse.json({ ok: false, feil: SCHEMA_SQL }, { status: 500 })
    }
    return NextResponse.json(
      { ok: false, feil: "Kunne ikke lagre butikkpartneravtalen." },
      { status: 400 },
    )
  }

  return NextResponse.json({
    ok: true,
    innhold: String((data as { innhold?: string } | null)?.innhold ?? innhold),
    oppdatert_at: (data as { oppdatert_at?: string | null } | null)?.oppdatert_at ?? null,
    oppdatert_av: (data as { oppdatert_av?: string | null } | null)?.oppdatert_av ?? null,
  })
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return NextResponse.json({ ok: false, feil: auth.feil }, { status: auth.status })
  }
  const { admin } = auth

  const url = new URL(request.url)
  const slot = String(url.searchParams.get("slot") ?? "").trim()
  if (!IMAGE_SLOTS.includes(slot as ImageSlot)) {
    return NextResponse.json({ ok: false, feil: "Ugyldig bildeplass." }, { status: 400 })
  }

  const { data, error: fetchErr } = await admin
    .from(TABLE_BILDER)
    .select("image_path")
    .eq("slot", slot)
    .maybeSingle()

  if (fetchErr && !isMissingTable(String(fetchErr.message ?? ""), TABLE_BILDER)) {
    return NextResponse.json({ ok: false, feil: "Kunne ikke finne bilde." }, { status: 400 })
  }

  const path = String((data as { image_path?: string } | null)?.image_path ?? "")
  if (path) {
    await admin.storage.from(BUCKET).remove([path]).catch(() => {})
  }

  const { error } = await admin.from(TABLE_BILDER).delete().eq("slot", slot)
  if (error && !isMissingTable(String(error.message ?? ""), TABLE_BILDER)) {
    return NextResponse.json({ ok: false, feil: "Kunne ikke slette bilde." }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
