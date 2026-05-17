import { NextResponse } from "next/server"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const PRICE_ORE = 2000

type Db = {
  public: {
    Tables: Record<
      string,
      {
        Row: Record<string, unknown>
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
        Relationships: unknown[]
      }
    >
  }
}

type AdminClient = SupabaseClient<Db>

type VippsTokenResponse = {
  access_token?: string
  expires_in?: number
}

type VippsPaymentResponse = {
  state?: string
}

type VippsCaptureResponse = {
  pspReference?: string
}

function vippsMode() {
  const mode = String(process.env.VIPPS_MODE ?? "").trim().toLowerCase()
  if (mode === "vipps") return "vipps"
  if (mode === "stub" || mode === "teststub") return "stub"
  return (
    !!process.env.VIPPS_CLIENT_ID &&
    !!process.env.VIPPS_CLIENT_SECRET &&
    !!process.env.VIPPS_SUBSCRIPTION_KEY &&
    !!process.env.VIPPS_MSN
  )
    ? "vipps"
    : "stub"
}

function vippsBaseUrl() {
  const env = String(process.env.VIPPS_ENV ?? "").trim().toLowerCase()
  return env === "prod" || env === "production" ? "https://api.vipps.no" : "https://apitest.vipps.no"
}

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

async function assignNextTicket(admin: AdminClient, ref: string) {
  for (let i = 0; i < 6; i += 1) {
    const next = await admin
      .from("scratch_tickets")
      .select("id")
      .eq("used", false)
      .order("ticket_number", { ascending: true })
      .limit(1)
      .maybeSingle()

    const id = String((next.data as { id?: string } | null)?.id ?? "").trim()
    if (!id) return { ok: false as const, status: 409 as const, feil: "Ingen ledige skrapelodd tilgjengelig." }

    const updated = await admin
      .from("scratch_tickets")
      .update({ used: true, payment_verified: true } as unknown as never)
      .eq("id", id)
      .eq("used", false)
      .select("id")
      .maybeSingle()

    if (updated.data && !updated.error) {
      await admin
        .from("scratch_payments")
        .update({
          status: "ticket_assigned",
          payment_verified: true,
          ticket_id: id,
          updated_at: new Date().toISOString(),
        } as unknown as never)
        .eq("id", ref)
      return { ok: true as const, ticketId: id }
    }
  }

  return { ok: false as const, status: 409 as const, feil: "Kunne ikke tildele skrapelodd. Prøv igjen." }
}

async function captureIfNeeded(token: string, ref: string) {
  const subscriptionKey = process.env.VIPPS_SUBSCRIPTION_KEY as string
  const msn = process.env.VIPPS_MSN as string

  const paymentRes = await fetch(`${vippsBaseUrl()}/epayment/v1/payments/${encodeURIComponent(ref)}`, {
    method: "GET",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${token}`,
      "Ocp-Apim-Subscription-Key": subscriptionKey,
      "Merchant-Serial-Number": msn,
    },
    cache: "no-store",
  })

  const payment = (await paymentRes.json().catch(() => ({}))) as VippsPaymentResponse
  const state = String(payment.state ?? "").trim().toUpperCase()
  if (!paymentRes.ok) return { ok: false as const, state: null }

  if (state === "CAPTURED") return { ok: true as const, state: "CAPTURED" as const }
  if (state !== "AUTHORIZED") return { ok: true as const, state: state || null }

  const idempotencyKey = crypto.randomUUID()
  const captureRes = await fetch(
    `${vippsBaseUrl()}/epayment/v1/payments/${encodeURIComponent(ref)}/capture`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${token}`,
        "Ocp-Apim-Subscription-Key": subscriptionKey,
        "Merchant-Serial-Number": msn,
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        modificationAmount: { currency: "NOK", value: PRICE_ORE },
      }),
      cache: "no-store",
    }
  )

  const capture = (await captureRes.json().catch(() => ({}))) as VippsCaptureResponse
  if (!captureRes.ok) return { ok: true as const, state: "AUTHORIZED" as const }

  return { ok: true as const, state: "CAPTURED" as const, pspReference: capture.pspReference ?? null }
}

export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ ok: false, feil: "Supabase er ikke konfigurert." }, { status: 500 })
  }

  const url = new URL(request.url)
  const ref = String(url.searchParams.get("ref") ?? "").trim()
  if (!ref) {
    return NextResponse.json({ ok: false, feil: "Mangler ref." }, { status: 400 })
  }

  const admin = createClient<Db>(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const payment = await admin
    .from("scratch_payments")
    .select("id, status, payment_verified, ticket_id")
    .eq("id", ref)
    .maybeSingle()

  if (payment.error) {
    return NextResponse.json({ ok: false, feil: "Kunne ikke hente betaling." }, { status: 400 })
  }
  if (!payment.data) {
    return NextResponse.json({ ok: false, feil: "Ukjent betaling." }, { status: 404 })
  }

  const row = payment.data as {
    status?: string | null
    payment_verified?: boolean | null
    ticket_id?: string | null
  }

  if (row.payment_verified && row.ticket_id) {
    return NextResponse.json({ ok: true, state: "READY", ready: true })
  }

  if (vippsMode() === "stub") {
    const assigned = await assignNextTicket(admin, ref)
    if (!assigned.ok) {
      return NextResponse.json({ ok: false, feil: assigned.feil }, { status: assigned.status })
    }
    return NextResponse.json({ ok: true, state: "READY", ready: true })
  }

  const token = await getVippsToken()
  if (!token) {
    return NextResponse.json({ ok: true, state: row.status ?? null, ready: false })
  }

  const checked = await captureIfNeeded(token, ref)
  if (!checked.ok) {
    return NextResponse.json({ ok: true, state: row.status ?? null, ready: false })
  }

  const state = checked.state
  if (state === "ABORTED" || state === "EXPIRED" || state === "TERMINATED" || state === "CANCELLED") {
    await admin
      .from("scratch_payments")
      .update({ status: `vipps_${state.toLowerCase()}`, updated_at: new Date().toISOString() } as unknown as never)
      .eq("id", ref)
    return NextResponse.json(
      { ok: false, feil: "Betalingen ble ikke fullført i Vipps." },
      { status: 402 }
    )
  }

  if (state === "CAPTURED") {
    const assigned = await assignNextTicket(admin, ref)
    if (!assigned.ok) {
      return NextResponse.json({ ok: false, feil: assigned.feil }, { status: assigned.status })
    }
    return NextResponse.json({ ok: true, state: "READY", ready: true })
  }

  await admin
    .from("scratch_payments")
    .update({ status: `vipps_${String(state ?? "unknown").toLowerCase()}`, updated_at: new Date().toISOString() } as unknown as never)
    .eq("id", ref)

  return NextResponse.json({ ok: true, state: state ?? null, ready: false })
}
