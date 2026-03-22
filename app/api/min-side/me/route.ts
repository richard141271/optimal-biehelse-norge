import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { createClient } from "@supabase/supabase-js"

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
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

function selectMedlem() {
  return "id, created_at, user_id, medlemsnummer, medlemskap_type, navn, adresse, postnr, sted, epost, telefon, kontingent_betalt_at, kontingent_gyldig_til"
}

export async function GET() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const auth = await getAuth()
  if (!auth.ok) return NextResponse.json({ ok: false, feil: auth.feil }, { status: auth.status })
  const { userId, email, supabaseUrl } = auth

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
    .select(selectMedlem())
    .eq("user_id", userId)
    .maybeSingle()

  if (byUserId) {
    return NextResponse.json({ ok: true, medlem: byUserId })
  }

  const { data: byEmail } = await admin
    .from("medlemmer")
    .select(selectMedlem())
    .eq("epost", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (byEmail) {
    const byEmailRow = byEmail as { id?: string; user_id?: string | null }
    if (!byEmailRow.user_id && byEmailRow.id) {
      await admin
        .from("medlemmer")
        .update({ user_id: userId })
        .eq("id", byEmailRow.id)
        .is("user_id", null)
    }
    return NextResponse.json({ ok: true, medlem: byEmail })
  }

  return NextResponse.json(
    {
      ok: false,
      feil: "Du er innlogget, men ikke registrert som medlem ennå. Registrer medlemskap først.",
    },
    { status: 404 }
  )
}

export async function PATCH(request: Request) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const auth = await getAuth()
  if (!auth.ok) return NextResponse.json({ ok: false, feil: auth.feil }, { status: auth.status })
  const { userId, supabaseUrl } = auth

  if (!serviceRoleKey) {
    return NextResponse.json(
      { ok: false, feil: "Medlemsoppslag er ikke konfigurert." },
      { status: 500 }
    )
  }

  let payload: {
    navn?: string
    telefon?: string | null
    adresse?: string | null
    postnr?: string | null
    sted?: string | null
  }
  try {
    payload = (await request.json()) as {
      navn?: string
      telefon?: string | null
      adresse?: string | null
      postnr?: string | null
      sted?: string | null
    }
  } catch {
    return NextResponse.json({ ok: false, feil: "Ugyldig JSON." }, { status: 400 })
  }

  const navn = payload.navn != null ? String(payload.navn).trim() : ""
  if (!navn) {
    return NextResponse.json({ ok: false, feil: "Navn kan ikke være tomt." }, { status: 400 })
  }
  if (navn.length > 120) {
    return NextResponse.json({ ok: false, feil: "Navn er for langt." }, { status: 400 })
  }

  const normalize = (v: unknown) => {
    if (v === null || v === undefined) return null
    const s = String(v).trim()
    return s ? s : null
  }

  const update = {
    navn,
    telefon: normalize(payload.telefon),
    adresse: normalize(payload.adresse),
    postnr: normalize(payload.postnr),
    sted: normalize(payload.sted),
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { data, error } = await admin
    .from("medlemmer")
    .update(update)
    .eq("user_id", userId)
    .select(selectMedlem())
    .maybeSingle()

  if (error) {
    return NextResponse.json(
      { ok: false, feil: "Kunne ikke lagre opplysninger." },
      { status: 400 }
    )
  }
  if (!data) {
    return NextResponse.json(
      { ok: false, feil: "Fant ikke medlemsrad å oppdatere." },
      { status: 404 }
    )
  }

  return NextResponse.json({ ok: true, medlem: data })
}
