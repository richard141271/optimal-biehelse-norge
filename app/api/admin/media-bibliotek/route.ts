import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

const bucket = "media-bibliotek"

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

async function requireAdmin() {
  const auth = await getAuth()
  if (!auth.ok) return auth

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return { ok: false as const, status: 500 as const, feil: "Mangler SUPABASE_SERVICE_ROLE_KEY." }
  }

  const admin = createClient<Db>(auth.supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { data, error } = await admin.from("medlemmer").select("role, aktiv").eq("user_id", auth.userId).maybeSingle()
  if (error) return { ok: false as const, status: 400 as const, feil: "Kunne ikke hente tilgang." }
  if ((data as { aktiv?: unknown } | null)?.aktiv === false) return { ok: false as const, status: 403 as const, feil: "Ingen tilgang." }

  const role = String((data as { role?: unknown } | null)?.role ?? "").trim().toLowerCase()
  if (role !== "admin" && role !== "superadmin") return { ok: false as const, status: 403 as const, feil: "Ingen tilgang." }

  return { ok: true as const, admin, role: role as "admin" | "superadmin", email: auth.email }
}

async function ensureBucket(admin: AdminClient) {
  const { error } = await admin.storage.createBucket(bucket, { public: false })
  if (!error) return { ok: true as const }
  const msg = String((error as { message?: string } | null)?.message ?? "")
  if (/(exists|already|duplicate|conflict|409)/i.test(msg)) return { ok: true as const }
  return { ok: false as const }
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
  if (t.includes("heic")) return "heic"
  if (t.includes("heif")) return "heif"
  if (t.includes("mp4")) return "mp4"
  if (t.includes("quicktime") || t.includes("mov")) return "mov"
  if (t.includes("webm")) return "webm"
  return "bin"
}

export async function GET(request: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ ok: false, feil: gate.feil }, { status: gate.status })
  const admin = gate.admin as AdminClient

  const url = new URL(request.url)
  const action = String(url.searchParams.get("action") ?? "").trim() || "list"

  const bucketOk = await ensureBucket(admin)
  if (!bucketOk.ok) return NextResponse.json({ ok: false, feil: "Storage er ikke satt opp." }, { status: 500 })

  if (action === "signed") {
    const path = String(url.searchParams.get("path") ?? "").trim()
    if (!path) return NextResponse.json({ ok: false, feil: "Mangler path." }, { status: 400 })
    const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, 60 * 15)
    if (error) {
      const msg = String((error as { message?: unknown } | null)?.message ?? "").trim()
      return NextResponse.json({ ok: false, feil: msg ? `Kunne ikke lage lenke: ${msg}` : "Kunne ikke lage lenke." }, { status: 400 })
    }
    const signedUrl = String((data as { signedUrl?: unknown } | null)?.signedUrl ?? "")
    if (!signedUrl) return NextResponse.json({ ok: false, feil: "Kunne ikke lage lenke." }, { status: 400 })
    return NextResponse.json({ ok: true, signedUrl })
  }

  const rawLimit = Number(url.searchParams.get("limit") ?? 100)
  const rawOffset = Number(url.searchParams.get("offset") ?? 0)
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(500, Math.trunc(rawLimit))) : 100
  const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.trunc(rawOffset)) : 0

  const { data, error } = await admin.storage.from(bucket).list("", {
    limit,
    offset,
    sortBy: { column: "name", order: "desc" },
  })
  if (error) return NextResponse.json({ ok: false, feil: "Kunne ikke hente filer." }, { status: 400 })

  const files = (data ?? [])
    .map((o) => {
      const name = String((o as { name?: unknown } | null)?.name ?? "").trim()
      if (!name) return null
      const meta = (o as { metadata?: unknown } | null)?.metadata as Record<string, unknown> | null
      const mimetype = String(meta?.mimetype ?? meta?.contentType ?? "").trim() || null
      const size = Number(meta?.size ?? (o as { metadata?: Record<string, unknown> } | null)?.metadata?.size ?? 0)
      return {
        path: name,
        name,
        created_at: String((o as { created_at?: unknown } | null)?.created_at ?? "") || null,
        updated_at: String((o as { updated_at?: unknown } | null)?.updated_at ?? "") || null,
        last_accessed_at: String((o as { last_accessed_at?: unknown } | null)?.last_accessed_at ?? "") || null,
        size: Number.isFinite(size) ? Math.trunc(size) : null,
        mimetype,
      }
    })
    .filter(Boolean)

  return NextResponse.json({ ok: true, files })
}

