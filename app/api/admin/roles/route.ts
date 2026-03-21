import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { createClient } from "@supabase/supabase-js"

type Role = "superadmin" | "admin"

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function isValidRole(role: string): role is Role {
  return role === "superadmin" || role === "admin"
}

async function getCurrentUserEmail() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) return null

  const cookieStore = await cookies()
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll() {},
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const email = (user?.email ?? "").trim().toLowerCase()
  if (!email || !isValidEmail(email)) return null
  return email
}

async function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return null
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })
}

async function requireSuperAdmin() {
  const email = await getCurrentUserEmail()
  if (!email) return { ok: false as const, status: 401 as const }

  const admin = await getAdminClient()
  if (!admin) return { ok: false as const, status: 500 as const }

  const { data, error } = await admin
    .from("admin_roles")
    .select("role")
    .eq("email", email)
    .maybeSingle()

  if (error) return { ok: false as const, status: 400 as const }
  if (data?.role !== "superadmin") return { ok: false as const, status: 403 as const }

  return { ok: true as const, admin }
}

export async function GET() {
  const gate = await requireSuperAdmin()
  if (!gate.ok) {
    return NextResponse.json({ ok: false }, { status: gate.status })
  }

  const { data, error } = await gate.admin
    .from("admin_roles")
    .select("email, role, created_at")
    .order("created_at", { ascending: false })
    .limit(500)

  if (error) {
    return NextResponse.json(
      { ok: false, feil: "Kunne ikke hente roller." },
      { status: 400 }
    )
  }

  return NextResponse.json({ ok: true, roller: data ?? [] })
}

export async function POST(request: Request) {
  const gate = await requireSuperAdmin()
  if (!gate.ok) {
    return NextResponse.json({ ok: false }, { status: gate.status })
  }

  let payload: { email?: string; role?: string }
  try {
    payload = (await request.json()) as { email?: string; role?: string }
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const email = (payload.email ?? "").trim().toLowerCase()
  const role = (payload.role ?? "").trim()

  if (!isValidEmail(email) || !isValidRole(role)) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const { error } = await gate.admin.from("admin_roles").upsert(
    {
      email,
      role,
    },
    { onConflict: "email" }
  )

  if (error) {
    return NextResponse.json(
      { ok: false, feil: "Kunne ikke lagre rolle." },
      { status: 400 }
    )
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const gate = await requireSuperAdmin()
  if (!gate.ok) {
    return NextResponse.json({ ok: false }, { status: gate.status })
  }

  let payload: { email?: string }
  try {
    payload = (await request.json()) as { email?: string }
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const email = (payload.email ?? "").trim().toLowerCase()
  if (!isValidEmail(email)) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const { error } = await gate.admin.from("admin_roles").delete().eq("email", email)
  if (error) {
    return NextResponse.json(
      { ok: false, feil: "Kunne ikke fjerne rolle." },
      { status: 400 }
    )
  }

  return NextResponse.json({ ok: true })
}

