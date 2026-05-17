import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

type Payload = {
  kjop_id?: string
  vipps_ref?: string
}

function parseBearer(request: Request) {
  const header = request.headers.get("authorization") ?? ""
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() ?? ""
}

export async function POST(request: Request) {
  const webhookSecret = process.env.OBNO_WEBHOOK_SECRET
  const token = parseBearer(request)
  if (!webhookSecret || token !== webhookSecret) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ ok: false, feil: "Supabase er ikke konfigurert." }, { status: 500 })
  }

  let payload: Payload
  try {
    payload = (await request.json()) as Payload
  } catch {
    return NextResponse.json({ ok: false, feil: "Ugyldig JSON." }, { status: 400 })
  }

  const kjopId = String(payload.kjop_id ?? "").trim()
  const vippsRef = String(payload.vipps_ref ?? "").trim()
  if (!kjopId && !vippsRef) {
    return NextResponse.json({ ok: false, feil: "Mangler kjop_id eller vipps_ref." }, { status: 400 })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const query = admin.from("lodd_kjop").update({ status: "paid", paid_at: new Date().toISOString() })
  const { error } = kjopId ? await query.eq("id", kjopId) : await query.eq("vipps_ref", vippsRef)

  if (error) {
    return NextResponse.json({ ok: false, feil: "Kunne ikke markere betalt." }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}

