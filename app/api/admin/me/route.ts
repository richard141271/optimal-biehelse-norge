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
  const bootstrapEmail = (process.env.ADMIN_BOOTSTRAP_EMAIL ?? "").trim().toLowerCase()

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
          cookieStore.set(name, value, options)
        }
      },
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
    .ilike("email", email)
    .maybeSingle()

  if (error) {
    return NextResponse.json(
      { ok: false, feil: "Kunne ikke sjekke rettigheter." },
      { status: 400 }
    )
  }

  let role = (data?.role ?? null) as string | null

  if (!role && bootstrapEmail && email === bootstrapEmail) {
    const { error: upsertError } = await admin.from("admin_roles").upsert(
      { email, role: "superadmin" },
      { onConflict: "email" }
    )
    if (!upsertError) {
      role = "superadmin"
    }
  }

  if (!role && !bootstrapEmail) {
    const { count: superCount, error: superCountError } = await admin
      .from("admin_roles")
      .select("email", { count: "exact", head: true })
      .eq("role", "superadmin")

    if (!superCountError && (superCount ?? 0) === 0) {
      const { error: upsertError } = await admin.from("admin_roles").upsert(
        { email, role: "superadmin" },
        { onConflict: "email" }
      )
      if (!upsertError) {
        role = "superadmin"
      }
    }
  }

  if (!role && !bootstrapEmail) {
    const { count, error: countError } = await admin
      .from("admin_roles")
      .select("email", { count: "exact", head: true })

    if (!countError && (count ?? 0) === 0) {
      const { error: upsertError } = await admin.from("admin_roles").upsert(
        { email, role: "superadmin" },
        { onConflict: "email" }
      )
      if (!upsertError) {
        role = "superadmin"
      }
    }
  }

  return NextResponse.json({ ok: true, email, role })
}
