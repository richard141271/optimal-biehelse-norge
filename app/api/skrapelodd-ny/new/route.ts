import { NextResponse } from "next/server"
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

type ResponsePayload =
  | { ok: true; id: string; redirectUrl: string }
  | { ok: false; feil: string }

const DEFAULT_PRIZES = [
  { name: "Kaffepose", weight: 1 },
  { name: "Honning", weight: 1 },
  { name: "Hovedpremie", weight: 1 },
]

function pickRandomPrize() {
  const total = DEFAULT_PRIZES.reduce((sum, p) => sum + p.weight, 0)
  let r = Math.random() * total
  for (const p of DEFAULT_PRIZES) {
    r -= p.weight
    if (r <= 0) return p.name
  }
  return DEFAULT_PRIZES[0]?.name ?? "Premie"
}

export async function POST() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json<ResponsePayload>({ ok: false, feil: "Supabase er ikke konfigurert." }, { status: 500 })
  }

  const admin = createClient<Db>(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  const id = crypto.randomUUID()
  const isWinner = Math.random() < 0.15
  const prizeName = isWinner ? pickRandomPrize() : null

  const { error } = await admin.from("scratch2_tickets").insert({
    id,
    is_winner: isWinner,
    prize_name: prizeName,
    revealed: false,
    claimed: false,
  } as unknown as never)

  if (error) {
    return NextResponse.json<ResponsePayload>({ ok: false, feil: "Kunne ikke opprette skrapelodd." }, { status: 400 })
  }

  return NextResponse.json<ResponsePayload>({ ok: true, id, redirectUrl: `/skrapelodd-ny/${id}` })
}
