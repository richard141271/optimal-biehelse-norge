import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

function normalizePhone(v: unknown) {
  const digits = String(v ?? "").replace(/\D+/g, "")
  if (!digits) return null
  if (digits.length < 8 || digits.length > 15) return "__invalid__"
  return digits
}

function schemaFeil(msg?: string) {
  const text = String(msg ?? "")
  if (!/relation|table|column|does not exist/i.test(text)) return null
  return (
    "Loddsalg mangler i Supabase. Kjør denne SQL-en i Supabase (SQL Editor), og prøv igjen:\n\n" +
    "create table if not exists public.lodd_lotteri (\n" +
    "  id uuid primary key default gen_random_uuid(),\n" +
    "  created_at timestamptz not null default now(),\n" +
    "  tittel text not null default 'Loddsalg',\n" +
    "  beskrivelse text,\n" +
    "  ticket_price numeric not null default 20,\n" +
    "  status text not null default 'draft',\n" +
    "  start_at timestamptz,\n" +
    "  end_at timestamptz,\n" +
    "  created_by_epost text,\n" +
    "  winner_loddnr integer,\n" +
    "  winner_phone text,\n" +
    "  winner_drawn_at timestamptz,\n" +
    "  winner_drawn_by_epost text\n" +
    ");\n" +
    "create table if not exists public.lodd_kjop (\n" +
    "  id uuid primary key default gen_random_uuid(),\n" +
    "  created_at timestamptz not null default now(),\n" +
    "  lotteri_id uuid not null references public.lodd_lotteri(id) on delete cascade,\n" +
    "  phone text not null,\n" +
    "  antall integer not null,\n" +
    "  belop numeric not null,\n" +
    "  status text not null default 'pending',\n" +
    "  ticket_from integer,\n" +
    "  ticket_to integer,\n" +
    "  vipps_ref text,\n" +
    "  paid_at timestamptz,\n" +
    "  paid_by_epost text,\n" +
    "  note text\n" +
    ");\n"
  )
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ ok: false, feil: "Supabase er ikke konfigurert." }, { status: 500 })
  }

  let payload: { antall?: unknown; telefon?: unknown }
  try {
    payload = (await request.json()) as { antall?: unknown; telefon?: unknown }
  } catch {
    return NextResponse.json({ ok: false, feil: "Ugyldig JSON." }, { status: 400 })
  }

  const antall = Math.floor(Number(payload.antall))
  if (!Number.isFinite(antall) || antall < 1 || antall > 50) {
    return NextResponse.json({ ok: false, feil: "Antall må være mellom 1 og 50." }, { status: 400 })
  }

  const telefon = normalizePhone(payload.telefon)
  if (telefon === "__invalid__") {
    return NextResponse.json({ ok: false, feil: "Ugyldig telefonnummer." }, { status: 400 })
  }
  if (!telefon) {
    return NextResponse.json({ ok: false, feil: "Skriv inn telefonnummer." }, { status: 400 })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { data: lotteri, error: lotteriError } = await admin
    .from("lodd_lotteri")
    .select("id, ticket_price, end_at, status")
    .eq("status", "active")
    .order("start_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lotteriError) {
    const sf = schemaFeil((lotteriError as { message?: string } | null)?.message)
    return NextResponse.json(
      { ok: false, feil: sf ?? "Kunne ikke hente lotteri." },
      { status: sf ? 500 : 400 }
    )
  }
  if (!lotteri?.id || lotteri.status !== "active") {
    return NextResponse.json({ ok: false, feil: "Det er ingen aktivt lotteri nå." }, { status: 400 })
  }

  const endAt = lotteri.end_at ? new Date(lotteri.end_at) : null
  if (endAt && Number.isFinite(endAt.getTime()) && endAt.getTime() <= Date.now()) {
    return NextResponse.json({ ok: false, feil: "Lotteriet er avsluttet." }, { status: 400 })
  }

  const pris = Number(lotteri.ticket_price ?? 20)
  const belop = antall * (Number.isFinite(pris) && pris > 0 ? pris : 20)

  const { data: maxRows, error: maxError } = await admin
    .from("lodd_kjop")
    .select("ticket_to")
    .eq("lotteri_id", lotteri.id)
    .order("ticket_to", { ascending: false })
    .limit(1)

  if (maxError) {
    const sf = schemaFeil((maxError as { message?: string } | null)?.message)
    return NextResponse.json(
      { ok: false, feil: sf ?? "Kunne ikke reservere lodd." },
      { status: sf ? 500 : 400 }
    )
  }

  const currentMax =
    Array.isArray(maxRows) && maxRows.length
      ? Number((maxRows[0] as Record<string, unknown>).ticket_to ?? 0)
      : 0
  const ticketFrom = (Number.isFinite(currentMax) ? currentMax : 0) + 1
  const ticketTo = ticketFrom + antall - 1

  const vippsRef = `lodd-${ticketFrom}-${ticketTo}-${crypto.randomUUID().slice(0, 8)}`

  const { data: inserted, error: insertError } = await admin
    .from("lodd_kjop")
    .insert({
      lotteri_id: lotteri.id,
      phone: telefon,
      antall,
      belop,
      status: "pending",
      ticket_from: ticketFrom,
      ticket_to: ticketTo,
      vipps_ref: vippsRef,
    })
    .select("id")
    .maybeSingle()

  if (insertError) {
    const sf = schemaFeil((insertError as { message?: string } | null)?.message)
    return NextResponse.json(
      { ok: false, feil: sf ?? "Kunne ikke opprette kjøp." },
      { status: sf ? 500 : 400 }
    )
  }

  return NextResponse.json({
    ok: true,
    orderId: inserted?.id ?? null,
    belop,
    vippsRef,
    ticketFrom,
    ticketTo,
  })
}
