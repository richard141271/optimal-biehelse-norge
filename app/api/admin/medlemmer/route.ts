import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { createClient } from "@supabase/supabase-js"

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

async function getCurrentUser() {
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

  const userId = user?.id ?? null
  const email = (user?.email ?? "").trim().toLowerCase()
  if (!userId || !email || !isValidEmail(email)) return null
  return { email, userId }
}

async function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return null
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })
}

async function requireAdmin() {
  const user = await getCurrentUser()
  if (!user) return { ok: false as const, status: 401 as const }

  const admin = await getAdminClient()
  if (!admin) return { ok: false as const, status: 500 as const }

  const { data, error } = await admin
    .from("medlemmer")
    .select("role")
    .eq("epost", user.email)
    .maybeSingle()

  if (error) return { ok: false as const, status: 400 as const }
  if (data?.role !== "admin" && data?.role !== "superadmin") {
    return { ok: false as const, status: 403 as const }
  }

  return {
    ok: true as const,
    admin,
    email: user.email,
    userId: user.userId,
    role: data.role as "admin" | "superadmin",
  }
}

export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) {
    return NextResponse.json({ ok: false }, { status: gate.status })
  }

  const { data, error, count } = await gate.admin
    .from("medlemmer")
    .select(
      "id, created_at, medlemsnummer, medlemskap_type, navn, adresse, postnr, sted, epost, telefon, kontingent_betalt_at, kontingent_gyldig_til, role",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .limit(1000)

  if (error) {
    return NextResponse.json(
      { ok: false, feil: "Kunne ikke hente medlemsregister." },
      { status: 400 }
    )
  }

  let safeCount: number | null = typeof count === "number" ? count : null
  if (safeCount == null) {
    const { count: fallbackCount } = await gate.admin
      .from("medlemmer")
      .select("id", { count: "exact", head: true })
    safeCount = typeof fallbackCount === "number" ? fallbackCount : (data ?? []).length
  }

  return NextResponse.json({
    ok: true,
    medlemmer: data ?? [],
    count: safeCount,
    minRolle: gate.role,
  })
}

export async function PATCH(request: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) {
    return NextResponse.json({ ok: false }, { status: gate.status })
  }

  if (gate.role !== "superadmin") {
    return NextResponse.json(
      { ok: false, feil: "Kun superbruker kan endre roller." },
      { status: 403 }
    )
  }

  let payload: { medlemId?: string; role?: string }
  try {
    payload = (await request.json()) as { medlemId?: string; role?: string }
  } catch {
    return NextResponse.json({ ok: false, feil: "Ugyldig JSON." }, { status: 400 })
  }

  const medlemId = String(payload.medlemId ?? "").trim()
  const role = String(payload.role ?? "").trim()

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(medlemId)) {
    return NextResponse.json(
      { ok: false, feil: "Ugyldig medlem-id." },
      { status: 400 }
    )
  }

  if (role !== "user" && role !== "admin") {
    return NextResponse.json(
      { ok: false, feil: "Ugyldig rolle." },
      { status: 400 }
    )
  }

  const { data: target, error: targetError } = await gate.admin
    .from("medlemmer")
    .select("id, role, epost")
    .eq("id", medlemId)
    .maybeSingle()

  if (targetError) {
    return NextResponse.json(
      { ok: false, feil: "Kunne ikke hente medlem." },
      { status: 400 }
    )
  }

  if (!target) {
    return NextResponse.json(
      { ok: false, feil: "Fant ikke medlem." },
      { status: 404 }
    )
  }

  if (target.role === "superadmin") {
    return NextResponse.json(
      { ok: false, feil: "Superbruker kan ikke endres her." },
      { status: 400 }
    )
  }

  const { error: updateError } = await gate.admin
    .from("medlemmer")
    .update({ role })
    .eq("id", medlemId)

  if (updateError) {
    const msg = String((updateError as { message?: string } | null)?.message ?? "")
    if (/column/i.test(msg) && /role/i.test(msg)) {
      return NextResponse.json(
        {
          ok: false,
          feil:
            "Feltet role mangler i medlemsregisteret. Legg til kolonnen i Supabase: alter table public.medlemmer add column if not exists role text not null default 'user';",
        },
        { status: 500 }
      )
    }
    return NextResponse.json(
      { ok: false, feil: "Kunne ikke oppdatere rolle." },
      { status: 400 }
    )
  }

  return NextResponse.json({ ok: true })
}
