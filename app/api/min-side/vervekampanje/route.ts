import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { createClient } from "@supabase/supabase-js"
import { isCampaignActive, labelForMedlemskapstype, vervekampanjeSchemaFeil } from "@/lib/vervekampanje"

export const dynamic = "force-dynamic"

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

export async function GET() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const auth = await getAuth()
  if (!auth.ok) return NextResponse.json({ ok: false, feil: auth.feil }, { status: auth.status })
  if (!serviceRoleKey) {
    return NextResponse.json({ ok: false, feil: "Supabase er ikke konfigurert." }, { status: 500 })
  }

  const admin = createClient(auth.supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { data: medlem, error: medlemError } = await admin
    .from("medlemmer")
    .select("id, navn, epost, aktiv")
    .eq("user_id", auth.userId)
    .eq("aktiv", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (medlemError) {
    return NextResponse.json({ ok: false, feil: "Kunne ikke hente medlem." }, { status: 400 })
  }

  if (!medlem?.id) {
    return NextResponse.json({ ok: false, feil: "Fant ikke aktivt medlem." }, { status: 404 })
  }

  const { data: campaigns, error: campaignError } = await admin
    .from("vervekampanjer")
    .select("id, title, description, status, starts_at, ends_at")
    .order("created_at", { ascending: false })
    .limit(20)

  if (campaignError) {
    const sf = vervekampanjeSchemaFeil((campaignError as { message?: string } | null)?.message)
    return NextResponse.json(
      { ok: false, feil: sf ?? "Kunne ikke hente vervekampanje." },
      { status: sf ? 500 : 400 }
    )
  }

  const activeCampaign =
    (campaigns ?? []).find((row) => isCampaignActive(row as { status?: string | null; starts_at?: string | null; ends_at?: string | null })) ??
    null

  if (!activeCampaign) {
    return NextResponse.json({ ok: true, campaign: null })
  }

  const { data: referralRows, error: referralError } = await admin
    .from("vervekampanje_verv")
    .select(
      "referrer_member_id, referrer_name, referred_name, referred_email, membership_type, amount, created_at"
    )
    .eq("campaign_id", activeCampaign.id)
    .order("created_at", { ascending: false })
    .limit(5000)

  if (referralError) {
    const sf = vervekampanjeSchemaFeil((referralError as { message?: string } | null)?.message)
    return NextResponse.json(
      { ok: false, feil: sf ?? "Kunne ikke hente vervestatistikk." },
      { status: sf ? 500 : 400 }
    )
  }

  const ownRows = (referralRows ?? []).filter(
    (row) => String((row as { referrer_member_id?: string | null }).referrer_member_id ?? "") === String(medlem.id)
  )

  const totalsByReferrer = new Map<string, { name: string; amount: number; count: number }>()
  for (const row of referralRows ?? []) {
    const record = row as {
      referrer_member_id?: string | null
      referrer_name?: string | null
      amount?: number | null
    }
    const key = String(record.referrer_member_id ?? "").trim()
    if (!key) continue
    const current = totalsByReferrer.get(key) ?? {
      name: String(record.referrer_name ?? "").trim() || "Medlem",
      amount: 0,
      count: 0,
    }
    current.amount += Number(record.amount ?? 0)
    current.count += 1
    totalsByReferrer.set(key, current)
  }

  const ranking = [...totalsByReferrer.entries()]
    .map(([memberId, stats]) => ({ memberId, ...stats }))
    .sort((a, b) => {
      if (b.amount !== a.amount) return b.amount - a.amount
      if (b.count !== a.count) return b.count - a.count
      return a.name.localeCompare(b.name, "nb-NO", { sensitivity: "base" })
    })

  const rank = ranking.findIndex((row) => row.memberId === String(medlem.id))

  const { data: prizeRows, error: prizeError } = await admin
    .from("vervekampanje_premier")
    .select("premie:lodd_premier(id, tittel, verdi)")
    .eq("campaign_id", activeCampaign.id)
    .limit(50)

  if (prizeError) {
    const sf = vervekampanjeSchemaFeil((prizeError as { message?: string } | null)?.message)
    return NextResponse.json(
      { ok: false, feil: sf ?? "Kunne ikke hente vervepremier." },
      { status: sf ? 500 : 400 }
    )
  }

  return NextResponse.json({
    ok: true,
    campaign: {
      id: activeCampaign.id,
      title: String(activeCampaign.title ?? "").trim(),
      description: String(activeCampaign.description ?? "").trim() || null,
      starts_at: activeCampaign.starts_at ?? null,
      ends_at: activeCampaign.ends_at ?? null,
      referralPath: `/bli-medlem?kampanje=${encodeURIComponent(activeCampaign.id)}&verver=${encodeURIComponent(String(medlem.id))}`,
      premier: (prizeRows ?? [])
        .map((row) => {
          const premieValue = (row as {
            premie?: Array<Record<string, unknown>> | Record<string, unknown> | null
          }).premie
          const premie = Array.isArray(premieValue) ? premieValue[0] ?? null : premieValue ?? null
          if (!premie) return null
          return {
            id: String(premie.id ?? ""),
            tittel: String(premie.tittel ?? "").trim() || "Premie",
            verdi: premie.verdi == null ? null : Number(premie.verdi),
          }
        })
        .filter(Boolean),
    },
    medlem: {
      id: String(medlem.id),
      navn: String(medlem.navn ?? "").trim() || "Medlem",
      epost: String(medlem.epost ?? "").trim().toLowerCase() || null,
    },
    stats: {
      count: ownRows.length,
      amount: ownRows.reduce((sum, row) => sum + Number((row as { amount?: number | null }).amount ?? 0), 0),
      rank: rank >= 0 ? rank + 1 : null,
    },
    referrals: ownRows.map((row) => ({
      navn: String((row as { referred_name?: string | null }).referred_name ?? "").trim() || "Nytt medlem",
      epost: String((row as { referred_email?: string | null }).referred_email ?? "").trim().toLowerCase() || null,
      medlemskap: labelForMedlemskapstype(String((row as { membership_type?: string | null }).membership_type ?? "")),
      amount: Number((row as { amount?: number | null }).amount ?? 0),
      created_at: (row as { created_at?: string | null }).created_at ?? null,
    })),
  })
}
