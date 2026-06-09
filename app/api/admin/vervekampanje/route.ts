import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { isCampaignActive, labelForMedlemskapstype, vervekampanjeSchemaFeil } from "@/lib/vervekampanje"
import { hasPermission, normalizeRole } from "@/lib/roller"

export const dynamic = "force-dynamic"

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

async function getCurrentUser() {
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
  return { email, userId, supabaseUrl }
}

async function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return null
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })
}

async function requireAdmin() {
  const user = await getCurrentUser()
  if (!user) return { ok: false as const, status: 401 as const }

  const admin = await getAdminClient()
  if (!admin) return { ok: false as const, status: 500 as const }

  const { data, error } = await admin
    .from("medlemmer")
    .select("role, aktiv")
    .eq("user_id", user.userId)
    .maybeSingle()

  if (error) {
    return { ok: false as const, status: 400 as const, feil: "Kunne ikke hente adminbruker." }
  }
  if (data?.aktiv === false) {
    return { ok: false as const, status: 403 as const, feil: "Du er meldt ut." }
  }
  const ownerEmail = String(
    process.env.ADMIN_SUPERADMIN_EMAIL ?? process.env.ADMIN_BOOTSTRAP_EMAIL ?? ""
  )
    .trim()
    .toLowerCase()
  const role = ownerEmail && user.email === ownerEmail ? "superadmin" : normalizeRole(data?.role)
  if (!hasPermission(role, "manage_campaigns")) {
    return { ok: false as const, status: 403 as const, feil: "Du har ikke tilgang til vervekampanjer." }
  }

  return {
    ok: true as const,
    admin,
    email: user.email,
    userId: user.userId,
    role,
  }
}

function formatCampaign(campaign: Record<string, unknown>) {
  return {
    id: String(campaign.id ?? ""),
    title: String(campaign.title ?? "").trim() || "Vervekampanje",
    description: String(campaign.description ?? "").trim() || null,
    status: String(campaign.status ?? "").trim() || "active",
    starts_at: (campaign.starts_at as string | null | undefined) ?? null,
    ends_at: (campaign.ends_at as string | null | undefined) ?? null,
    created_at: (campaign.created_at as string | null | undefined) ?? null,
    winning_metric: String(campaign.winning_metric ?? "revenue").trim() || "revenue",
  }
}

