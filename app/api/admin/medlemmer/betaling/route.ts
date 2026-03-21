import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { createClient } from "@supabase/supabase-js"

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
}

async function getRole() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const bootstrapEmail = (process.env.ADMIN_BOOTSTRAP_EMAIL ?? "").trim().toLowerCase()

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return { ok: false as const, status: 500 as const }
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
  if (!email) return { ok: false as const, status: 401 as const }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { data, error } = await admin
    .from("admin_roles")
    .select("role")
    .ilike("email", email)
    .maybeSingle()

  if (error) return { ok: false as const, status: 400 as const }
  let role = (data?.role ?? null) as string | null
  if (!role && bootstrapEmail && email === bootstrapEmail) {
    const { error: upsertError } = await admin.from("admin_roles").upsert(
      { email, role: "superadmin" },
      { onConflict: "email" }
    )
    if (!upsertError) role = "superadmin"
  }
  if (role !== "admin" && role !== "superadmin") {
    return { ok: false as const, status: 403 as const }
  }

  return { ok: true as const, admin }
}

export async function PATCH(request: Request) {
  const gate = await getRole()
  if (!gate.ok) {
    return NextResponse.json({ ok: false }, { status: gate.status })
  }

  let payload: { medlemId?: string; betalt?: boolean }
  try {
    payload = (await request.json()) as { medlemId?: string; betalt?: boolean }
  } catch {
    return NextResponse.json({ ok: false, feil: "Ugyldig JSON." }, { status: 400 })
  }

  const medlemId = (payload.medlemId ?? "").trim()
  const betalt = payload.betalt === true

  if (!isUuid(medlemId)) {
    return NextResponse.json(
      { ok: false, feil: "Ugyldig medlem-id." },
      { status: 400 }
    )
  }

  if (betalt) {
    const now = new Date()
    const gyldigTil = new Date(now)
    gyldigTil.setFullYear(gyldigTil.getFullYear() + 1)

    const { error } = await gate.admin
      .from("medlemmer")
      .update({
        kontingent_betalt_at: now.toISOString(),
        kontingent_gyldig_til: gyldigTil.toISOString(),
      })
      .eq("id", medlemId)

    if (error) {
      return NextResponse.json(
        { ok: false, feil: "Kunne ikke lagre betaling." },
        { status: 400 }
      )
    }

    return NextResponse.json({ ok: true })
  }

  const { error } = await gate.admin
    .from("medlemmer")
    .update({
      kontingent_betalt_at: null,
      kontingent_gyldig_til: null,
    })
    .eq("id", medlemId)

  if (error) {
    return NextResponse.json(
      { ok: false, feil: "Kunne ikke fjerne betaling." },
      { status: 400 }
    )
  }

  return NextResponse.json({ ok: true })
}
