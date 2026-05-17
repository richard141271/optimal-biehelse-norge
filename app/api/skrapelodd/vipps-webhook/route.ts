import { NextResponse } from "next/server"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import crypto from "crypto"

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

type WebhookPayload = {
  reference?: string
  name?: string
  success?: boolean
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

function parseAuthorizationSignature(authHeader: string) {
  const m = authHeader.match(/Signature=([^&\s]+)\s*$/i)
  return m?.[1]?.trim() ?? ""
}

function timingSafeEqual(a: string, b: string) {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return crypto.timingSafeEqual(ab, bb)
}

function verifyWebhookSignature(params: {
  secret: string
  method: string
  pathAndQuery: string
  host: string
  xMsDate: string
  xMsContentSha256: string
  authorization: string
  rawBody: string
}) {
  const {
    secret,
    method,
    pathAndQuery,
    host,
    xMsDate,
    xMsContentSha256,
    authorization,
    rawBody,
  } = params

  const expectedContentHash = crypto.createHash("sha256").update(rawBody).digest("base64")
  if (!timingSafeEqual(xMsContentSha256, expectedContentHash)) return false

  const expectedSignedString = `${method}\n${pathAndQuery}\n${xMsDate};${host};${xMsContentSha256}`
  const expectedSignature = crypto.createHmac("sha256", secret).update(expectedSignedString).digest("base64")
  const signature = parseAuthorizationSignature(authorization)
  return signature ? timingSafeEqual(signature, expectedSignature) : false
}

async function assignNextTicket(admin: AdminClient, ref: string) {
  const existing = await admin
    .from("scratch_payments")
    .select("ticket_id, payment_verified")
    .eq("id", ref)
    .maybeSingle()

  const existingRow = existing.data as { ticket_id?: string | null; payment_verified?: boolean | null } | null
  if (existingRow?.ticket_id && existingRow.payment_verified) {
    return { ok: true as const, already: true as const }
  }

  for (let i = 0; i < 6; i += 1) {
    const next = await admin
      .from("scratch_tickets")
      .select("id")
      .eq("used", false)
      .order("ticket_number", { ascending: true })
      .limit(1)
      .maybeSingle()

    const id = String((next.data as { id?: string } | null)?.id ?? "").trim()
    if (!id) return { ok: false as const, feil: "Ingen ledige skrapelodd." }

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

  return { ok: false as const, feil: "Kunne ikke tildele skrapelodd." }
}

async function capturePayment(token: string, ref: string) {
  const subscriptionKey = process.env.VIPPS_SUBSCRIPTION_KEY as string
  const msn = process.env.VIPPS_MSN as string
  const idempotencyKey = crypto.randomUUID()

  const res = await fetch(`${vippsBaseUrl()}/epayment/v1/payments/${encodeURIComponent(ref)}/capture`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${token}`,
      "Ocp-Apim-Subscription-Key": subscriptionKey,
      "Merchant-Serial-Number": msn,
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ modificationAmount: { currency: "NOK", value: PRICE_ORE } }),
    cache: "no-store",
  })

  return res.ok
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ ok: false }, { status: 500 })
  }

  const secret = String(process.env.VIPPS_WEBHOOK_SECRET ?? "").trim()
  if (!secret) {
    return NextResponse.json({ ok: false }, { status: 500 })
  }

  const rawBody = await request.text()

  const url = new URL(request.url)
  const pathAndQuery = `${url.pathname}${url.search}`
  const host = String(request.headers.get("host") ?? url.host).trim()
  const xMsDate = String(request.headers.get("x-ms-date") ?? "").trim()
  const xMsContentSha256 = String(request.headers.get("x-ms-content-sha256") ?? "").trim()
  const authorization = String(request.headers.get("authorization") ?? "").trim()

  const okSig = verifyWebhookSignature({
    secret,
    method: request.method,
    pathAndQuery,
    host,
    xMsDate,
    xMsContentSha256,
    authorization,
    rawBody,
  })

  if (!okSig) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  let payload: WebhookPayload
  try {
    payload = JSON.parse(rawBody) as WebhookPayload
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const ref = String(payload.reference ?? "").trim()
  const name = String(payload.name ?? "").trim().toUpperCase()
  const success = Boolean(payload.success)
  if (!ref) return NextResponse.json({ ok: true })

  const admin = createClient<Db>(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const exists = await admin.from("scratch_payments").select("id").eq("id", ref).maybeSingle()
  if (exists.error || !exists.data) return NextResponse.json({ ok: true })

  await admin
    .from("scratch_payments")
    .update({ status: `vipps_${name.toLowerCase()}`, updated_at: new Date().toISOString() } as unknown as never)
    .eq("id", ref)

  if (!success) return NextResponse.json({ ok: true })

  if (name === "AUTHORIZED") {
    const token = await getVippsToken()
    if (token) {
      await capturePayment(token, ref)
    }
    return NextResponse.json({ ok: true })
  }

  if (name === "CAPTURED") {
    const assigned = await assignNextTicket(admin, ref)
    if (!assigned.ok) {
      return NextResponse.json({ ok: false }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: true })
}
