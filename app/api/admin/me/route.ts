import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { createClient } from "@supabase/supabase-js"
import { hasAnyAdminAccess, normalizeRole, permissionsForRole } from "@/lib/roller"

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { ok: false, feil: "Supabase er ikke konfigurert." },
      { status: 500 }
    )
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, {
            path: "/",
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            httpOnly: false,
            ...options,
          })
        }
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const userId = user?.id ?? null
  const email = (user?.email ?? "").trim().toLowerCase()
  if (!userId || !email || !isValidEmail(email)) {
    return NextResponse.json(
      { ok: false, feil: "Ikke innlogget." },
      { status: 401 }
    )
  }

  if (!serviceRoleKey) {
    return NextResponse.json(
      { ok: false, feil: "Admin er ikke konfigurert." },
      { status: 500 }
    )
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { data, error } = await admin
    .from("medlemmer")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle()

  if (error) {
    return NextResponse.json(
      { ok: false, feil: "Kunne ikke sjekke admin-tilgang." },
      { status: 400 }
    )
  }

  const ownerEmail = String(
    process.env.ADMIN_SUPERADMIN_EMAIL ?? process.env.ADMIN_BOOTSTRAP_EMAIL ?? ""
  )
    .trim()
    .toLowerCase()
  const role = ownerEmail && email === ownerEmail ? "superadmin" : normalizeRole(data?.role)
  if (!hasAnyAdminAccess(role)) {
    return NextResponse.json(
      { ok: false, feil: "Ingen adminrolle tilgjengelig." },
      { status: 403 }
    )
  }

  return NextResponse.json({
    ok: true,
    email,
    userId,
    role,
    permissions: permissionsForRole(role),
  })
}
