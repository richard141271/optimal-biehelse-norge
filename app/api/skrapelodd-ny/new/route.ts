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
  | { ok: true; id: string; nextUrl: string }
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

function normalizePhone(v: unknown) {
  const digits = String(v ?? "").replace(/\D+/g, "")
  if (!digits) return null
  if (digits.length < 8 || digits.length > 15) return "__invalid__"
  return digits
}

function schemaHint(msg?: string) {
  const text = String(msg ?? "")
  if (!/relation|table|column|does not exist/i.test(text)) return null
  return (
    "Skrapelodd mangler i Supabase. Kjør denne SQL-en i Supabase (SQL Editor), og prøv igjen:\n\n" +
    "create extension if not exists \"pgcrypto\";\n" +
    "create table if not exists public.scratch2_tickets (\n" +
    "  id uuid primary key,\n" +
    "  created_at timestamptz not null default now(),\n" +
    "  phone text,\n" +
    "  antall integer not null default 1,\n" +
    "  vipps_amount integer not null default 20,\n" +
    "  vipps_message text,\n" +
    "  revealed boolean not null default false,\n" +
    "  is_winner boolean not null default false,\n" +
    "  prize_name text,\n" +
    "  claimed boolean not null default false\n" +
    ");\n" +
    "do $$ begin\n" +
    "  if to_regclass('public.scratch2_tickets') is not null then\n" +
    "    alter table public.scratch2_tickets add column if not exists phone text;\n" +
    "    alter table public.scratch2_tickets add column if not exists antall integer not null default 1;\n" +
    "    alter table public.scratch2_tickets add column if not exists vipps_amount integer not null default 20;\n" +
    "    alter table public.scratch2_tickets add column if not exists vipps_message text;\n" +
    "  end if;\n" +
    "end $$;\n"
  )
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json<ResponsePayload>({ ok: false, feil: "Supabase er ikke konfigurert." }, { status: 500 })
  }

  let payload: { telefon?: unknown } = {}
  try {
    payload = (await request.json()) as { telefon?: unknown }
  } catch {
    payload = {}
  }

  const telefon = normalizePhone(payload.telefon)
  if (telefon === "__invalid__") {
    return NextResponse.json<ResponsePayload>({ ok: false, feil: "Ugyldig telefonnummer." }, { status: 400 })
  }
  if (!telefon) {
    return NextResponse.json<ResponsePayload>({ ok: false, feil: "Skriv inn telefonnummer." }, { status: 400 })
  }

  const admin = createClient<Db>(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  const id = crypto.randomUUID()
  const isWinner = Math.random() < 0.15
  const prizeName = isWinner ? pickRandomPrize() : null
  const vippsMessage = `OBNO Skrapelodd ${id}`.trim()

  const { error } = await admin.from("scratch2_tickets").insert({
    id,
    is_winner: isWinner,
    prize_name: prizeName,
    revealed: false,
    claimed: false,
    phone: telefon,
    antall: 1,
    vipps_amount: 20,
    vipps_message: vippsMessage,
  } as unknown as never)

  if (error) {
    const hint = schemaHint(String((error as { message?: string } | null)?.message ?? ""))
    return NextResponse.json<ResponsePayload>(
      { ok: false, feil: hint ?? "Kunne ikke opprette skrapelodd." },
      { status: hint ? 500 : 400 }
    )
  }

  return NextResponse.json<ResponsePayload>({ ok: true, id, nextUrl: `/skrapelodd-ny/${id}` })
}
