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
  | { ok: true; nextUrl: string; ticketNumber: number }
  | { ok: false; feil: string }

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
    "  used boolean not null default false,\n" +
    "  created_at timestamptz not null default now(),\n" +
    "  claimed_at timestamptz\n" +
    ");\n"
  )
}

async function assignNextTicket(admin: ReturnType<typeof createClient<Db>>) {
  for (let i = 0; i < 6; i += 1) {
    const next = await admin
      .from("scratch_tickets")
      .select("id, ticket_number")
      .eq("used", false)
      .order("ticket_number", { ascending: true })
      .limit(1)
      .maybeSingle()

    const id = String((next.data as { id?: string } | null)?.id ?? "").trim()
    const ticketNumber = Number((next.data as { ticket_number?: number } | null)?.ticket_number ?? 0)
    if (!id) return { ok: false as const, status: 409 as const, feil: "Ingen ledige skrapelodd tilgjengelig." }

    const updated = await admin
      .from("scratch_tickets")
      .update({ used: true } as unknown as never)
      .eq("id", id)
      .eq("used", false)
      .select("id, ticket_number")
      .maybeSingle()

    if (updated.data && !updated.error) {
      const updatedTicketNumber = Number(
        (updated.data as { ticket_number?: number } | null)?.ticket_number ?? ticketNumber
      )
      return { ok: true as const, ticketNumber: Number.isFinite(updatedTicketNumber) ? updatedTicketNumber : ticketNumber }
    }
  }

  return { ok: false as const, status: 409 as const, feil: "Kunne ikke tildele skrapelodd. Prøv igjen." }
}

export async function POST() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json<ResponsePayload>({ ok: false, feil: "Supabase er ikke konfigurert." }, { status: 500 })
  }

  const admin = createClient<Db>(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const assigned = await assignNextTicket(admin)
  if (!assigned.ok) {
    const hint = schemaHint(String((assigned as { feil?: unknown } | null)?.feil ?? ""))
    return NextResponse.json<ResponsePayload>(
      { ok: false, feil: hint ?? assigned.feil },
      { status: assigned.status }
    )
  }

  const ticketNumber = assigned.ticketNumber
  if (!Number.isFinite(ticketNumber) || ticketNumber <= 0) {
    return NextResponse.json<ResponsePayload>({ ok: false, feil: "Kunne ikke tildele skrapelodd." }, { status: 500 })
  }

  return NextResponse.json<ResponsePayload>({
    ok: true,
    ticketNumber,
    nextUrl: `/skrapelodd/${ticketNumber}`,
  })
}
