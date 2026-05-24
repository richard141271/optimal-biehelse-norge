import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

function normalizePhone(v: unknown) {
  const digits = String(v ?? "").replace(/\D+/g, "")
  if (!digits) return null
  if (digits.length < 8 || digits.length > 15) return "__invalid__"
  return digits
}

function normalizeVippsPhoneForEpayment(phoneDigits: string) {
  const digits = String(phoneDigits ?? "").replace(/\D+/g, "")
  if (!digits) return null
  if (digits.startsWith("47") && digits.length === 10) return digits
  if (digits.length === 8) return `47${digits}`
  if (digits.length >= 10 && digits.length <= 15) return digits
  return null
}

function vippsBaseUrl() {
  const env = String(process.env.VIPPS_ENV ?? "").trim().toLowerCase()
  return env === "prod" || env === "production" ? "https://api.vipps.no" : "https://apitest.vipps.no"
}

type VippsTokenResponse = { access_token?: string; expires_in?: number }

let cachedToken: { token: string; expiresAt: number } | null = null

async function getVippsToken() {
  const clientId = process.env.VIPPS_CLIENT_ID
  const clientSecret = process.env.VIPPS_CLIENT_SECRET
  const subscriptionKey = process.env.VIPPS_SUBSCRIPTION_KEY
  const msn = process.env.VIPPS_MSN
  if (!clientId || !clientSecret || !subscriptionKey || !msn) return null

  const now = Date.now()
  if (cachedToken && cachedToken.expiresAt > now + 15_000) return cachedToken.token

  const res = await fetch(`${vippsBaseUrl()}/accesstoken/get`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      client_id: clientId,
      client_secret: clientSecret,
      "Ocp-Apim-Subscription-Key": subscriptionKey,
      "Merchant-Serial-Number": msn,
    },
    body: "",
    cache: "no-store",
  })

  const data = (await res.json().catch(() => ({}))) as VippsTokenResponse
  const token = String(data.access_token ?? "").trim()
  const expiresIn = Number(data.expires_in ?? 0)
  if (!res.ok || !token) return null

  cachedToken = {
    token,
    expiresAt: Date.now() + (Number.isFinite(expiresIn) ? expiresIn * 1000 : 60_000),
  }
  return token
}

function getPublicOrigin(request: Request) {
  const url = new URL(request.url)
  const proto =
    (request.headers.get("x-forwarded-proto") ?? "").split(",")[0]?.trim() || url.protocol.replace(":", "")
  const host =
    (request.headers.get("x-forwarded-host") ?? "").split(",")[0]?.trim() ||
    (request.headers.get("host") ?? "").trim() ||
    url.host
  return `${proto}://${host}`
}

