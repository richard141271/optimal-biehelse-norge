import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { isCampaignActive, parseMemberIdValue, vervekampanjeSchemaFeil } from "@/lib/vervekampanje"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ ok: false, feil: "Supabase er ikke konfigurert." }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const campaignId = String(searchParams.get("kampanje") ?? searchParams.get("campaignId") ?? "").trim()
  const referrerId = String(searchParams.get("verver") ?? searchParams.get("referrerMemberId") ?? "").trim()

  if (!campaignId || !referrerId) {
    return NextResponse.json({ ok: false, feil: "Mangler vervelenke." }, { status: 400 })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { data: campaign, error: campaignError } = await admin
    .from("vervekampanjer")
    .select("id, title, description, status, starts_at, ends_at")
    .eq("id", campaignId)
    .maybeSingle()

  if (campaignError) {
    const sf = vervekampanjeSchemaFeil((campaignError as { message?: string } | null)?.message)
    return NextResponse.json(
      { ok: false, feil: sf ?? "Kunne ikke hente vervekampanje." },
      { status: sf ? 500 : 400 }
    )
  }

  if (!campaign?.id || !isCampaignActive(campaign)) {
    return NextResponse.json({ ok: false, feil: "Vervelenken er ikke aktiv lenger." }, { status: 404 })
  }

  const { data: referrer, error: referrerError } = await admin
    .from("medlemmer")
    .select("id, navn, epost, aktiv")
    .eq("id", parseMemberIdValue(referrerId))
    .maybeSingle()

  if (referrerError) {
    const sf = vervekampanjeSchemaFeil((referrerError as { message?: string } | null)?.message)
    return NextResponse.json(
      { ok: false, feil: sf ?? "Kunne ikke lese vervelenken." },
      { status: sf ? 500 : 400 }
    )
  }

  if (!referrer?.id || referrer.aktiv === false) {
    return NextResponse.json({ ok: false, feil: "Vervelenken er ikke gyldig." }, { status: 404 })
  }

  return NextResponse.json({
    ok: true,
    campaign: {
      id: campaign.id,
      title: String(campaign.title ?? "").trim(),
      description: String(campaign.description ?? "").trim() || null,
      ends_at: campaign.ends_at ?? null,
    },
    referrer: {
      id: String(referrer.id),
      navn: String(referrer.navn ?? "").trim() || "et medlem i OBNO",
      epost: String(referrer.epost ?? "").trim().toLowerCase() || null,
    },
  })
}