export async function POST(request: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ ok: false, feil: gate.feil }, { status: gate.status })
  const admin = gate.admin as AdminClient

  const bucketOk = await ensureBucket(admin)
  if (!bucketOk.ok) return NextResponse.json({ ok: false, feil: "Storage er ikke satt opp." }, { status: 500 })

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ ok: false, feil: "Ugyldig forespørsel." }, { status: 400 })
  }

  const rawFiles = form.getAll("files")
  const files = rawFiles.filter((f) => f instanceof File && f.size > 0) as File[]
  if (!files.length) return NextResponse.json({ ok: false, feil: "Ingen filer valgt." }, { status: 400 })

  for (const f of files) {
    const t = String(f.type || "")
    if (!t.startsWith("image/") && !t.startsWith("video/")) {
      return NextResponse.json({ ok: false, feil: "Kun bilder og videoer er tillatt." }, { status: 400 })
    }
    if (f.size > 150 * 1024 * 1024) {
      return NextResponse.json({ ok: false, feil: "En fil er for stor (maks 150 MB)." }, { status: 400 })
    }
  }

  const uploaded: string[] = []
  try {
    for (const f of files) {
      const originalName = String(f.name ?? "fil").trim()
      const dot = originalName.lastIndexOf(".")
      const baseName = dot > 0 ? originalName.slice(0, dot) : originalName
      const base = toSafeStorageKey(baseName || "fil")
      const ext = extFromNameAndType(f.name, f.type)
      const path = `${base}__${Math.trunc(f.size)}.${ext}`
      const body = await f.arrayBuffer()
      const { error } = await admin.storage.from(bucket).upload(path, body, {
        upsert: false,
        contentType: f.type || undefined,
      })
      if (error) {
        const msg = String((error as { message?: unknown } | null)?.message ?? "")
        if (/(exists|already|duplicate|conflict|409)/i.test(msg)) {
          continue
        }
        throw new Error(msg || "Kunne ikke laste opp.")
      }
      uploaded.push(path)
    }
  } catch (e) {
    if (uploaded.length) await admin.storage.from(bucket).remove(uploaded)
    const msg = String((e as { message?: unknown } | null)?.message ?? "")
    return NextResponse.json({ ok: false, feil: msg || "Kunne ikke laste opp." }, { status: 400 })
  }

  return NextResponse.json({ ok: true, uploaded })
}

export async function DELETE(request: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ ok: false, feil: gate.feil }, { status: gate.status })
  const admin = gate.admin as AdminClient

  const bucketOk = await ensureBucket(admin)
  if (!bucketOk.ok) return NextResponse.json({ ok: false, feil: "Storage er ikke satt opp." }, { status: 500 })

  const url = new URL(request.url)
  const path = String(url.searchParams.get("path") ?? "").trim()
  if (!path) return NextResponse.json({ ok: false, feil: "Mangler path." }, { status: 400 })
  if (path.includes("..")) return NextResponse.json({ ok: false, feil: "Ugyldig path." }, { status: 400 })

  const { error } = await admin.storage.from(bucket).remove([path])
  if (error) {
    const msg = String((error as { message?: unknown } | null)?.message ?? "")
    return NextResponse.json({ ok: false, feil: msg ? `Kunne ikke slette: ${msg}` : "Kunne ikke slette." }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