function schemaFeil(msg?: string) {
  const text = String(msg ?? "")
  if (!/relation|table|column|does not exist/i.test(text)) return null
  return (
    "Loddsalg mangler i Supabase. Kjør denne SQL-en i Supabase (SQL Editor), og prøv igjen:\n\n" +
    "create table if not exists public.lodd_lotteri (\n" +
    "  id uuid primary key default gen_random_uuid(),\n" +
    "  created_at timestamptz not null default now(),\n" +
    "  tittel text not null default 'Loddsalg',\n" +
    "  beskrivelse text,\n" +
    "  ticket_price numeric not null default 20,\n" +
    "  sale_duration_minutes integer not null default 10080,\n" +
    "  status text not null default 'draft',\n" +
    "  start_at timestamptz,\n" +
    "  end_at timestamptz,\n" +
    "  created_by_epost text,\n" +
    "  winner_loddnr integer,\n" +
    "  winner_phone text,\n" +
    "  winner_drawn_at timestamptz,\n" +
    "  winner_drawn_by_epost text\n" +
    ");\n" +
    "do $$ begin\n" +
    "  if to_regclass('public.lodd_lotteri') is not null then\n" +
    "    alter table public.lodd_lotteri add column if not exists sale_duration_minutes integer not null default 10080;\n" +
    "  end if;\n" +
    "end $$;\n" +
    "create table if not exists public.lodd_kjop (\n" +
    "  id uuid primary key default gen_random_uuid(),\n" +
    "  created_at timestamptz not null default now(),\n" +
    "  lotteri_id uuid not null references public.lodd_lotteri(id) on delete cascade,\n" +
    "  phone text not null,\n" +
    "  antall integer not null,\n" +
    "  belop numeric not null,\n" +
    "  status text not null default 'pending',\n" +
    "  ticket_from integer,\n" +
    "  ticket_to integer,\n" +
    "  vipps_ref text,\n" +
    "  paid_at timestamptz,\n" +
    "  paid_by_epost text,\n" +
    "  note text\n" +
    ");\n"
  )
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ ok: false, feil: "Supabase er ikke konfigurert." }, { status: 500 })
  }

  let payload: { antall?: unknown; telefon?: unknown }
  try {
    payload = (await request.json()) as { antall?: unknown; telefon?: unknown }
  } catch {
    return NextResponse.json({ ok: false, feil: "Ugyldig JSON." }, { status: 400 })
  }

  const antall = Math.floor(Number(payload.antall))
  if (!Number.isFinite(antall) || antall < 1 || antall > 50) {
    return NextResponse.json({ ok: false, feil: "Antall må være mellom 1 og 50." }, { status: 400 })
  }

  const telefon = normalizePhone(payload.telefon)
  if (telefon === "__invalid__") {
    return NextResponse.json({ ok: false, feil: "Ugyldig telefonnummer." }, { status: 400 })
  }
  if (!telefon) {
    return NextResponse.json({ ok: false, feil: "Skriv inn telefonnummer." }, { status: 400 })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { data: lotteri, error: lotteriError } = await admin
    .from("lodd_lotteri")
    .select("id, ticket_price, end_at, status")
    .eq("status", "active")
    .order("start_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lotteriError) {
    const sf = schemaFeil((lotteriError as { message?: string } | null)?.message)
    return NextResponse.json(
      { ok: false, feil: sf ?? "Kunne ikke hente lotteri." },
      { status: sf ? 500 : 400 }
    )
  }
  if (!lotteri?.id || lotteri.status !== "active") {
    return NextResponse.json({ ok: false, feil: "Det er ingen aktivt lotteri nå." }, { status: 400 })
  }

  const endAt = lotteri.end_at ? new Date(lotteri.end_at) : null
  if (endAt && Number.isFinite(endAt.getTime()) && endAt.getTime() <= Date.now()) {
    return NextResponse.json({ ok: false, feil: "Lotteriet er avsluttet." }, { status: 400 })
  }

  const pris = Number(lotteri.ticket_price ?? 20)
  const belop = antall * (Number.isFinite(pris) && pris > 0 ? pris : 20)

  const { data: maxRows, error: maxError } = await admin
    .from("lodd_kjop")
    .select("ticket_to")
    .eq("lotteri_id", lotteri.id)
    .order("ticket_to", { ascending: false })
    .limit(1)

  if (maxError) {
    const sf = schemaFeil((maxError as { message?: string } | null)?.message)
    return NextResponse.json(
      { ok: false, feil: sf ?? "Kunne ikke reservere lodd." },
      { status: sf ? 500 : 400 }
    )
  }

  const currentMax =
    Array.isArray(maxRows) && maxRows.length
      ? Number((maxRows[0] as Record<string, unknown>).ticket_to ?? 0)
      : 0
  const ticketFrom = (Number.isFinite(currentMax) ? currentMax : 0) + 1
  const ticketTo = ticketFrom + antall - 1

  const vippsRef = `OBNO-LODD-${ticketFrom}-${ticketTo}-${crypto.randomUUID().slice(0, 6)}`

  const { data: inserted, error: insertError } = await admin
    .from("lodd_kjop")
    .insert({
      lotteri_id: lotteri.id,
      phone: telefon,
      antall,
      belop,
      status: "pending",
      ticket_from: ticketFrom,
      ticket_to: ticketTo,
      vipps_ref: vippsRef,
    })
    .select("id")
    .maybeSingle()

  if (insertError) {
    const sf = schemaFeil((insertError as { message?: string } | null)?.message)
    return NextResponse.json(
      { ok: false, feil: sf ?? "Kunne ikke opprette kjøp." },
      { status: sf ? 500 : 400 }
    )
  }

  const token = await getVippsToken()
  const subscriptionKey = process.env.VIPPS_SUBSCRIPTION_KEY
  const msn = process.env.VIPPS_MSN
  if (!token || !subscriptionKey || !msn) {
    return NextResponse.json({ ok: false, feil: "Vipps-betaling er ikke konfigurert." }, { status: 500 })
  }

  const phoneNumber = normalizeVippsPhoneForEpayment(telefon)
  if (!phoneNumber) {
    return NextResponse.json({ ok: false, feil: "Ugyldig telefonnummer for Vipps." }, { status: 400 })
  }

  const origin = getPublicOrigin(request)
  const returnUrl = `${origin}/lodd/suksess?from=${encodeURIComponent(
    String(ticketFrom)
  )}&to=${encodeURIComponent(String(ticketTo))}&ref=${encodeURIComponent(vippsRef)}`

  const amountOre = Math.max(0, Math.round(Number(belop) * 100))
  const idempotencyKey = crypto.randomUUID()

  const vippsRes = await fetch(`${vippsBaseUrl()}/epayment/v1/payments`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${token}`,
      "Ocp-Apim-Subscription-Key": subscriptionKey,
      "Merchant-Serial-Number": msn,
      "Idempotency-Key": idempotencyKey,
      "Vipps-System-Name": "obno",
      "Vipps-System-Version": "1",
    },
    body: JSON.stringify({
      amount: { currency: "NOK", value: amountOre },
      customer: { phoneNumber },
      paymentMethod: { type: "WALLET" },
      reference: vippsRef,
      paymentDescription: "OBNO Loddsalg",
      returnUrl,
      userFlow: "WEB_REDIRECT",
    }),
    cache: "no-store",
  })

  const vippsData = (await vippsRes.json().catch(() => ({}))) as { redirectUrl?: string; reference?: string }
  const redirectUrl = String(vippsData.redirectUrl ?? "").trim()
  if (!vippsRes.ok || !redirectUrl) {
    return NextResponse.json({ ok: false, feil: "Kunne ikke opprette Vipps-betaling." }, { status: 400 })
  }

  return NextResponse.json({
    ok: true,
    orderId: inserted?.id ?? null,
    belop,
    vippsRef,
    ticketFrom,
    ticketTo,
    redirectUrl,
  })
}
