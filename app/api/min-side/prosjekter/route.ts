import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function isAktivKontingent(gyldigTil?: string | null) {
  if (!gyldigTil) return false
  const d = new Date(gyldigTil)
  if (Number.isNaN(d.getTime())) return false
  return d.getTime() > Date.now()
}

export const dynamic = "force-dynamic"

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
  return { userId, email, supabaseUrl }
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

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { data: medlem, error: medlemError } = await admin
    .from("medlemmer")
    .select("aktiv, kontingent_gyldig_til")
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (medlemError) {
    const msg = String((medlemError as { message?: string } | null)?.message ?? "")
    if (/column/i.test(msg) && /user_id/i.test(msg)) {
      return NextResponse.json(
        {
          ok: false,
          feil:
            "Medlemsregister-tabellen mangler feltet user_id. Kjør dette i Supabase (SQL Editor):\n\n" +
            "alter table public.medlemmer add column if not exists user_id uuid;",
        },
        { status: 500 }
      )
    }
    if (/column/i.test(msg) && /(kontingent_gyldig_til|aktiv)/i.test(msg)) {
      return NextResponse.json(
        {
          ok: false,
          feil:
            "Medlemsregister-tabellen mangler feltet aktiv/kontingent_gyldig_til. Kjør dette i Supabase (SQL Editor):\n\n" +
            "alter table public.medlemmer add column if not exists aktiv boolean not null default true;\n" +
            "alter table public.medlemmer add column if not exists kontingent_gyldig_til date;",
        },
        { status: 500 }
      )
    }
    return NextResponse.json({ ok: false, feil: "Kunne ikke verifisere medlemskap." }, { status: 400 })
  }

  if (!medlem || medlem.aktiv === false || !isAktivKontingent(medlem.kontingent_gyldig_til ?? null)) {
    return NextResponse.json(
      { ok: false, feil: "Prosjekter er kun tilgjengelig for aktive medlemmer." },
      { status: 403 }
    )
  }

  const { data, error } = await admin
    .from("prosjekt_soknader")
    .select("id, created_at, tittel, sted, budsjett, status")
    .eq("epost", auth.email)
    .order("created_at", { ascending: false })
    .limit(200)

  if (error) {
    return NextResponse.json(
      { ok: false, feil: "Kunne ikke hente prosjekter." },
      { status: 400 }
    )
  }

  return NextResponse.json({ ok: true, prosjekter: data ?? [] })
}
