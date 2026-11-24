import { NextResponse } from "next/server"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { hasPermission, normalizeRole } from "@/lib/roller"

const TABLE = "butikkpartner_sponsorer"
const BUCKET = "butikkpartner"
const SPONSOR_FOLDER = "sponsorer"

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

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

const SCHEMA_SQL =
  "Tabellen for sponsorlogoer mangler. Kjør denne SQL-en i Supabase (SQL Editor), og prøv igjen:\n\n" +
  "create table if not exists public." +
  TABLE +
  " (\n" +
  "  id uuid primary key default gen_random_uuid(),\n" +
  "  navn text not null default '',\n" +
  "  logo_path text not null,\n" +
  "  sort_order int not null default 0,\n" +
  "  oppdatert_at timestamptz not null default now(),\n" +
  "  oppdatert_av text\n" +
  ");\n"

function isMissingTable(message: string) {
  return /relation/i.test(message) && new RegExp(TABLE, "i").test(message)
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

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return NextResponse.json({ ok: false, feil: auth.feil }, { status: auth.status })
  }
  const { admin, supabaseUrl } = auth

  const { data, error } = await admin
    .from(TABLE)
    .select("id, navn, logo_path, sort_order")
    .order("sort_order", { ascending: true })
    .order("oppdatert_at", { ascending: false })

  if (error) {
    if (isMissingTable(String(error.message ?? ""))) {
      return NextResponse.json({ ok: false, feil: SCHEMA_SQL }, { status: 500 })
    }
    return NextResponse.json({ ok: false, feil: "Kunne ikke hente sponsorlogoer." }, { status: 400 })
  }

  const sponsorer = ((data ?? []) as { id: string; navn: string; logo_path: string; sort_order: number }[]).map(
    (s) => ({
      id: s.id,
      navn: s.navn,
      logoUrl: publicImageUrl(supabaseUrl, s.logo_path),
      sort_order: s.sort_order,
    }),
  )

  return NextResponse.json({ ok: true, sponsorer })
}

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return NextResponse.json({ ok: false, feil: auth.feil }, { status: auth.status })
  }
  const { admin, email, supabaseUrl } = auth

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

  const navn = String(form.get("navn") ?? "").trim()
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
  const base = toSafeStorageKey(navn || "sponsor")
  const unique = Math.random().toString(36).slice(2, 10)
  const path = `${SPONSOR_FOLDER}/${base}-${unique}.${ext}`
  const body = await file.arrayBuffer()

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

  const { count } = await admin.from(TABLE).select("*", { count: "exact", head: true })
  const sortOrder = count ?? 0

  const { data, error: dbError } = await admin
    .from(TABLE)
    .insert(
      {
        navn: navn || "Sponsor",
        logo_path: path,
        sort_order: sortOrder,
        oppdatert_av: email,
        oppdatert_at: new Date().toISOString(),
      } as unknown as never,
    )
    .select("id, navn, logo_path, sort_order")
    .maybeSingle()

  if (dbError) {
    await admin.storage.from(BUCKET).remove([path]).catch(() => {})
    if (isMissingTable(String(dbError.message ?? ""))) {
      return NextResponse.json({ ok: false, feil: SCHEMA_SQL }, { status: 500 })
    }
    return NextResponse.json({ ok: false, feil: "Kunne ikke lagre sponsor." }, { status: 400 })
  }

  const row = data as { id: string; navn: string; logo_path: string; sort_order: number } | null
  return NextResponse.json({
    ok: true,
    sponsor: {
      id: row?.id ?? "",
      navn: row?.navn ?? navn,
      logoUrl: publicImageUrl(supabaseUrl, path),
      sort_order: row?.sort_order ?? sortOrder,
    },
  })
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return NextResponse.json({ ok: false, feil: auth.feil }, { status: auth.status })
  }
  const { admin } = auth

  const url = new URL(request.url)
  const id = String(url.searchParams.get("id") ?? "").trim()
  if (!id) {
    return NextResponse.json({ ok: false, feil: "Mangler id." }, { status: 400 })
  }

  const { data, error: fetchErr } = await admin
    .from(TABLE)
    .select("logo_path")
    .eq("id", id)
    .maybeSingle()

  if (fetchErr && !isMissingTable(String(fetchErr.message ?? ""))) {
    return NextResponse.json({ ok: false, feil: "Kunne ikke finne sponsor." }, { status: 400 })
  }

  const path = String((data as { logo_path?: string } | null)?.logo_path ?? "")
  if (path) {
    await admin.storage.from(BUCKET).remove([path]).catch(() => {})
  }

  const { error } = await admin.from(TABLE).delete().eq("id", id)
  if (error && !isMissingTable(String(error.message ?? ""))) {
    return NextResponse.json({ ok: false, feil: "Kunne ikke slette sponsor." }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
