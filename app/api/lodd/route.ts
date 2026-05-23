import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

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
    "  sale_duration_minutes integer not null default 10080,\n" +
    "  status text not null default 'draft',\n" +
    "  start_at timestamptz,\n" +
    "  end_at timestamptz,\n" +
    "  created_by_epost text,\n" +
    "  winner_loddnr integer,\n" +
    "  winner_phone text,\n" +
    "  winner_drawn_at timestamptz,\n" +
    "  winner_drawn_by_epost text\n" +
    ");\n" +
    "do $$ begin\n" +
    "  if to_regclass('public.lodd_lotteri') is not null then\n" +
    "    alter table public.lodd_lotteri add column if not exists sale_duration_minutes integer not null default 10080;\n" +
    "  end if;\n" +
    "end $$;\n" +
    "create table if not exists public.lodd_lotteri_premier (\n" +
    "  lotteri_id uuid not null references public.lodd_lotteri(id) on delete cascade,\n" +
    "  premie_id uuid not null references public.lodd_premier(id) on delete cascade,\n" +
    "  is_hovedpremie boolean not null default false,\n" +
    "  sort_order integer not null default 0,\n" +
    "  primary key (lotteri_id, premie_id)\n" +
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
    ");\n" +
    "create table if not exists public.lodd_winners (\n" +
    "  id uuid primary key default gen_random_uuid(),\n" +
    "  created_at timestamptz not null default now(),\n" +
    "  lotteri_id uuid not null references public.lodd_lotteri(id) on delete cascade,\n" +
    "  premie_id uuid references public.lodd_premier(id) on delete set null,\n" +
    "  winner_loddnr integer not null,\n" +
    "  winner_phone text not null,\n" +
    "  drawn_by_epost text\n" +
    ");\n" +
    "do $$ begin\n" +
    "  if to_regclass('public.lodd_winners') is not null then\n" +
    "    alter table public.lodd_winners add column if not exists premie_id uuid references public.lodd_premier(id) on delete set null;\n" +
    "  end if;\n" +
    "end $$;\n" +
    "create index if not exists lodd_kjop_lotteri_idx on public.lodd_kjop (lotteri_id, created_at desc);\n" +
    "create index if not exists lodd_kjop_status_idx on public.lodd_kjop (status);\n"
  )
}

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { ok: false, feil: "Supabase er ikke konfigurert." },
      { status: 500 }
    )
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { data: lotteri, error: lotteriError } = await admin
    .from("lodd_lotteri")
    .select(
      "id, tittel, beskrivelse, ticket_price, sale_duration_minutes, status, start_at, end_at, winner_loddnr, winner_phone, winner_drawn_at"
    )
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

  if (!lotteri?.id) {
    return NextResponse.json({ ok: true, lotteri: null, premier: [], stats: { solgt: 0 } })
  }

  const { data: joinRows, error: premieError } = await admin
    .from("lodd_lotteri_premier")
    .select("is_hovedpremie, sort_order, premie:lodd_premier(id, tittel, sponsor_navn, sponsor_nettsted, verdi, image_path)")
    .eq("lotteri_id", lotteri.id)
    .order("is_hovedpremie", { ascending: false })
    .order("sort_order", { ascending: true })

  if (premieError) {
    const sf = schemaFeil((premieError as { message?: string } | null)?.message)
    return NextResponse.json(
      { ok: false, feil: sf ?? "Kunne ikke hente premier." },
      { status: sf ? 500 : 400 }
    )
  }

  const imagePathById = new Map<string, string>()
  const premier = (joinRows ?? []).map((r) => {
    const rr = r as Record<string, unknown>
    const p = (rr.premie as Record<string, unknown> | null) ?? null
    const id = String(p?.id ?? "")
    const imagePath = String(p?.image_path ?? "").trim()
    if (id && imagePath) imagePathById.set(id, imagePath)

    return {
      id,
      tittel: (p?.tittel as string | null) ?? null,
      sponsor_navn: (p?.sponsor_navn as string | null) ?? null,
      sponsor_nettsted: (p?.sponsor_nettsted as string | null) ?? null,
      verdi: (p?.verdi as number | null) ?? null,
      image_url: null as string | null,
      is_hovedpremie: Boolean(rr.is_hovedpremie),
      sort_order: Number(rr.sort_order ?? 0),
    }
  })

  for (const p of premier) {
    const path = imagePathById.get(p.id) ?? ""
    if (!path) continue
    const { data: signed } = await admin.storage.from("premier").createSignedUrl(path, 60 * 15)
    if (signed?.signedUrl) p.image_url = signed.signedUrl
  }

  const { data: statsRows } = await admin
    .from("lodd_kjop")
    .select("antall")
    .eq("lotteri_id", lotteri.id)
    .eq("status", "paid")

  const solgt = Array.isArray(statsRows)
    ? statsRows.reduce((sum, r) => sum + Number((r as { antall?: unknown }).antall ?? 0), 0)
    : 0

  const { data: winners, error: winnersError } = await admin
    .from("lodd_winners")
    .select("winner_loddnr, created_at")
    .eq("lotteri_id", lotteri.id)
    .order("created_at", { ascending: true })
    .limit(200)

  if (winnersError) {
    const sf = schemaFeil((winnersError as { message?: string } | null)?.message)
    return NextResponse.json(
      { ok: false, feil: sf ?? "Kunne ikke hente vinnere." },
      { status: sf ? 500 : 400 }
    )
  }

  return NextResponse.json({
    ok: true,
    lotteri,
    premier,
    stats: { solgt },
    winners: winners ?? [],
  })
}
