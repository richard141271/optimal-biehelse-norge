import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { hasPermission, normalizeRole } from "@/lib/roller"

const TABLE = "butikkpartner_avtale"

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

const SCHEMA_SQL =
  "Tabellen for butikkpartneravtalen mangler. Kjør denne SQL-en i Supabase (SQL Editor), og prøv igjen:\n\n" +
  "create table if not exists public." +
  TABLE +
  " (\n" +
  "  id int primary key default 1,\n" +
  "  innhold text not null default '',\n" +
  "  oppdatert_at timestamptz not null default now(),\n" +
  "  oppdatert_av text\n" +
  ");\n"

function isMissingTable(message: string) {
  return /relation/i.test(message) && new RegExp(TABLE, "i").test(message)
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

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

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
    ownerEmail && email === ownerEmail ? "superadmin" : normalizeRole(roleRow?.role)

  if (!hasPermission(role, "admin_home")) {
    return { ok: false as const, status: 403 as const, feil: "Ingen tilgang." }
  }

  return { ok: true as const, userId, email, role, admin, supabaseUrl }
}

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return NextResponse.json({ ok: false, feil: auth.feil }, { status: auth.status })
  }
  const { admin } = auth

  const { data, error } = await admin
    .from(TABLE)
    .select("innhold, oppdatert_at, oppdatert_av")
    .eq("id", 1)
    .maybeSingle()

  if (error) {
    if (isMissingTable(String(error.message ?? ""))) {
      return NextResponse.json({ ok: false, feil: SCHEMA_SQL }, { status: 500 })
    }
    return NextResponse.json(
      { ok: false, feil: "Kunne ikke hente butikkpartneravtalen." },
      { status: 400 },
    )
  }

  return NextResponse.json({
    ok: true,
    innhold: String((data as { innhold?: string } | null)?.innhold ?? ""),
    oppdatert_at: (data as { oppdatert_at?: string | null } | null)?.oppdatert_at ?? null,
    oppdatert_av: (data as { oppdatert_av?: string | null } | null)?.oppdatert_av ?? null,
  })
}

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return NextResponse.json({ ok: false, feil: auth.feil }, { status: auth.status })
  }
  const { admin, email } = auth

  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json(
      { ok: false, feil: "Ugyldig forespørsel." },
      { status: 400 },
    )
  }

  const innhold = String(body.innhold ?? "")
  if (innhold.length > 200_000) {
    return NextResponse.json(
      { ok: false, feil: "Avtalen er for lang (maks 200 000 tegn)." },
      { status: 400 },
    )
  }

  const { data, error } = await admin
    .from(TABLE)
    .upsert(
      { id: 1, innhold, oppdatert_av: email, oppdatert_at: new Date().toISOString() },
      { onConflict: "id" },
    )
    .select("innhold, oppdatert_at, oppdatert_av")
    .maybeSingle()

  if (error) {
    if (isMissingTable(String(error.message ?? ""))) {
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
