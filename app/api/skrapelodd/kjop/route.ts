import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

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

type VippsTokenResponse = {
  access_token?: string
  expires_in?: number
}

type VippsCreatePaymentResponse = {
  redirectUrl?: string
}

type ResponsePayload =
  | { ok: true; redirectUrl: string; ref: string }
  | { ok: false; feil: string }

function vippsMode() {
  const mode = String(process.env.VIPPS_MODE ?? "").trim().toLowerCase()
  if (mode === "vipps") return "vipps"
  if (mode === "stub" || mode === "teststub") return "stub"
  return isVippsConfigured() ? "vipps" : "stub"
}

function isVippsConfigured() {
  return (
    !!process.env.VIPPS_CLIENT_ID &&
    !!process.env.VIPPS_CLIENT_SECRET &&
    !!process.env.VIPPS_SUBSCRIPTION_KEY &&
    !!process.env.VIPPS_MSN
  )
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
  if (cachedToken && cachedToken.expiresAt > now + 15_000) {
    return cachedToken.token
  }

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

function getSiteUrl(request: Request) {
  const env = String(process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? "").trim()
  if (env) return env.replace(/\/+$/, "")
  return new URL(request.url).origin
}

function schemaHint(message: string) {
  const msg = String(message ?? "")
  if (!/relation/i.test(msg) && !/column/i.test(msg)) return null

  return (
    "Mangler tabeller/kolonner for skrapelodd i Supabase. Kjør dette i Supabase (SQL Editor):\n\n" +
    "create table if not exists public.scratch_tickets (\n" +
    "  id uuid primary key default gen_random_uuid(),\n" +
    "  ticket_number integer not null unique,\n" +
    "  prize_name text,\n" +
    "  is_winner boolean not null default false,\n" +
    "  claimed boolean not null default false,\n" +
    "  payment_verified boolean not null default false,\n" +
    "  used boolean not null default false,\n" +
    "  created_at timestamptz not null default now(),\n" +
    "  claimed_at timestamptz\n" +
    ");\n\n" +
    "create table if not exists public.scratch_payments (\n" +
    "  id uuid primary key default gen_random_uuid(),\n" +
    "  amount_ore integer not null,\n" +
    "  status text not null default 'created',\n" +
    "  payment_verified boolean not null default false,\n" +
    "  ticket_id uuid references public.scratch_tickets(id),\n" +
    "  created_at timestamptz not null default now(),\n" +
    "  updated_at timestamptz not null default now()\n" +
    ");\n"
  )
}

async function assignNextTicket(admin: ReturnType<typeof createClient<Db>>, ref: string) {
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
        .update(
          {
            status: "ticket_assigned",
            payment_verified: true,
            ticket_id: id,
            updated_at: new Date().toISOString(),
          } as unknown as never
        )
        .eq("id", ref)
      return { ok: true as const, ticketId: id }
    }
  }

  return { ok: false as const, status: 409 as const, feil: "Kunne ikke tildele skrapelodd. Prøv igjen." }
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json<ResponsePayload>({ ok: false, feil: "Supabase er ikke konfigurert." }, { status: 500 })
  }

  const mode = vippsMode()
  if (mode === "vipps" && !isVippsConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        feil:
          "Vipps er ikke konfigurert. Sett VIPPS_CLIENT_ID, VIPPS_CLIENT_SECRET, VIPPS_SUBSCRIPTION_KEY og VIPPS_MSN.",
      },
      { status: 500 }
    )
  }

  const admin = createClient<Db>(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const ref = crypto.randomUUID()

  const inserted = await admin
    .from("scratch_payments")
    .insert({
      id: ref,
      amount_ore: PRICE_ORE,
      status: "created",
      payment_verified: false,
    } as unknown as never)
    .select("id")
    .maybeSingle()

  if (inserted.error) {
    const hint = schemaHint((inserted.error as { message?: string } | null)?.message ?? "")
    return NextResponse.json<ResponsePayload>(
      { ok: false, feil: hint ?? "Kunne ikke opprette betaling." },
      { status: hint ? 500 : 400 }
    )
  }

  if (mode === "stub") {
    const assigned = await assignNextTicket(admin, ref)
    if (!assigned.ok) {
      return NextResponse.json<ResponsePayload>({ ok: false, feil: assigned.feil }, { status: assigned.status })
    }
    return NextResponse.json<ResponsePayload>({
      ok: true,
      ref,
      redirectUrl: `/skrapelodd/bekreft?ref=${encodeURIComponent(ref)}`,
    })
  }

  const token = await getVippsToken()
  if (!token) {
    return NextResponse.json<ResponsePayload>({ ok: false, feil: "Kunne ikke autentisere mot Vipps." }, { status: 502 })
  }

  const subscriptionKey = process.env.VIPPS_SUBSCRIPTION_KEY as string
  const msn = process.env.VIPPS_MSN as string

  const siteUrl = getSiteUrl(request)
  const returnUrl = `${siteUrl}/skrapelodd/bekreft?ref=${encodeURIComponent(ref)}`

  const idempotencyKey = crypto.randomUUID()
  const createRes = await fetch(`${vippsBaseUrl()}/epayment/v1/payments`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${token}`,
      "Ocp-Apim-Subscription-Key": subscriptionKey,
      "Merchant-Serial-Number": msn,
      "Idempotency-Key": idempotencyKey,
      "Vipps-System-Name": "obno.no",
      "Vipps-System-Version": "1.0",
    },
    body: JSON.stringify({
      amount: { currency: "NOK", value: PRICE_ORE },
      paymentMethod: { type: "WALLET" },
      reference: ref,
      returnUrl,
      userFlow: "WEB_REDIRECT",
      paymentDescription: "OBNO Skrapelodd",
    }),
    cache: "no-store",
  })

  const createData = (await createRes.json().catch(() => ({}))) as VippsCreatePaymentResponse
  const redirectUrl = String(createData.redirectUrl ?? "").trim()

  if (!createRes.ok || !redirectUrl) {
    await admin
      .from("scratch_payments")
      .update({ status: "vipps_failed", updated_at: new Date().toISOString() } as unknown as never)
      .eq("id", ref)
    return NextResponse.json<ResponsePayload>({ ok: false, feil: "Vipps avviste betalingen." }, { status: 502 })
  }

  await admin
    .from("scratch_payments")
    .update({ status: "vipps_created", updated_at: new Date().toISOString() } as unknown as never)
    .eq("id", ref)

  return NextResponse.json<ResponsePayload>({ ok: true, ref, redirectUrl })
}
