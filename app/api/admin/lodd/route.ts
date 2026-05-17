import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

async function getAuth() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false as const, status: 500 as const, feil: "Supabase er ikke konfigurert." }
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options)
        }
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const email = String(user?.email ?? "").trim().toLowerCase()
  if (!email || !isValidEmail(email)) {
    return { ok: false as const, status: 401 as const, feil: "Ikke innlogget." }
  }

  return { ok: true as const, email, supabaseUrl }
}

function schemaFeil(msg?: string) {
  const text = String(msg ?? "")
  if (!/relation|table|column|does not exist/i.test(text)) return null
  return (
    "Loddsalg mangler i Supabase. Kjør denne SQL-en i Supabase (SQL Editor), og prøv igjen:\n\n" +
    "create table if not exists public.lodd_premier (\n" +
    "  id uuid primary key default gen_random_uuid(),\n" +
    "  created_at timestamptz not null default now(),\n" +
    "  submitted_by_user_id uuid,\n" +
    "  submitted_by_epost text,\n" +
    "  tittel text not null,\n" +
    "  sponsor_navn text,\n" +
    "  sponsor_orgnr text,\n" +
    "  sponsor_nettsted text,\n" +
    "  verdi numeric,\n" +
    "  image_path text,\n" +
    "  status text not null default 'arkiv',\n" +
    "  admin_notat text,\n" +
    "  approved_at timestamptz,\n" +
    "  approved_by_epost text\n" +
    ");\n" +
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
    "create index if not exists lodd_lotteri_status_idx on public.lodd_lotteri (status);\n" +
    "create index if not exists lodd_kjop_lotteri_idx on public.lodd_kjop (lotteri_id, created_at desc);\n" +
    "create index if not exists lodd_kjop_status_idx on public.lodd_kjop (status);\n"
  )
}

async function requireAdmin() {
  const auth = await getAuth()
  if (!auth.ok) return auth

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return { ok: false as const, status: 500 as const, feil: "Mangler SUPABASE_SERVICE_ROLE_KEY." }
  }

  const admin = createClient(auth.supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { data, error } = await admin
    .from("medlemmer")
    .select("role, aktiv")
    .eq("epost", auth.email)
    .maybeSingle()

  if (error) {
    return { ok: false as const, status: 400 as const, feil: "Kunne ikke hente tilgang." }
  }
  if ((data as { aktiv?: unknown } | null)?.aktiv === false) {
    return { ok: false as const, status: 403 as const, feil: "Ingen tilgang." }
  }

  const role = String((data as { role?: unknown } | null)?.role ?? "")
  if (role !== "admin" && role !== "superadmin") {
    return { ok: false as const, status: 403 as const, feil: "Ingen tilgang." }
  }

  return { ok: true as const, admin, role: role as "admin" | "superadmin", email: auth.email }
}

export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ ok: false, feil: gate.feil }, { status: gate.status })

  const { data: lotterier, error: lotteriError } = await gate.admin
    .from("lodd_lotteri")
    .select("id, created_at, tittel, beskrivelse, ticket_price, status, start_at, end_at, winner_loddnr, winner_phone, winner_drawn_at")
    .order("created_at", { ascending: false })
    .limit(20)

  if (lotteriError) {
    const sf = schemaFeil((lotteriError as { message?: string } | null)?.message)
    return NextResponse.json(
      { ok: false, feil: sf ?? "Kunne ikke hente lotteri." },
      { status: sf ? 500 : 400 }
    )
  }

  const active =
    (lotterier ?? []).find(
      (l) => String((l as Record<string, unknown>).status ?? "") === "active"
    ) ?? null

  const { data: premier, error: premieError } = await gate.admin
    .from("lodd_premier")
    .select("id, created_at, tittel, sponsor_navn, sponsor_orgnr, sponsor_nettsted, verdi, image_path, status, submitted_by_epost, admin_notat, approved_at, approved_by_epost")
    .order("created_at", { ascending: false })
    .limit(200)

  if (premieError) {
    const sf = schemaFeil((premieError as { message?: string } | null)?.message)
    return NextResponse.json(
      { ok: false, feil: sf ?? "Kunne ikke hente premier." },
      { status: sf ? 500 : 400 }
    )
  }

  const premieRows = (premier ?? []).map((p) => ({
    ...p,
    image_url: null as string | null,
  }))

  for (const p of premieRows) {
    const path = String((p as Record<string, unknown>).image_path ?? "").trim()
    if (!path) continue
    const { data: signed } = await gate.admin.storage.from("premier").createSignedUrl(path, 60 * 15)
    if (signed?.signedUrl) {
      ;(p as { image_url: string | null }).image_url = signed.signedUrl
    }
  }

  const lotteriId = String((active as Record<string, unknown> | null)?.id ?? "").trim()
  const { data: kjop, error: kjopError } = lotteriId
    ? await gate.admin
        .from("lodd_kjop")
        .select("id, created_at, phone, antall, belop, status, ticket_from, ticket_to, vipps_ref, paid_at")
        .eq("lotteri_id", lotteriId)
        .order("created_at", { ascending: false })
        .limit(500)
    : { data: [], error: null }

  if (kjopError) {
    const sf = schemaFeil((kjopError as { message?: string } | null)?.message)
    return NextResponse.json(
      { ok: false, feil: sf ?? "Kunne ikke hente kjøp." },
      { status: sf ? 500 : 400 }
    )
  }

  const { data: activePremieJoin } = lotteriId
    ? await gate.admin
        .from("lodd_lotteri_premier")
        .select("premie_id, is_hovedpremie, sort_order")
        .eq("lotteri_id", lotteriId)
    : { data: [] }

  return NextResponse.json({
    ok: true,
    role: gate.role,
    lotterier: lotterier ?? [],
    activeLotteri: active,
    premier: premieRows,
    activePremier: activePremieJoin ?? [],
    kjop: kjop ?? [],
  })
}