async function loadAdminState(admin: SupabaseClient, selectedCampaignId?: string | null) {
  const { data: campaignRows, error: campaignError } = await admin
    .from("vervekampanjer")
    .select("id, created_at, title, description, status, starts_at, ends_at, winning_metric")
    .order("created_at", { ascending: false })
    .limit(50)

  if (campaignError) {
    const sf = vervekampanjeSchemaFeil((campaignError as { message?: string } | null)?.message)
    return { ok: false as const, status: sf ? 500 : 400, feil: sf ?? "Kunne ikke hente kampanjer." }
  }

  const campaigns = (campaignRows ?? []).map((row: unknown) => formatCampaign(row as Record<string, unknown>))
  const activeCampaign = campaigns.find((row: ReturnType<typeof formatCampaign>) => isCampaignActive(row)) ?? null
  const selectedId =
    String(selectedCampaignId ?? "").trim() ||
    String(activeCampaign?.id ?? "").trim() ||
    String(campaigns[0]?.id ?? "").trim() ||
    null

  const { data: referralRows, error: referralError } = await admin
    .from("vervekampanje_verv")
    .select(
      "campaign_id, referrer_member_id, referrer_name, referrer_email, referred_name, referred_email, membership_type, amount, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(10000)

  if (referralError) {
    const sf = vervekampanjeSchemaFeil((referralError as { message?: string } | null)?.message)
    return {
      ok: false as const,
      status: sf ? 500 : 400,
      feil: sf ?? "Kunne ikke hente vervestatistikk.",
    }
  }

  const summaryByCampaign = new Map<string, { count: number; amount: number }>()
  for (const row of referralRows ?? []) {
    const record = row as { campaign_id?: string | null; amount?: number | null }
    const key = String(record.campaign_id ?? "").trim()
    if (!key) continue
    const current = summaryByCampaign.get(key) ?? { count: 0, amount: 0 }
    current.count += 1
    current.amount += Number(record.amount ?? 0)
    summaryByCampaign.set(key, current)
  }

  const campaignsWithStats = campaigns.map((campaign: ReturnType<typeof formatCampaign>) => ({
    ...campaign,
    stats: summaryByCampaign.get(campaign.id) ?? { count: 0, amount: 0 },
  }))

  const selectedRows = (referralRows ?? []).filter(
    (row: unknown) =>
      String((row as { campaign_id?: string | null }).campaign_id ?? "") === String(selectedId ?? "")
  )

  const scoreboardMap = new Map<
    string,
    {
      referrer_member_id: string
      referrer_name: string
      referrer_email: string | null
      amount: number
      count: number
      referrals: Array<{
        navn: string
        epost: string | null
        medlemskap: string
        amount: number
        created_at: string | null
      }>
    }
  >()

  for (const row of selectedRows) {
    const record = row as {
      referrer_member_id?: string | null
      referrer_name?: string | null
      referrer_email?: string | null
      referred_name?: string | null
      referred_email?: string | null
      membership_type?: string | null
      amount?: number | null
      created_at?: string | null
    }
    const key = String(record.referrer_member_id ?? "").trim()
    if (!key) continue
    const current = scoreboardMap.get(key) ?? {
      referrer_member_id: key,
      referrer_name: String(record.referrer_name ?? "").trim() || "Medlem",
      referrer_email: String(record.referrer_email ?? "").trim().toLowerCase() || null,
      amount: 0,
      count: 0,
      referrals: [],
    }
    const amount = Number(record.amount ?? 0)
    current.amount += amount
    current.count += 1
    current.referrals.push({
      navn: String(record.referred_name ?? "").trim() || "Nytt medlem",
      epost: String(record.referred_email ?? "").trim().toLowerCase() || null,
      medlemskap: labelForMedlemskapstype(record.membership_type),
      amount,
      created_at: record.created_at ?? null,
    })
    scoreboardMap.set(key, current)
  }

  const scoreboard = [...scoreboardMap.values()]
    .sort((a, b) => {
      if (b.amount !== a.amount) return b.amount - a.amount
      if (b.count !== a.count) return b.count - a.count
      return a.referrer_name.localeCompare(b.referrer_name, "nb-NO", { sensitivity: "base" })
    })
    .map((row, index) => ({ ...row, rank: index + 1 }))

  const { data: prizeRows, error: prizeError } = await admin
    .from("lodd_premier")
    .select("id, tittel, sponsor_navn, verdi, status, created_at")
    .order("created_at", { ascending: false })
    .limit(500)

  if (prizeError) {
    const sf = vervekampanjeSchemaFeil((prizeError as { message?: string } | null)?.message)
    return {
      ok: false as const,
      status: sf ? 500 : 400,
      feil: sf ?? "Kunne ikke hente premiearkiv.",
    }
  }

  const { data: campaignPrizeRows, error: campaignPrizeError } = await admin
    .from("vervekampanje_premier")
    .select("campaign_id, premie_id")
    .limit(5000)

  if (campaignPrizeError) {
    const sf = vervekampanjeSchemaFeil((campaignPrizeError as { message?: string } | null)?.message)
    return {
      ok: false as const,
      status: sf ? 500 : 400,
      feil: sf ?? "Kunne ikke hente reserverte premier.",
    }
  }

  const { data: lotteriRows } = await admin
    .from("lodd_lotteri_premier")
    .select("lotteri_id, premie_id, lotteri:lodd_lotteri(id, tittel, status)")
    .limit(5000)

  const campaignById = new Map<string, (typeof campaignsWithStats)[number]>(
    campaignsWithStats.map((row: (typeof campaignsWithStats)[number]) => [row.id, row])
  )
  const campaignPrizeIds = new Set(
    (campaignPrizeRows ?? [])
      .filter(
        (row: unknown) =>
          String((row as { campaign_id?: string | null }).campaign_id ?? "") === String(selectedId ?? "")
      )
      .map((row: unknown) => String((row as { premie_id?: string | null }).premie_id ?? ""))
      .filter(Boolean)
  )

  const reservedCampaignByPrizeId = new Map<string, { campaignId: string; title: string }>()
  for (const row of campaignPrizeRows ?? []) {
    const record = row as { campaign_id?: string | null; premie_id?: string | null }
    const campaignId = String(record.campaign_id ?? "").trim()
    const prizeId = String(record.premie_id ?? "").trim()
    if (!campaignId || !prizeId) continue
    if (campaignId === selectedId) continue
    const campaign = campaignById.get(campaignId)
    if (!campaign || campaign.status === "ended") continue
    reservedCampaignByPrizeId.set(prizeId, {
      campaignId,
      title: campaign.title,
    })
  }

  const reservedLotteriByPrizeId = new Map<string, { lotteriId: string; title: string; status: string }>()
  for (const row of lotteriRows ?? []) {
    const record = row as {
      premie_id?: string | null
      lotteri?: Array<Record<string, unknown>> | Record<string, unknown> | null
      lotteri_id?: string | null
    }
    const prizeId = String(record.premie_id ?? "").trim()
    if (!prizeId) continue
    const lotteriValue = Array.isArray(record.lotteri) ? record.lotteri[0] ?? null : record.lotteri
    const lotteri = (lotteriValue ?? null) as Record<string, unknown> | null
    const status = String(lotteri?.status ?? "").trim()
    if (!lotteri?.id || status === "ended") continue
    reservedLotteriByPrizeId.set(prizeId, {
      lotteriId: String(lotteri.id ?? record.lotteri_id ?? ""),
      title: String(lotteri.tittel ?? "").trim() || "Loddsalg",
      status,
    })
  }

  const premier = (prizeRows ?? []).map((row: unknown) => {
    const record = row as Record<string, unknown>
    const id = String(record.id ?? "")
    const reservedCampaign = reservedCampaignByPrizeId.get(id) ?? null
    const reservedLotteri = reservedLotteriByPrizeId.get(id) ?? null
    return {
      id,
      tittel: String(record.tittel ?? "").trim() || "Premie",
      sponsor_navn: String(record.sponsor_navn ?? "").trim() || null,
      verdi: record.verdi == null ? null : Number(record.verdi),
      status: String(record.status ?? "").trim() || null,
      is_reserved_in_selected: campaignPrizeIds.has(id),
      reserved_campaign_title: reservedCampaign?.title ?? null,
      reserved_lotteri_title: reservedLotteri?.title ?? null,
      unavailable_reason: reservedCampaign
        ? `Reservert i kampanjen ${reservedCampaign.title}`
        : reservedLotteri
          ? `Reservert i ${reservedLotteri.title}`
          : null,
    }
  })

  const reservedPremier = premier.filter((row: (typeof premier)[number]) => row.is_reserved_in_selected)
  const availablePremier = premier.filter((row: (typeof premier)[number]) => row.status !== "utlevert")

  return {
    ok: true as const,
    status: 200 as const,
    payload: {
      campaigns: campaignsWithStats,
      activeCampaign,
      selectedCampaignId: selectedId,
      selectedSummary: summaryByCampaign.get(String(selectedId ?? "")) ?? { count: 0, amount: 0 },
      scoreboard,
      reservedPremier,
      premier: availablePremier,
    },
  }
}

export async function GET(request: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) {
    return NextResponse.json({ ok: false, feil: "feil" in gate ? gate.feil : undefined }, { status: gate.status })
  }

  const { searchParams } = new URL(request.url)
  const state = await loadAdminState(gate.admin, searchParams.get("campaignId"))
  if (!state.ok) {
    return NextResponse.json({ ok: false, feil: state.feil }, { status: state.status })
  }

  return NextResponse.json({ ok: true, ...state.payload })
}

