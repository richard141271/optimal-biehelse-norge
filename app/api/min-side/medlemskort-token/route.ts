import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { createClient } from "@supabase/supabase-js"
import crypto from "crypto"

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function isAktivKontingent(gyldigTil?: string | null) {
  if (!gyldigTil) return false
  const d = new Date(gyldigTil)
  if (Number.isNaN(d.getTime())) return false
  return d.getTime() > Date.now()
}

function base64urlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url")
}

function signToken(secret: string, header: unknown, payload: unknown) {
  const h = base64urlJson(header)
  const p = base64urlJson(payload)
  const data = `${h}.${p}`
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url")
  return `${data}.${sig}`
}

export const dynamic = "force-dynamic"

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const signingSecret = process.env.MEDLEMSKORT_SIGNING_SECRET

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ ok: false, feil: "Supabase er ikke konfigurert." }, { status: 500 })
  }
  if (!serviceRoleKey) {
    return NextResponse.json({ ok: false, feil: "Medlemsoppslag er ikke konfigurert." }, { status: 500 })
  }
  if (!signingSecret) {
    return NextResponse.json(
      {
        ok: false,
        feil: "Medlemskort krever MEDLEMSKORT_SIGNING_SECRET i miljøvariabler.",
      },
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
  const userId = user?.id ?? null
  const email = String(user?.email ?? "").trim().toLowerCase()
  if (!userId || !email || !isValidEmail(email)) {
    return NextResponse.json({ ok: false, feil: "Ikke innlogget." }, { status: 401 })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  let medlem =
    ((await admin
      .from("medlemmer")
      .select("id, user_id, medlemsnummer, aktiv, kontingent_gyldig_til")
      .eq("user_id", userId)
      .maybeSingle()).data as
      | {
          id?: string
          user_id?: string | null
          medlemsnummer?: number | null
          aktiv?: boolean | null
          kontingent_gyldig_til?: string | null
        }
      | null) ?? null

  if (!medlem) {
    const { data: byEmail } = await admin
      .from("medlemmer")
      .select("id, user_id, medlemsnummer, aktiv, kontingent_gyldig_til")
      .eq("epost", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    medlem =
      (byEmail as
        | {
            id?: string
            user_id?: string | null
            medlemsnummer?: number | null
            aktiv?: boolean | null
            kontingent_gyldig_til?: string | null
          }
        | null) ?? null

    if (medlem?.id && !medlem.user_id) {
      await admin.from("medlemmer").update({ user_id: userId }).eq("id", medlem.id).is("user_id", null)
    }
  }

  if (!medlem || medlem.aktiv === false || !isAktivKontingent(medlem.kontingent_gyldig_til ?? null)) {
    return NextResponse.json(
      { ok: false, feil: "Medlemskort er kun tilgjengelig for aktive medlemmer." },
      { status: 403 }
    )
  }

  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
  const token = signToken(
    signingSecret,
    { alg: "HS256", typ: "JWT" },
    {
      sub: userId,
      mid: typeof medlem.medlemsnummer === "number" ? medlem.medlemsnummer : null,
      exp,
    }
  )

  return NextResponse.json({ ok: true, token, exp })
}