export async function POST(request: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ ok: false, feil: gate.feil }, { status: gate.status })

  let payload: unknown
  try {
    payload = (await request.json()) as unknown
  } catch {
    return NextResponse.json({ ok: false, feil: "Ugyldig JSON." }, { status: 400 })
  }

  const body = (payload ?? {}) as Record<string, unknown>
  const action = String(body.action ?? "").trim()

  if (action === "createLotteri") {
    const tittel = String(body.tittel ?? "Loddsalg").trim() || "Loddsalg"
    const ticketPrice = Number(body.ticketPrice ?? 20)
    const beskrivelse = String(body.beskrivelse ?? "").trim()
    if (!Number.isFinite(ticketPrice) || ticketPrice <= 0) {
      return NextResponse.json({ ok: false, feil: "Ugyldig pris per lodd." }, { status: 400 })
    }

    const { data, error } = await gate.admin
      .from("lodd_lotteri")
      .insert({
        tittel,
        beskrivelse: beskrivelse || null,
        ticket_price: ticketPrice,
        status: "draft",
        created_by_epost: gate.email,
      })
      .select("id")
      .maybeSingle()

    if (error) {
      const sf = schemaFeil((error as { message?: string } | null)?.message)
      return NextResponse.json(
        { ok: false, feil: sf ?? "Kunne ikke opprette lotteri." },
        { status: sf ? 500 : 400 }
      )
    }

    return NextResponse.json({ ok: true, id: data?.id ?? null })
  }

  if (action === "publishPremie") {
    const premieId = String(body.premieId ?? "").trim()
    const lotteriId = String(body.lotteriId ?? "").trim()
    const isHovedpremie = Boolean(body.isHovedpremie)
    const sortOrder = Number(body.sortOrder ?? 0)
    if (!premieId || !lotteriId) {
      return NextResponse.json({ ok: false, feil: "Mangler premie/lotteri." }, { status: 400 })
    }

    const { error: joinError } = await gate.admin.from("lodd_lotteri_premier").upsert(
      {
        lotteri_id: lotteriId,
        premie_id: premieId,
        is_hovedpremie: isHovedpremie,
        sort_order: Number.isFinite(sortOrder) ? Math.floor(sortOrder) : 0,
      },
      { onConflict: "lotteri_id,premie_id" }
    )

    if (joinError) {
      const sf = schemaFeil((joinError as { message?: string } | null)?.message)
      return NextResponse.json(
        { ok: false, feil: sf ?? "Kunne ikke publisere premie." },
        { status: sf ? 500 : 400 }
      )
    }

    const { error: premieError } = await gate.admin
      .from("lodd_premier")
      .update({
        status: "publisert",
        approved_at: new Date().toISOString(),
        approved_by_epost: gate.email,
      })
      .eq("id", premieId)

    if (premieError) {
      const sf = schemaFeil((premieError as { message?: string } | null)?.message)
      return NextResponse.json(
        { ok: false, feil: sf ?? "Kunne ikke oppdatere premie." },
        { status: sf ? 500 : 400 }
      )
    }

    return NextResponse.json({ ok: true })
  }

  if (action === "unpublishPremie") {
    const premieId = String(body.premieId ?? "").trim()
    const lotteriId = String(body.lotteriId ?? "").trim()
    if (!premieId || !lotteriId) {
      return NextResponse.json({ ok: false, feil: "Mangler premie/lotteri." }, { status: 400 })
    }

    const { error: delError } = await gate.admin
      .from("lodd_lotteri_premier")
      .delete()
      .eq("lotteri_id", lotteriId)
      .eq("premie_id", premieId)

    if (delError) {
      const sf = schemaFeil((delError as { message?: string } | null)?.message)
      return NextResponse.json(
        { ok: false, feil: sf ?? "Kunne ikke fjerne premie fra lotteri." },
        { status: sf ? 500 : 400 }
      )
    }

    const { data: stillLinked } = await gate.admin
      .from("lodd_lotteri_premier")
      .select("premie_id")
      .eq("premie_id", premieId)
      .limit(1)

    if (!stillLinked?.length) {
      await gate.admin.from("lodd_premier").update({ status: "arkiv" }).eq("id", premieId)
    }

    return NextResponse.json({ ok: true })
  }

  if (action === "activateLotteri") {
    const lotteriId = String(body.lotteriId ?? "").trim()
    const durationDays = Math.floor(Number(body.durationDays ?? 14))
    if (!lotteriId) {
      return NextResponse.json({ ok: false, feil: "Mangler lotteri." }, { status: 400 })
    }
    const days = Number.isFinite(durationDays) && durationDays > 0 ? durationDays : 14

    const { data: countRows } = await gate.admin
      .from("lodd_lotteri_premier")
      .select("premie_id")
      .eq("lotteri_id", lotteriId)

    const premieCount = Array.isArray(countRows) ? countRows.length : 0
    if (premieCount < 3) {
      return NextResponse.json({ ok: false, feil: "Lotteri må ha minst 3 premier." }, { status: 400 })
    }

    const now = new Date()
    const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)

    const { error } = await gate.admin
      .from("lodd_lotteri")
      .update({
        status: "active",
        start_at: now.toISOString(),
        end_at: end.toISOString(),
        winner_loddnr: null,
        winner_phone: null,
        winner_drawn_at: null,
        winner_drawn_by_epost: null,
      })
      .eq("id", lotteriId)

    if (error) {
      const sf = schemaFeil((error as { message?: string } | null)?.message)
      return NextResponse.json(
        { ok: false, feil: sf ?? "Kunne ikke starte lotteri." },
        { status: sf ? 500 : 400 }
      )
    }

    return NextResponse.json({ ok: true })
  }

  if (action === "endLotteri") {
    const lotteriId = String(body.lotteriId ?? "").trim()
    if (!lotteriId) {
      return NextResponse.json({ ok: false, feil: "Mangler lotteri." }, { status: 400 })
    }

    const { error } = await gate.admin
      .from("lodd_lotteri")
      .update({ status: "ended" })
      .eq("id", lotteriId)

    if (error) {
      const sf = schemaFeil((error as { message?: string } | null)?.message)
      return NextResponse.json(
        { ok: false, feil: sf ?? "Kunne ikke avslutte lotteri." },
        { status: sf ? 500 : 400 }
      )
    }

    return NextResponse.json({ ok: true })
  }

  if (action === "markPaid") {
    const kjopId = String(body.kjopId ?? "").trim()
    if (!kjopId) {
      return NextResponse.json({ ok: false, feil: "Mangler kjøp." }, { status: 400 })
    }

    const { error } = await gate.admin
      .from("lodd_kjop")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        paid_by_epost: gate.email,
      })
      .eq("id", kjopId)

    if (error) {
      const sf = schemaFeil((error as { message?: string } | null)?.message)
      return NextResponse.json(
        { ok: false, feil: sf ?? "Kunne ikke markere betalt." },
        { status: sf ? 500 : 400 }
      )
    }

    return NextResponse.json({ ok: true })
  }

  if (action === "drawWinner") {
    const lotteriId = String(body.lotteriId ?? "").trim()
    if (!lotteriId) {
      return NextResponse.json({ ok: false, feil: "Mangler lotteri." }, { status: 400 })
    }

    const { data: kjop, error: kjopError } = await gate.admin
      .from("lodd_kjop")
      .select("phone, antall, ticket_from, ticket_to")
      .eq("lotteri_id", lotteriId)
      .eq("status", "paid")
      .order("created_at", { ascending: true })

    if (kjopError) {
      const sf = schemaFeil((kjopError as { message?: string } | null)?.message)
      return NextResponse.json(
        { ok: false, feil: sf ?? "Kunne ikke hente kjøp." },
        { status: sf ? 500 : 400 }
      )
    }

    const rows = Array.isArray(kjop) ? kjop : []
    const total = rows.reduce(
      (sum, r) => sum + Number((r as Record<string, unknown>).antall ?? 0),
      0
    )
    if (!Number.isFinite(total) || total <= 0) {
      return NextResponse.json({ ok: false, feil: "Ingen betalte lodd å trekke blant." }, { status: 400 })
    }

    let idx = Math.floor(Math.random() * total)
    if (idx < 0) idx = 0
    if (idx >= total) idx = total - 1

    let winnerPhone = ""
    let winnerNumber = 0
    for (const r of rows) {
      const rr = r as Record<string, unknown>
      const a = Number(rr.antall ?? 0)
      const from = Number(rr.ticket_from ?? 0)
      if (!a || !Number.isFinite(a) || !from || !Number.isFinite(from)) continue
      if (idx < a) {
        winnerPhone = String(rr.phone ?? "")
        winnerNumber = from + idx
        break
      }
      idx -= a
    }

    if (!winnerPhone || !winnerNumber) {
      return NextResponse.json({ ok: false, feil: "Kunne ikke trekke vinner." }, { status: 400 })
    }

    const { error } = await gate.admin
      .from("lodd_lotteri")
      .update({
        winner_loddnr: winnerNumber,
        winner_phone: winnerPhone,
        winner_drawn_at: new Date().toISOString(),
        winner_drawn_by_epost: gate.email,
      })
      .eq("id", lotteriId)

    if (error) {
      const sf = schemaFeil((error as { message?: string } | null)?.message)
      return NextResponse.json(
        { ok: false, feil: sf ?? "Kunne ikke lagre vinner." },
        { status: sf ? 500 : 400 }
      )
    }

    return NextResponse.json({ ok: true, winnerPhone, winnerNumber })
  }

  return NextResponse.json({ ok: false, feil: "Ugyldig handling." }, { status: 400 })
}

