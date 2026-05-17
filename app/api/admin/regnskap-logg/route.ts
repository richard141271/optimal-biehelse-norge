import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

const loggSchemaFeil =
  "Regnskap mangler logg/arkiv i Supabase. Kjør denne SQL-en i Supabase (SQL Editor), og prøv igjen:\n\n" +
  "create table if not exists public.regnskap_logg (\n" +
  "  id uuid primary key default gen_random_uuid(),\n" +
  "  created_at timestamptz not null default now(),\n" +
  "  actor_epost text,\n" +
  "  actor_role text,\n" +
  "  action text not null,\n" +
  "  entity_type text not null,\n" +
  "  entity_id text,\n" +
  "  before jsonb,\n" +
  "  after jsonb,\n" +
  "  korreksjon_notat text,\n" +
  "  korreksjon_at timestamptz,\n" +
  "  korreksjon_av_epost text\n" +
  ");\n" +
  "create index if not exists regnskap_logg_created_at_idx on public.regnskap_logg (created_at desc);\n" +
  "create index if not exists regnskap_logg_entity_idx on public.regnskap_logg (entity_type, entity_id);\n"

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

  const admin = createClient(auth.supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { data, error } = await admin
    .from("medlemmer")
    .select("role, aktiv")
    .eq("user_id", auth.userId)
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
    return { ok: false as const, status: 400 as const, feil: "Kunne ikke hente tilgang." }
  }
  if (data?.aktiv === false) {
    return { ok: false as const, status: 403 as const, feil: "Ingen tilgang." }
  }

  const role = String((data as { role?: unknown } | null)?.role ?? "")
  if (role !== "admin" && role !== "superadmin") {
    const ownerEmail = String(
      process.env.ADMIN_SUPERADMIN_EMAIL ?? process.env.ADMIN_BOOTSTRAP_EMAIL ?? ""
    )
      .trim()
      .toLowerCase()
    if (ownerEmail && auth.email === ownerEmail) {
      return { ok: true as const, admin, role: "superadmin" as const, email: auth.email }
    }
    return { ok: false as const, status: 403 as const, feil: "Ingen tilgang." }
  }

  return { ok: true as const, admin, role: role as "admin" | "superadmin", email: auth.email }
}

function isLoggSchemaError(message: string) {
  const m = message.toLowerCase()
  if (m.includes("42p01")) return true
  if (m.includes("regnskap_logg") && m.includes("does not exist")) return true
  if (m.includes("schema cache") && m.includes("regnskap_logg")) return true
  if (m.includes("column") && m.includes("regnskap_logg")) return true
  return false
}

export async function GET(request: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ ok: false, feil: gate.feil }, { status: gate.status })

  const url = new URL(request.url)
  const limitRaw = Number(url.searchParams.get("limit") ?? "200")
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.floor(limitRaw))) : 200

  const { data, error } = await gate.admin
    .from("regnskap_logg")
    .select(
      "id, created_at, actor_epost, actor_role, action, entity_type, entity_id, before, after, korreksjon_notat, korreksjon_at, korreksjon_av_epost"
    )
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    const msg = String((error as { message?: string } | null)?.message ?? "")
    if (isLoggSchemaError(msg)) {
      return NextResponse.json({ ok: false, feil: loggSchemaFeil }, { status: 500 })
    }
    return NextResponse.json({ ok: false, feil: "Kunne ikke hente regnskapslogg." }, { status: 400 })
  }

  return NextResponse.json({ ok: true, logg: data ?? [], role: gate.role })
}

export async function PATCH(request: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ ok: false, feil: gate.feil }, { status: gate.status })
  if (gate.role !== "superadmin") {
    return NextResponse.json({ ok: false, feil: "Kun superbruker kan korrigere logg." }, { status: 403 })
  }

  let payload: { id?: string; notat?: string | null }
  try {
    payload = (await request.json()) as { id?: string; notat?: string | null }
  } catch {
    return NextResponse.json({ ok: false, feil: "Ugyldig JSON." }, { status: 400 })
  }

  const id = String(payload.id ?? "").trim()
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  if (!id || !isUuid) {
    return NextResponse.json({ ok: false, feil: "Ugyldig id." }, { status: 400 })
  }

  const note = payload.notat == null ? null : String(payload.notat).trim()
  const { error } = await gate.admin
    .from("regnskap_logg")
    .update({
      korreksjon_notat: note || null,
      korreksjon_at: note ? new Date().toISOString() : null,
      korreksjon_av_epost: note ? gate.email : null,
    })
    .eq("id", id)

  if (error) {
    const msg = String((error as { message?: string } | null)?.message ?? "")
    if (isLoggSchemaError(msg)) {
      return NextResponse.json({ ok: false, feil: loggSchemaFeil }, { status: 500 })
    }
    return NextResponse.json({ ok: false, feil: "Kunne ikke oppdatere logg." }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ ok: false, feil: gate.feil }, { status: gate.status })
  if (gate.role !== "superadmin") {
    return NextResponse.json({ ok: false, feil: "Kun superbruker kan slette logg." }, { status: 403 })
  }

  let payload: { id?: string }
  try {
    payload = (await request.json()) as { id?: string }
  } catch {
    return NextResponse.json({ ok: false, feil: "Ugyldig JSON." }, { status: 400 })
  }

  const id = String(payload.id ?? "").trim()
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  if (!id || !isUuid) {
    return NextResponse.json({ ok: false, feil: "Ugyldig id." }, { status: 400 })
  }

  const { error } = await gate.admin.from("regnskap_logg").delete().eq("id", id)
  if (error) {
    const msg = String((error as { message?: string } | null)?.message ?? "")
    if (isLoggSchemaError(msg)) {
      return NextResponse.json({ ok: false, feil: loggSchemaFeil }, { status: 500 })
    }
    return NextResponse.json({ ok: false, feil: "Kunne ikke slette logg." }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
