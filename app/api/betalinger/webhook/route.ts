import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

type Payload = {
  belop?: number
  motpart?: string
  vare?: string
  notat?: string
  dato?: string
  ekstern_id?: string
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
    return NextResponse.json(
      {
        ok: false,
        feil: "Webhook er ikke konfigurert (mangler miljøvariabler).",
      },
      { status: 500 }
    )
  }

  let payload: Payload
  try {
    payload = (await request.json()) as Payload
  } catch {
    return NextResponse.json({ ok: false, feil: "Ugyldig JSON." }, { status: 400 })
  }

  const belop = Number(payload.belop)
  if (!Number.isFinite(belop) || belop <= 0) {
    return NextResponse.json(
      { ok: false, feil: "Ugyldig beløp." },
      { status: 400 }
    )
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { error } = await supabase.from("regnskap_poster").insert({
    type: "inntekt",
    dato: payload.dato ?? null,
    belop,
    motpart: payload.motpart?.trim() || "Nettside",
    vare: payload.vare?.trim() || null,
    notat: payload.notat?.trim() || null,
    kilde: "nettside",
    ekstern_id: payload.ekstern_id?.trim() || null,
  })

  if (error) {
    return NextResponse.json(
      { ok: false, feil: "Kunne ikke registrere inntekt." },
      { status: 400 }
    )
  }

  return NextResponse.json({ ok: true })
}
