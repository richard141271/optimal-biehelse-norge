import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { createClient } from "@supabase/supabase-js"

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
      setAll() {},
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const email = (user?.email ?? "").trim().toLowerCase()
  if (!email || !isValidEmail(email)) {
    return NextResponse.json(
      { ok: false, feil: "Ikke innlogget." },
      { status: 401 }
    )
  }

  if (!serviceRoleKey) {
    return NextResponse.json(
      { ok: false, feil: "Admin-roller er ikke konfigurert." },
      { status: 500 }
    )
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { data, error } = await admin
    .from("admin_roles")
    .select("role")
    .eq("email", email)
    .maybeSingle()

  if (error) {
    return NextResponse.json(
      { ok: false, feil: "Kunne ikke sjekke rettigheter." },
      { status: 400 }
    )
  }

  const role = (data?.role ?? null) as string | null
  return NextResponse.json({ ok: true, email, role })
}
