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

type ResponsePayload =
  | { ok: true; ticket: { id: string; revealed: true; isWinner: boolean; prizeName: string | null; claimed: boolean } }
  | { ok: false; feil: string }

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
}

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json<ResponsePayload>({ ok: false, feil: "Supabase er ikke konfigurert." }, { status: 500 })
  }

  const params = await context.params
  const id = String(params.id ?? "").trim()
  if (!id || !isUuid(id)) {
    return NextResponse.json<ResponsePayload>({ ok: false, feil: "Ugyldig id." }, { status: 400 })
  }

  const admin = createClient<Db>(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  const updated = await admin
    .from("scratch2_tickets")
    .update({ revealed: true, revealed_at: new Date().toISOString() } as unknown as never)
    .eq("id", id)
    .eq("revealed", false)
    .select("id, revealed, is_winner, prize_name, claimed")
    .maybeSingle()

  if (updated.error) {
    return NextResponse.json<ResponsePayload>({ ok: false, feil: "Kunne ikke oppdatere skrapelodd." }, { status: 400 })
  }

  const row = (updated.data ??
    (await admin
      .from("scratch2_tickets")
      .select("id, revealed, is_winner, prize_name, claimed")
      .eq("id", id)
      .maybeSingle()).data) as {
    id?: string | null
    revealed?: boolean | null
    is_winner?: boolean | null
    prize_name?: string | null
    claimed?: boolean | null
  } | null

  if (!row?.id || !row.revealed) {
    return NextResponse.json<ResponsePayload>({ ok: false, feil: "Ukjent skrapelodd." }, { status: 404 })
  }

  return NextResponse.json<ResponsePayload>({
    ok: true,
    ticket: {
      id,
      revealed: true,
      isWinner: Boolean(row.is_winner),
      prizeName: row.prize_name ?? null,
      claimed: Boolean(row.claimed),
    },
  })
}