export async function DELETE(request: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ ok: false, feil: gate.feil }, { status: gate.status })
  if (gate.role !== "superadmin") {
    return NextResponse.json({ ok: false, feil: "Kun superbruker kan slette." }, { status: 403 })
  }

  let payload: unknown
  try {
    payload = (await request.json()) as unknown
  } catch {
    return NextResponse.json({ ok: false, feil: "Ugyldig JSON." }, { status: 400 })
  }

  const body = (payload ?? {}) as Record<string, unknown>
  const type = String(body.type ?? "").trim()
  const id = String(body.id ?? "").trim()
  if (!type || !id) {
    return NextResponse.json({ ok: false, feil: "Mangler type/id." }, { status: 400 })
  }

  if (type === "premie") {
    const { data } = await gate.admin.from("lodd_premier").select("image_path").eq("id", id).maybeSingle()
    const imagePath = String((data as Record<string, unknown> | null)?.image_path ?? "").trim()

    const { error } = await gate.admin.from("lodd_premier").delete().eq("id", id)
    if (error) {
      const sf = schemaFeil((error as { message?: string } | null)?.message)
      return NextResponse.json(
        { ok: false, feil: sf ?? "Kunne ikke slette premie." },
        { status: sf ? 500 : 400 }
      )
    }

    if (imagePath) {
      await gate.admin.storage.from("premier").remove([imagePath])
    }

    return NextResponse.json({ ok: true })
  }

  if (type === "kjop") {
    const { error } = await gate.admin.from("lodd_kjop").delete().eq("id", id)
    if (error) {
      const sf = schemaFeil((error as { message?: string } | null)?.message)
      return NextResponse.json(
        { ok: false, feil: sf ?? "Kunne ikke slette kjøp." },
        { status: sf ? 500 : 400 }
      )
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, feil: "Ugyldig type." }, { status: 400 })
}
