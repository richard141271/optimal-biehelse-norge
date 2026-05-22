import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

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

function isDigits(v: string) {
  return /^\d+$/.test(v)
}

export async function GET(_request: NextRequest, context: { params: Promise<{ ref: string }> }) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ ok: false, feil: "Supabase er ikke konfigurert." }, { status: 500 })
  }

  const params = await context.params
  const ref = String(params.ref ?? "").trim()
  if (!ref || !isDigits(ref)) {
    return NextResponse.json({ ok: false, feil: "Ugyldig referanse." }, { status: 400 })
  }

  const ticketNumber = Number(ref)
  if (!Number.isFinite(ticketNumber) || ticketNumber <= 0) {
    return NextResponse.json({ ok: false, feil: "Ugyldig referanse." }, { status: 400 })
  }

  const admin = createClient<Db>(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const ticket = await admin
    .from("scratch_tickets")
    .select("ticket_number, prize_name, is_winner, claimed")
    .eq("ticket_number", ticketNumber)
    .maybeSingle()

  if (ticket.error) {
    return NextResponse.json({ ok: false, feil: "Kunne ikke hente skrapelodd." }, { status: 400 })
  }

  if (!ticket.data) {
    return NextResponse.json({ ok: false, feil: "Ukjent skrapelodd." }, { status: 404 })
  }

  const t = ticket.data as {
    ticket_number?: number | null
    prize_name?: string | null
    is_winner?: boolean | null
    claimed?: boolean | null
  }

  return NextResponse.json({
    ok: true,
    ticket: {
      ticketNumber: Number(t.ticket_number ?? 0),
      prizeName: t.prize_name ?? null,
      isWinner: Boolean(t.is_winner),
      claimed: Boolean(t.claimed),
    },
  })
}
