import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

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

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function schemaFeil(message: string) {
  const msg = String(message ?? "")
  if (!/relation/i.test(msg) && !/column/i.test(msg)) return null
  if (/scratch_tickets/i.test(msg) || /scratch_payments/i.test(msg)) {
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
  return null
}

async function requireAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false as const, status: 500 as const, feil: "Supabase er ikke konfigurert." }
  }
  if (!serviceRoleKey) {
    return { ok: false as const, status: 500 as const, feil: "Mangler SUPABASE_SERVICE_ROLE_KEY." }
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // ignore
        }
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const userId = user?.id ?? null
  const email = String(user?.email ?? "").trim().toLowerCase()
  if (!userId || !email || !isValidEmail(email)) {
    return { ok: false as const, status: 401 as const, feil: "Ikke innlogget." }
  }

  const admin = createClient<Db>(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const { data, error } = await admin
    .from("medlemmer")
    .select("role, aktiv")
    .eq("user_id", userId)
    .maybeSingle()

  if (error) {
    const msg = String((error as { message?: string } | null)?.message ?? "")
    if (/column/i.test(msg) && /user_id/i.test(msg)) {
      return {
        ok: false as const,
        status: 500 as const,
        feil:
          "Medlemsregister-tabellen mangler feltet user_id. Kjør dette i Supabase (SQL Editor):\n\n" +
          "alter table public.medlemmer add column if not exists user_id uuid;",
      }
    }
    return { ok: false as const, status: 400 as const, feil: "Kunne ikke hente tilgang." }
  }

  if ((data as { aktiv?: unknown } | null)?.aktiv === false) {
    return { ok: false as const, status: 403 as const, feil: "Ingen tilgang." }
  }

  const role = String((data as { role?: unknown } | null)?.role ?? "")
  if (role !== "admin" && role !== "superadmin") {
    const ownerEmail = String(
      process.env.ADMIN_SUPERADMIN_EMAIL ?? process.env.ADMIN_BOOTSTRAP_EMAIL ?? ""
    )
      .trim()
      .toLowerCase()
    if (ownerEmail && email === ownerEmail) {
      return { ok: true as const, admin, role: "superadmin" as const, email }
    }
    return { ok: false as const, status: 403 as const, feil: "Ingen tilgang." }
  }

  return { ok: true as const, admin, role: role as "admin" | "superadmin", email }
}

export async function GET(request: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ ok: false, feil: gate.feil }, { status: gate.status })

  const url = new URL(request.url)
  const q = String(url.searchParams.get("q") ?? "").trim()
  const limitRaw = Number(url.searchParams.get("limit") ?? "200")
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.round(limitRaw))) : 200

  let query = gate.admin
    .from("scratch_tickets")
    .select("id, ticket_number, prize_name, is_winner, claimed, payment_verified, used, created_at, claimed_at")
    .order("ticket_number", { ascending: true })
    .limit(limit)

  if (q) {
    const num = Number(q)
    if (Number.isFinite(num)) {
      query = query.eq("ticket_number", Math.round(num))
    }
  }

  const { data: tickets, error } = await query
  if (error) {
    const sf = schemaFeil((error as { message?: string } | null)?.message ?? "")
    return NextResponse.json({ ok: false, feil: sf ?? "Kunne ikke hente skrapelodd." }, { status: sf ? 500 : 400 })
  }

  const total = await gate.admin.from("scratch_tickets").select("id", { count: "exact", head: true })
  const used = await gate.admin.from("scratch_tickets").select("id", { count: "exact", head: true }).eq("used", true)
  const winners = await gate.admin
    .from("scratch_tickets")
    .select("id", { count: "exact", head: true })
    .eq("is_winner", true)
  const claimed = await gate.admin
    .from("scratch_tickets")
    .select("id", { count: "exact", head: true })
    .eq("claimed", true)

  return NextResponse.json({
    ok: true,
    role: gate.role,
    stats: {
      total: total.count ?? 0,
      used: used.count ?? 0,
      winners: winners.count ?? 0,
      claimed: claimed.count ?? 0,
    },
    tickets: tickets ?? [],
  })
}

type ActionPayload =
  | { action: "createBatch"; from: number; to: number }
  | { action: "setPrize"; ticketNumber: number; prizeName: string; isWinner: boolean }
  | { action: "markClaimed"; ticketId: string; claimed: boolean }

export async function POST(request: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ ok: false, feil: gate.feil }, { status: gate.status })

  let payload: ActionPayload
  try {
    payload = (await request.json()) as ActionPayload
  } catch {
    return NextResponse.json({ ok: false, feil: "Ugyldig JSON." }, { status: 400 })
  }

  if (payload.action === "createBatch") {
    const from = Math.max(1, Math.round(Number(payload.from)))
    const to = Math.max(from, Math.round(Number(payload.to)))
    if (!Number.isFinite(from) || !Number.isFinite(to) || to - from > 5000) {
      return NextResponse.json({ ok: false, feil: "Ugyldig intervall." }, { status: 400 })
    }

    const rows = Array.from({ length: to - from + 1 }, (_, i) => ({
      ticket_number: from + i,
      is_winner: false,
      used: false,
      claimed: false,
      payment_verified: false,
      prize_name: null as string | null,
    }))

    const { error } = await gate.admin
      .from("scratch_tickets")
      .upsert(rows as unknown as never[], { onConflict: "ticket_number", ignoreDuplicates: true })

    if (error) {
      const sf = schemaFeil((error as { message?: string } | null)?.message ?? "")
      return NextResponse.json({ ok: false, feil: sf ?? "Kunne ikke opprette lodd." }, { status: sf ? 500 : 400 })
    }

    return NextResponse.json({ ok: true })
  }

  if (payload.action === "setPrize") {
    const ticketNumber = Math.round(Number(payload.ticketNumber))
    const prizeName = String(payload.prizeName ?? "").trim()
    const isWinner = Boolean(payload.isWinner)
    if (!Number.isFinite(ticketNumber) || ticketNumber <= 0) {
      return NextResponse.json({ ok: false, feil: "Ugyldig loddnummer." }, { status: 400 })
    }
    if (isWinner && !prizeName) {
      return NextResponse.json({ ok: false, feil: "Premienavn mangler." }, { status: 400 })
    }

    const { error } = await gate.admin.from("scratch_tickets").upsert(
      {
        ticket_number: ticketNumber,
        prize_name: prizeName || null,
        is_winner: isWinner,
      } as unknown as never,
      { onConflict: "ticket_number" }
    )

    if (error) {
      const sf = schemaFeil((error as { message?: string } | null)?.message ?? "")
      return NextResponse.json({ ok: false, feil: sf ?? "Kunne ikke lagre premie." }, { status: sf ? 500 : 400 })
    }

    return NextResponse.json({ ok: true })
  }

  if (payload.action === "markClaimed") {
    const ticketId = String(payload.ticketId ?? "").trim()
    if (!ticketId) {
      return NextResponse.json({ ok: false, feil: "Mangler ticketId." }, { status: 400 })
    }

    const claimed = Boolean(payload.claimed)
    const update = claimed ? { claimed: true, claimed_at: new Date().toISOString() } : { claimed: false, claimed_at: null }

    const { error } = await gate.admin.from("scratch_tickets").update(update as unknown as never).eq("id", ticketId)
    if (error) {
      return NextResponse.json({ ok: false, feil: "Kunne ikke oppdatere status." }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, feil: "Ukjent action." }, { status: 400 })
}
