import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export const dynamic = "force-dynamic"

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
}

function isAktivKontingent(gyldigTil?: string | null) {
  if (!gyldigTil) return false
  const d = new Date(gyldigTil)
  if (Number.isNaN(d.getTime())) return false
  return d.getTime() > Date.now()
}

async function getAuth() {
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
  const email = String(user?.email ?? "").trim().toLowerCase()
  if (!userId || !email || !isValidEmail(email)) return null
  return { userId, email }
}

async function verifyActiveMember(admin: unknown, userId: string) {
  const client = admin as ReturnType<typeof createClient>
  const { data: medlem, error: medlemError } = await client
    .from("medlemmer")
    .select("aktiv, kontingent_gyldig_til")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (medlemError) {
    return { ok: false as const, status: 400 as const, feil: "Kunne ikke verifisere medlemskap." }
  }

  const medlemRow = (medlem as { aktiv?: boolean | null; kontingent_gyldig_til?: string | null } | null) ?? null
  if (!medlemRow || medlemRow.aktiv === false || !isAktivKontingent(medlemRow.kontingent_gyldig_til ?? null)) {
    return {
      ok: false as const,
      status: 403 as const,
      feil: "Kun aktive medlemmer kan kommentere på prosjekter.",
    }
  }

  return { ok: true as const }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ ok: false, feil: "Supabase er ikke konfigurert." }, { status: 500 })
  }

  const auth = await getAuth()
  if (!auth) {
    return NextResponse.json({ ok: false, feil: "Ikke innlogget." }, { status: 401 })
  }

  if (!serviceRoleKey) {
    return NextResponse.json(
      { ok: false, feil: "Mine prosjekter krever SUPABASE_SERVICE_ROLE_KEY i miljøvariabler." },
      { status: 500 }
    )
  }

  const { id } = await context.params
  const prosjektId = String(id ?? "").trim()
  if (!isUuid(prosjektId)) {
    return NextResponse.json({ ok: false, feil: "Ugyldig id." }, { status: 400 })
  }

  let body: { kommentar?: unknown }
  try {
    body = (await request.json()) as { kommentar?: unknown }
  } catch {
    return NextResponse.json({ ok: false, feil: "Ugyldig forespørsel." }, { status: 400 })
  }

  const kommentar = String(body.kommentar ?? "").trim()
  if (!kommentar) {
    return NextResponse.json({ ok: false, feil: "Kommentaren din er tom." }, { status: 400 })
  }
  if (kommentar.length > 5000) {
    return NextResponse.json({ ok: false, feil: "Kommentaren er for lang (maks 5000 tegn)." }, { status: 400 })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const verified = await verifyActiveMember(admin, auth.userId)
  if (!verified.ok) {
    return NextResponse.json({ ok: false, feil: verified.feil }, { status: verified.status })
  }

  const { data: row, error } = await admin
    .from("prosjekt_soknader")
    .select("id, epost")
    .eq("id", prosjektId)
    .eq("epost", auth.email)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ ok: false, feil: "Kunne ikke hente prosjekt." }, { status: 400 })
  }
  if (!row?.id) {
    return NextResponse.json({ ok: false, feil: "Fant ikke prosjekt." }, { status: 404 })
  }

  try {
    await admin.from("prosjekt_hendelser").insert({
      prosjekt_id: prosjektId,
      actor_email: auth.email,
      type: "kommentar",
      message: `Kommentar fra søker: ${kommentar}`,
    })
  } catch {
    return NextResponse.json({ ok: false, feil: "Kunne ikke lagre kommentaren. Prøv igjen." }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
