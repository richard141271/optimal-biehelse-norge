import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { createClient } from "@supabase/supabase-js"

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

  const userId = user?.id ?? null
  const email = (user?.email ?? "").trim().toLowerCase()
  if (!userId || !email) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  if (!serviceRoleKey) {
    return NextResponse.json(
      { ok: false, feil: "Medlemsoppslag er ikke konfigurert." },
      { status: 500 }
    )
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { data: byUserId } = await admin
    .from("medlemmer")
    .select(
      "id, created_at, user_id, medlemsnummer, medlemskap_type, navn, adresse, postnr, sted, epost, telefon, kontingent_betalt_at, kontingent_gyldig_til"
    )
    .eq("user_id", userId)
    .maybeSingle()

  if (byUserId) {
    return NextResponse.json({ ok: true, medlem: byUserId })
  }

  const { data: byEmail } = await admin
    .from("medlemmer")
    .select(
      "id, created_at, user_id, medlemsnummer, medlemskap_type, navn, adresse, postnr, sted, epost, telefon, kontingent_betalt_at, kontingent_gyldig_til"
    )
    .eq("epost", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!byEmail) {
    return NextResponse.json(
      { ok: false, feil: "Fant ingen medlemsdata for kontoen." },
      { status: 404 }
    )
  }

  return NextResponse.json({ ok: true, medlem: byEmail })
}