export async function POST(request: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) {
    return NextResponse.json({ ok: false, feil: "feil" in gate ? gate.feil : undefined }, { status: gate.status })
  }

  let body: {
    action?: string
    title?: string
    description?: string | null
    endsAt?: string | null
    campaignId?: string
    premieId?: string
  }
  try {
    body = (await request.json()) as {
      action?: string
      title?: string
      description?: string | null
      endsAt?: string | null
      campaignId?: string
      premieId?: string
    }
  } catch {
    return NextResponse.json({ ok: false, feil: "Ugyldig JSON." }, { status: 400 })
  }

  const action = String(body.action ?? "").trim()

  if (action === "startCampaign") {
    const title = String(body.title ?? "").trim()
    const description = String(body.description ?? "").trim()
    const endsAt = String(body.endsAt ?? "").trim()

    if (!title) {
      return NextResponse.json({ ok: false, feil: "Skriv inn navn på kampanjen." }, { status: 400 })
    }

    const { data: existing, error: existingError } = await gate.admin
      .from("vervekampanjer")
      .select("id, status, starts_at, ends_at")
      .order("created_at", { ascending: false })
      .limit(20)

    if (existingError) {
      const sf = vervekampanjeSchemaFeil((existingError as { message?: string } | null)?.message)
      return NextResponse.json(
        { ok: false, feil: sf ?? "Kunne ikke kontrollere aktive kampanjer." },
        { status: sf ? 500 : 400 }
      )
    }

    const hasActive = (existing ?? []).some((row) =>
      isCampaignActive(row as { status?: string | null; starts_at?: string | null; ends_at?: string | null })
    )
    if (hasActive) {
      return NextResponse.json(
        { ok: false, feil: "Avslutt den aktive vervekampanjen for du starter en ny." },
        { status: 400 }
      )
    }

    const insert = {
      title,
      description: description || null,
      status: "active",
      starts_at: new Date().toISOString(),
      ends_at: endsAt || null,
      created_by_epost: gate.email,
      winning_metric: "revenue",
    }

    const { error } = await gate.admin.from("vervekampanjer").insert(insert)
    if (error) {
      const sf = vervekampanjeSchemaFeil((error as { message?: string } | null)?.message)
      return NextResponse.json(
        { ok: false, feil: sf ?? "Kunne ikke starte vervekampanje." },
        { status: sf ? 500 : 400 }
      )
    }

    return NextResponse.json({ ok: true })
  }

  if (action === "stopCampaign") {
    const campaignId = String(body.campaignId ?? "").trim()
    if (!campaignId) {
      return NextResponse.json({ ok: false, feil: "Mangler kampanje." }, { status: 400 })
    }

    const { error } = await gate.admin
      .from("vervekampanjer")
      .update({
        status: "ended",
        ends_at: new Date().toISOString(),
        stopped_at: new Date().toISOString(),
        stopped_by_epost: gate.email,
        updated_at: new Date().toISOString(),
      })
      .eq("id", campaignId)

    if (error) {
      const sf = vervekampanjeSchemaFeil((error as { message?: string } | null)?.message)
      return NextResponse.json(
        { ok: false, feil: sf ?? "Kunne ikke avslutte kampanjen." },
        { status: sf ? 500 : 400 }
      )
    }

    return NextResponse.json({ ok: true })
  }

  if (action === "reservePrize") {
    const campaignId = String(body.campaignId ?? "").trim()
    const premieId = String(body.premieId ?? "").trim()
    if (!campaignId || !premieId) {
      return NextResponse.json({ ok: false, feil: "Mangler kampanje eller premie." }, { status: 400 })
    }

    const { data: campaign, error: campaignError } = await gate.admin
      .from("vervekampanjer")
      .select("id, title, status, starts_at, ends_at")
      .eq("id", campaignId)
      .maybeSingle()

    if (campaignError) {
      const sf = vervekampanjeSchemaFeil((campaignError as { message?: string } | null)?.message)
      return NextResponse.json(
        { ok: false, feil: sf ?? "Kunne ikke hente kampanjen." },
        { status: sf ? 500 : 400 }
      )
    }
    if (!campaign?.id || !isCampaignActive(campaign)) {
      return NextResponse.json({ ok: false, feil: "Kampanjen er ikke aktiv." }, { status: 400 })
    }

    const { data: prizeRow, error: prizeError } = await gate.admin
      .from("lodd_premier")
      .select("id, status")
      .eq("id", premieId)
      .maybeSingle()

    if (prizeError) {
      return NextResponse.json({ ok: false, feil: "Kunne ikke hente premie." }, { status: 400 })
    }
    if (!prizeRow?.id) {
      return NextResponse.json({ ok: false, feil: "Fant ikke premie." }, { status: 404 })
    }
    if (String(prizeRow.status ?? "").trim() === "utlevert") {
      return NextResponse.json({ ok: false, feil: "Utleverte premier kan ikke reserveres." }, { status: 400 })
    }

    const { data: existingCampaignPrizes, error: existingCampaignPrizeError } = await gate.admin
      .from("vervekampanje_premier")
      .select("campaign_id")
      .eq("premie_id", premieId)

    if (existingCampaignPrizeError) {
      const sf = vervekampanjeSchemaFeil((existingCampaignPrizeError as { message?: string } | null)?.message)
      return NextResponse.json(
        { ok: false, feil: sf ?? "Kunne ikke kontrollere reserveringer." },
        { status: sf ? 500 : 400 }
      )
    }

    const otherCampaignIds = (existingCampaignPrizes ?? [])
      .map((row) => String((row as { campaign_id?: string | null }).campaign_id ?? ""))
      .filter((id) => !!id && id !== campaignId)

    if (otherCampaignIds.length) {
      const { data: blockingCampaigns } = await gate.admin
        .from("vervekampanjer")
        .select("id, title, status, starts_at, ends_at")
        .in("id", otherCampaignIds)

      const blocking = (blockingCampaigns ?? []).find((row) =>
        isCampaignActive(row as { status?: string | null; starts_at?: string | null; ends_at?: string | null })
      )
      if (blocking) {
        return NextResponse.json(
          { ok: false, feil: `Premien er allerede reservert i ${String(blocking.title ?? "annen kampanje").trim()}.` },
          { status: 400 }
        )
      }
    }

    const { data: lotteriBlocking } = await gate.admin
      .from("lodd_lotteri_premier")
      .select("lotteri:lodd_lotteri(id, tittel, status)")
      .eq("premie_id", premieId)
      .limit(20)

    const blockingLotteri = (lotteriBlocking ?? []).find((row) => {
      const lotteriValue = ((row as { lotteri?: Array<Record<string, unknown>> | Record<string, unknown> | null }).lotteri ??
        null) as Array<Record<string, unknown>> | Record<string, unknown> | null
      const lotteri = Array.isArray(lotteriValue) ? lotteriValue[0] ?? null : lotteriValue
      return lotteri && String(lotteri.status ?? "").trim() !== "ended"
    })

    if (blockingLotteri) {
      const lotteriValue = ((blockingLotteri as { lotteri?: Array<Record<string, unknown>> | Record<string, unknown> | null }).lotteri ??
        null) as Array<Record<string, unknown>> | Record<string, unknown> | null
      const lotteri = Array.isArray(lotteriValue) ? lotteriValue[0] ?? null : lotteriValue
      return NextResponse.json(
        {
          ok: false,
          feil: `Premien er allerede reservert i ${String(lotteri?.tittel ?? "loddsalg").trim()}.`,
        },
        { status: 400 }
      )
    }

    const { error } = await gate.admin.from("vervekampanje_premier").upsert({
      campaign_id: campaignId,
      premie_id: premieId,
      reserved_by_epost: gate.email,
    })

    if (error) {
      const sf = vervekampanjeSchemaFeil((error as { message?: string } | null)?.message)
      return NextResponse.json(
        { ok: false, feil: sf ?? "Kunne ikke reservere premie." },
        { status: sf ? 500 : 400 }
      )
    }

    return NextResponse.json({ ok: true })
  }

  if (action === "unreservePrize") {
    const campaignId = String(body.campaignId ?? "").trim()
    const premieId = String(body.premieId ?? "").trim()
    if (!campaignId || !premieId) {
      return NextResponse.json({ ok: false, feil: "Mangler kampanje eller premie." }, { status: 400 })
    }

    const { error } = await gate.admin
      .from("vervekampanje_premier")
      .delete()
      .eq("campaign_id", campaignId)
      .eq("premie_id", premieId)

    if (error) {
      const sf = vervekampanjeSchemaFeil((error as { message?: string } | null)?.message)
      return NextResponse.json(
        { ok: false, feil: sf ?? "Kunne ikke fjerne premie fra kampanjen." },
        { status: sf ? 500 : 400 }
      )
    }

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, feil: "Ugyldig handling." }, { status: 400 })
}
