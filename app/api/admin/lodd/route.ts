import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function normalizePhone(v: unknown) {
  const digits = String(v ?? "").replace(/\D+/g, "")
  if (!digits) return null
  if (digits.length < 8 || digits.length > 15) return "__invalid__"
  return digits
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

  const userId = user?.id ?? null
  const email = String(user?.email ?? "").trim().toLowerCase()
  if (!userId || !email || !isValidEmail(email)) {
    return { ok: false as const, status: 401 as const, feil: "Ikke innlogget." }
  }

  return { ok: true as const, userId, email, supabaseUrl }
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
    .eq("user_id", auth.userId)
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
    if (ownerEmail && auth.email === ownerEmail) {
      return { ok: true as const, admin, role: "superadmin" as const, email: auth.email }
    }
    return { ok: false as const, status: 403 as const, feil: "Ingen tilgang." }
  }

  return { ok: true as const, admin, role: role as "admin" | "superadmin", email: auth.email }
}

export async function GET(request: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ ok: false, feil: gate.feil }, { status: gate.status })

  const url = new URL(request.url)
  const requestedLotteriId = String(url.searchParams.get("lotteriId") ?? "").trim()

  const { data: lotterier, error: lotteriError } = await gate.admin
    .from("lodd_lotteri")
    .select("id, created_at, tittel, beskrivelse, ticket_price, sale_duration_minutes, status, start_at, end_at, winner_loddnr, winner_phone, winner_drawn_at")
    .order("created_at", { ascending: false })
    .limit(20)

  if (lotteriError) {
    const sf = schemaFeil((lotteriError as { message?: string } | null)?.message)
    return NextResponse.json(
      { ok: false, feil: sf ?? "Kunne ikke hente lotteri." },
      { status: sf ? 500 : 400 }
    )
  }

  const lotteriRows = lotterier ?? []
  const activePublic =
    lotteriRows.find((l) => String((l as Record<string, unknown>).status ?? "") === "active") ?? null
  const firstDraft =
    lotteriRows.find((l) => String((l as Record<string, unknown>).status ?? "") === "draft") ?? null

  const selectedLotteriId =
    requestedLotteriId ||
    String((activePublic as Record<string, unknown> | null)?.id ?? "").trim() ||
    String((firstDraft as Record<string, unknown> | null)?.id ?? "").trim() ||
    ""

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

  const lotteriIds = lotteriRows
    .map((l) => String((l as Record<string, unknown>).id ?? "").trim())
    .filter(Boolean)

  const { data: premieLinks } = lotteriIds.length
    ? await gate.admin
        .from("lodd_lotteri_premier")
        .select("lotteri_id, premie_id, is_hovedpremie, sort_order")
        .in("lotteri_id", lotteriIds)
        .limit(2000)
    : { data: [] }

  const { data: kjop, error: kjopError } = selectedLotteriId
    ? await gate.admin
        .from("lodd_kjop")
        .select("id, created_at, phone, antall, belop, status, ticket_from, ticket_to, vipps_ref, paid_at")
        .eq("lotteri_id", selectedLotteriId)
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

  const { data: selectedPremieJoin } = selectedLotteriId
    ? await gate.admin
        .from("lodd_lotteri_premier")
        .select("premie_id, is_hovedpremie, sort_order")
        .eq("lotteri_id", selectedLotteriId)
    : { data: [] }

  const { data: winners, error: winnersError } = selectedLotteriId
    ? await gate.admin
        .from("lodd_winners")
        .select("premie_id, winner_loddnr, winner_phone, created_at")
        .eq("lotteri_id", selectedLotteriId)
        .order("created_at", { ascending: true })
        .limit(200)
    : { data: [], error: null }

  if (winnersError) {
    const sf = schemaFeil((winnersError as { message?: string } | null)?.message)
    return NextResponse.json(
      { ok: false, feil: sf ?? "Kunne ikke hente vinnere." },
      { status: sf ? 500 : 400 }
    )
  }

  return NextResponse.json({
    ok: true,
    role: gate.role,
    lotterier: lotteriRows,
    activeLotteri: activePublic,
    premier: premieRows,
    activePremier: selectedPremieJoin ?? [],
    premieLinks: premieLinks ?? [],
    selectedLotteriId: selectedLotteriId || null,
    kjop: kjop ?? [],
    winners: winners ?? [],
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
    const saleDaysInput = Number(body.saleDays ?? NaN)
    if (!Number.isFinite(ticketPrice) || ticketPrice <= 0) {
      return NextResponse.json({ ok: false, feil: "Ugyldig pris per lodd." }, { status: 400 })
    }
    if (Number.isFinite(saleDaysInput) && saleDaysInput <= 0) {
      return NextResponse.json({ ok: false, feil: "Ugyldig salg (dager)." }, { status: 400 })
    }
    const saleMinutesRaw = Number.isFinite(saleDaysInput) ? Math.round(saleDaysInput * 24 * 60) : 10080
    const saleMinutes = Number.isFinite(saleMinutesRaw) && saleMinutesRaw > 0 ? saleMinutesRaw : 10080

    const { data, error } = await gate.admin
      .from("lodd_lotteri")
      .insert({
        tittel,
        beskrivelse: beskrivelse || null,
        ticket_price: ticketPrice,
        sale_duration_minutes: saleMinutes,
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

  if (action === "updateLotteri") {
    const lotteriId = String(body.lotteriId ?? "").trim()
    const tittel = String(body.tittel ?? "").trim()
    const beskrivelse = String(body.beskrivelse ?? "").trim()
    const ticketPrice = Number(body.ticketPrice ?? NaN)
    const saleDaysInput = Number(body.saleDays ?? NaN)
    const endAtInput = String(body.endAt ?? "").trim()

    if (!lotteriId) {
      return NextResponse.json({ ok: false, feil: "Mangler lotteri." }, { status: 400 })
    }
    if (!tittel) {
      return NextResponse.json({ ok: false, feil: "Tittel kan ikke være tom." }, { status: 400 })
    }
    if (Number.isFinite(ticketPrice) && ticketPrice <= 0) {
      return NextResponse.json({ ok: false, feil: "Ugyldig pris per lodd." }, { status: 400 })
    }
    if (Number.isFinite(saleDaysInput) && saleDaysInput <= 0) {
      return NextResponse.json({ ok: false, feil: "Ugyldig salg (dager)." }, { status: 400 })
    }

    const patch: Record<string, unknown> = {
      tittel,
      beskrivelse: beskrivelse || null,
    }
    if (Number.isFinite(ticketPrice)) patch.ticket_price = ticketPrice
    if (Number.isFinite(saleDaysInput)) {
      const minutes = Math.round(saleDaysInput * 24 * 60)
      if (Number.isFinite(minutes) && minutes > 0) patch.sale_duration_minutes = minutes
    }

    if (endAtInput) {
      const d = new Date(endAtInput)
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ ok: false, feil: "Ugyldig sluttdato." }, { status: 400 })
      }

      const { data: lotteriRow, error: lotteriError } = await gate.admin
        .from("lodd_lotteri")
        .select("start_at, status")
        .eq("id", lotteriId)
        .maybeSingle()

      if (lotteriError) {
        const sf = schemaFeil((lotteriError as { message?: string } | null)?.message)
        return NextResponse.json(
          { ok: false, feil: sf ?? "Kunne ikke hente lotteri." },
          { status: sf ? 500 : 400 }
        )
      }

      const startAtIso = String((lotteriRow as Record<string, unknown> | null)?.start_at ?? "").trim()
      if (startAtIso) {
        const start = new Date(startAtIso)
        if (!Number.isNaN(start.getTime())) {
          const ms = d.getTime() - start.getTime()
          const minutes = Math.max(1, Math.round(ms / (60 * 1000)))
          patch.sale_duration_minutes = minutes
        }
      }

      patch.end_at = d.toISOString()
    }

    const { error } = await gate.admin.from("lodd_lotteri").update(patch).eq("id", lotteriId)
    if (error) {
      const sf = schemaFeil((error as { message?: string } | null)?.message)
      return NextResponse.json(
        { ok: false, feil: sf ?? "Kunne ikke oppdatere lotteri." },
        { status: sf ? 500 : 400 }
      )
    }

    return NextResponse.json({ ok: true })
  }

  if (action === "publishPremie") {
    const premieId = String(body.premieId ?? "").trim()
    const lotteriId = String(body.lotteriId ?? "").trim()
    const isHovedpremie = Boolean(body.isHovedpremie)
    const sortOrder = Number(body.sortOrder ?? 0)
    if (!premieId || !lotteriId) {
      return NextResponse.json({ ok: false, feil: "Mangler premie/lotteri." }, { status: 400 })
    }

    const { data: lotteriRow } = await gate.admin
      .from("lodd_lotteri")
      .select("id, tittel, status")
      .eq("id", lotteriId)
      .maybeSingle()

    const lotteriStatus = String((lotteriRow as Record<string, unknown> | null)?.status ?? "").trim()
    if (!lotteriRow?.id || !lotteriStatus) {
      return NextResponse.json({ ok: false, feil: "Ukjent lotteri." }, { status: 404 })
    }
    if (lotteriStatus === "ended") {
      return NextResponse.json({ ok: false, feil: "Lotteriet er arkivert." }, { status: 400 })
    }

    const { data: existingLinks, error: existingLinksError } = await gate.admin
      .from("lodd_lotteri_premier")
      .select("lotteri_id")
      .eq("premie_id", premieId)
      .limit(20)

    if (existingLinksError) {
      const sf = schemaFeil((existingLinksError as { message?: string } | null)?.message)
      return NextResponse.json(
        { ok: false, feil: sf ?? "Kunne ikke sjekke premie." },
        { status: sf ? 500 : 400 }
      )
    }

    const otherLotteriIds = (existingLinks ?? [])
      .map((r) => String((r as Record<string, unknown>).lotteri_id ?? "").trim())
      .filter((id) => id && id !== lotteriId)

    if (otherLotteriIds.length) {
      const { data: otherRows } = await gate.admin
        .from("lodd_lotteri")
        .select("id, tittel, status")
        .in("id", otherLotteriIds)
        .limit(20)

      const blocking = (otherRows ?? []).find((r) => String((r as Record<string, unknown>).status ?? "") !== "ended")
      if (blocking) {
        const title = String((blocking as Record<string, unknown>).tittel ?? "annet lotteri").trim()
        const st = String((blocking as Record<string, unknown>).status ?? "").trim()
        return NextResponse.json(
          { ok: false, feil: `Premien er allerede reservert til ${title}${st ? ` · ${st}` : ""}.` },
          { status: 400 }
        )
      }
    }

    const { data: premieRow } = await gate.admin.from("lodd_premier").select("id, status").eq("id", premieId).maybeSingle()
    const premieStatus = String((premieRow as Record<string, unknown> | null)?.status ?? "").trim()
    if (!premieRow?.id) {
      return NextResponse.json({ ok: false, feil: "Ukjent premie." }, { status: 404 })
    }
    if (premieStatus === "arkivert" || premieStatus === "utlevert") {
      return NextResponse.json({ ok: false, feil: "Premien ligger i arkivet og kan ikke brukes på nytt." }, { status: 400 })
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
    const durationDaysInput = Number(body.durationDays ?? NaN)
    if (!lotteriId) {
      return NextResponse.json({ ok: false, feil: "Mangler lotteri." }, { status: 400 })
    }

    const { data: lotteriRow } = await gate.admin
      .from("lodd_lotteri")
      .select("id, status, sale_duration_minutes")
      .eq("id", lotteriId)
      .maybeSingle()

    const currentStatus = String((lotteriRow as Record<string, unknown> | null)?.status ?? "").trim()
    if (!lotteriRow?.id) {
      return NextResponse.json({ ok: false, feil: "Ukjent lotteri." }, { status: 404 })
    }
    if (currentStatus === "ended") {
      return NextResponse.json({ ok: false, feil: "Lotteriet er arkivert og kan ikke startes på nytt." }, { status: 400 })
    }

    const { data: countRows } = await gate.admin
      .from("lodd_lotteri_premier")
      .select("premie_id")
      .eq("lotteri_id", lotteriId)

    const premieCount = Array.isArray(countRows) ? countRows.length : 0
    if (premieCount < 1) {
      return NextResponse.json({ ok: false, feil: "Lotteri må ha minst 1 premie." }, { status: 400 })
    }

    const { data: existingPublic } = await gate.admin
      .from("lodd_lotteri")
      .select("id")
      .eq("status", "active")
      .neq("id", lotteriId)
      .limit(1)

    if (existingPublic?.length) {
      return NextResponse.json(
        { ok: false, feil: "Det finnes allerede et offentlig aktivt lotteri. Avslutt det først." },
        { status: 400 }
      )
    }

    const savedMinutes = Math.floor(
      Number((lotteriRow as Record<string, unknown> | null)?.sale_duration_minutes ?? 10080)
    )
    const minutesInput = Number.isFinite(durationDaysInput) ? Math.round(durationDaysInput * 24 * 60) : NaN
    const minutes =
      Number.isFinite(minutesInput) && minutesInput > 0
        ? minutesInput
        : Number.isFinite(savedMinutes) && savedMinutes > 0
          ? savedMinutes
          : 10080

    const now = new Date()
    const end = new Date(now.getTime() + minutes * 60 * 1000)

    const { error } = await gate.admin
      .from("lodd_lotteri")
      .update({
        status: "active",
        sale_duration_minutes: minutes,
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

    const { data: linkRows } = await gate.admin
      .from("lodd_lotteri_premier")
      .select("premie_id")
      .eq("lotteri_id", lotteriId)

    const premieIds = (linkRows ?? [])
      .map((r) => String((r as Record<string, unknown>).premie_id ?? "").trim())
      .filter(Boolean)

    if (premieIds.length) {
      await gate.admin
        .from("lodd_premier")
        .update({ status: "arkivert" })
        .in("id", premieIds)
        .neq("status", "utlevert")
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

  if (action === "createKjop") {
    const lotteriId = String(body.lotteriId ?? "").trim()
    const antall = Math.floor(Number(body.antall ?? 0))
    const metode = String(body.metode ?? "vipps").trim().toLowerCase()
    const vippsRefInput = String(body.vippsRef ?? "").trim()
    const paid = Boolean(body.paid)

    if (!lotteriId) {
      return NextResponse.json({ ok: false, feil: "Mangler lotteri." }, { status: 400 })
    }
    if (!Number.isFinite(antall) || antall < 1 || antall > 200) {
      return NextResponse.json({ ok: false, feil: "Antall må være mellom 1 og 200." }, { status: 400 })
    }

    const telefon = normalizePhone(body.phone)
    if (telefon === "__invalid__") {
      return NextResponse.json({ ok: false, feil: "Ugyldig telefonnummer." }, { status: 400 })
    }
    if (!telefon) {
      return NextResponse.json({ ok: false, feil: "Mangler telefonnummer." }, { status: 400 })
    }

    const { data: lotteriRow, error: lotteriError } = await gate.admin
      .from("lodd_lotteri")
      .select("id, status, ticket_price")
      .eq("id", lotteriId)
      .maybeSingle()

    if (lotteriError) {
      const sf = schemaFeil((lotteriError as { message?: string } | null)?.message)
      return NextResponse.json(
        { ok: false, feil: sf ?? "Kunne ikke hente lotteri." },
        { status: sf ? 500 : 400 }
      )
    }

    const lotteriStatus = String((lotteriRow as Record<string, unknown> | null)?.status ?? "").trim()
    if (!lotteriRow?.id || !lotteriStatus) {
      return NextResponse.json({ ok: false, feil: "Ukjent lotteri." }, { status: 404 })
    }
    if (lotteriStatus === "ended") {
      return NextResponse.json({ ok: false, feil: "Lotteriet er avsluttet." }, { status: 400 })
    }

    const pris = Number((lotteriRow as Record<string, unknown>).ticket_price ?? 20)
    const ticketPrice = Number.isFinite(pris) && pris > 0 ? pris : 20
    const belop = antall * ticketPrice

    const { data: maxRows, error: maxError } = await gate.admin
      .from("lodd_kjop")
      .select("ticket_to")
      .eq("lotteri_id", lotteriId)
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

    const vippsRef =
      metode === "vipps"
        ? vippsRefInput || `lodd-${ticketFrom}-${ticketTo}-${crypto.randomUUID().slice(0, 8)}`
        : null

    const note = metode === "kontant" ? "Kontant" : metode === "vipps" ? "Vipps" : metode || null

    const { error: insertError } = await gate.admin.from("lodd_kjop").insert({
      lotteri_id: lotteriId,
      phone: telefon,
      antall,
      belop,
      status: paid ? "paid" : "pending",
      ticket_from: ticketFrom,
      ticket_to: ticketTo,
      vipps_ref: vippsRef,
      paid_at: paid ? new Date().toISOString() : null,
      paid_by_epost: paid ? gate.email : null,
      note,
    })

    if (insertError) {
      const sf = schemaFeil((insertError as { message?: string } | null)?.message)
      return NextResponse.json(
        { ok: false, feil: sf ?? "Kunne ikke opprette kjøp." },
        { status: sf ? 500 : 400 }
      )
    }

    return NextResponse.json({ ok: true })
  }

  if (action === "updatePremie") {
    const premieId = String(body.premieId ?? "").trim()
    if (!premieId) {
      return NextResponse.json({ ok: false, feil: "Mangler premie." }, { status: 400 })
    }

    const patch: Record<string, unknown> = {}

    if ("tittel" in body) {
      const tittel = String(body.tittel ?? "").trim()
      if (!tittel) {
        return NextResponse.json({ ok: false, feil: "Tittel kan ikke være tom." }, { status: 400 })
      }
      patch.tittel = tittel
    }

    if ("sponsor_navn" in body) patch.sponsor_navn = String(body.sponsor_navn ?? "").trim() || null
    if ("sponsor_orgnr" in body) patch.sponsor_orgnr = String(body.sponsor_orgnr ?? "").trim() || null

    if ("sponsor_nettsted" in body) {
      let url = String(body.sponsor_nettsted ?? "").trim()
      if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`
      patch.sponsor_nettsted = url || null
    }

    if ("verdi" in body) {
      const raw = String(body.verdi ?? "").trim()
      const parsed = raw ? Number(raw.replace(",", ".")) : NaN
      patch.verdi = Number.isFinite(parsed) && parsed >= 0 ? parsed : null
    }

    if ("admin_notat" in body) patch.admin_notat = String(body.admin_notat ?? "").trim() || null

    const { error } = await gate.admin.from("lodd_premier").update(patch).eq("id", premieId)
    if (error) {
      const sf = schemaFeil((error as { message?: string } | null)?.message)
      return NextResponse.json(
        { ok: false, feil: sf ?? "Kunne ikke oppdatere premie." },
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

    const { data: premieJoin, error: premieJoinError } = await gate.admin
      .from("lodd_lotteri_premier")
      .select("premie_id, is_hovedpremie, sort_order")
      .eq("lotteri_id", lotteriId)
      .order("is_hovedpremie", { ascending: false })
      .order("sort_order", { ascending: true })

    if (premieJoinError) {
      const sf = schemaFeil((premieJoinError as { message?: string } | null)?.message)
      return NextResponse.json(
        { ok: false, feil: sf ?? "Kunne ikke hente premier." },
        { status: sf ? 500 : 400 }
      )
    }

    const reservedPremieIds = (premieJoin ?? [])
      .map((r) => String((r as Record<string, unknown>).premie_id ?? "").trim())
      .filter(Boolean)

    if (!reservedPremieIds.length) {
      return NextResponse.json({ ok: false, feil: "Legg til premier i lotteriet før du trekker vinner." }, { status: 400 })
    }

    const { data: alreadyAssigned, error: alreadyAssignedError } = await gate.admin
      .from("lodd_winners")
      .select("id, premie_id")
      .eq("lotteri_id", lotteriId)
      .order("created_at", { ascending: true })
      .limit(500)

    if (alreadyAssignedError) {
      const sf = schemaFeil((alreadyAssignedError as { message?: string } | null)?.message)
      return NextResponse.json(
        { ok: false, feil: sf ?? "Kunne ikke hente vinnere." },
        { status: sf ? 500 : 400 }
      )
    }

    const assignedSet = new Set<string>()
    const missingAssignments: { id: string }[] = []
    for (const r of alreadyAssigned ?? []) {
      const rr = r as Record<string, unknown>
      const id = String(rr.id ?? "").trim()
      const premieId = String(rr.premie_id ?? "").trim()
      if (!id) continue
      if (premieId) assignedSet.add(premieId)
      else missingAssignments.push({ id })
    }

    if (missingAssignments.length) {
      let cursor = 0
      for (const w of missingAssignments) {
        const next = reservedPremieIds.find((pid) => !assignedSet.has(pid) && reservedPremieIds.indexOf(pid) >= cursor) ?? ""
        if (!next) break
        assignedSet.add(next)
        cursor = reservedPremieIds.indexOf(next) + 1
        await gate.admin.from("lodd_winners").update({ premie_id: next } as unknown as never).eq("id", w.id)
      }
    }

    const nextPremieId = reservedPremieIds.find((id) => !assignedSet.has(id)) ?? ""
    if (!nextPremieId) {
      return NextResponse.json({ ok: false, feil: "Alle premier i lotteriet er allerede trukket." }, { status: 400 })
    }

    const { data: kjop, error: kjopError } = await gate.admin
      .from("lodd_kjop")
      .select("id, created_at, phone, antall, ticket_from, ticket_to")
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
    const total = rows.reduce((sum, r) => sum + Number((r as Record<string, unknown>).antall ?? 0), 0)
    if (!Number.isFinite(total) || total <= 0) {
      return NextResponse.json({ ok: false, feil: "Ingen betalte lodd å trekke blant." }, { status: 400 })
    }

    let cursor = 1
    const normalized = rows
      .map((r) => {
        const rr = r as Record<string, unknown>
        const id = String(rr.id ?? "").trim()
        const phone = String(rr.phone ?? "").trim()
        const antall = Math.floor(Number(rr.antall ?? 0))
        const ticketFromRaw = Number(rr.ticket_from ?? NaN)
        const ticketToRaw = Number(rr.ticket_to ?? NaN)

        if (!id || !phone || !Number.isFinite(antall) || antall <= 0) return null

        const hasRange =
          Number.isFinite(ticketFromRaw) &&
          ticketFromRaw > 0 &&
          Number.isFinite(ticketToRaw) &&
          ticketToRaw >= ticketFromRaw

        if (hasRange) {
          cursor = Math.max(cursor, Math.floor(ticketToRaw) + 1)
          return {
            id,
            phone,
            antall,
            ticketFrom: Math.floor(ticketFromRaw),
            ticketTo: Math.floor(ticketToRaw),
            needsUpdate: false,
          }
        }

        const ticketFrom = cursor
        const ticketTo = cursor + antall - 1
        cursor = ticketTo + 1
        return {
          id,
          phone,
          antall,
          ticketFrom,
          ticketTo,
          needsUpdate: true,
        }
      })
      .filter(Boolean) as {
      id: string
      phone: string
      antall: number
      ticketFrom: number
      ticketTo: number
      needsUpdate: boolean
    }[]

    for (const r of normalized) {
      if (!r.needsUpdate) continue
      await gate.admin
        .from("lodd_kjop")
        .update({ ticket_from: r.ticketFrom, ticket_to: r.ticketTo } as unknown as never)
        .eq("id", r.id)
    }

    let idx = Math.floor(Math.random() * total)
    if (idx < 0) idx = 0
    if (idx >= total) idx = total - 1

    let winnerPhone = ""
    let winnerNumber = 0
    for (const r of normalized) {
      const a = r.antall
      if (idx < a) {
        winnerPhone = r.phone
        winnerNumber = r.ticketFrom + idx
        break
      }
      idx -= a
    }

    if (!winnerPhone || !winnerNumber) {
      return NextResponse.json({ ok: false, feil: "Kunne ikke trekke vinner." }, { status: 400 })
    }

    const { error: winnerInsertError } = await gate.admin.from("lodd_winners").insert({
      lotteri_id: lotteriId,
      premie_id: nextPremieId,
      winner_loddnr: winnerNumber,
      winner_phone: winnerPhone,
      drawn_by_epost: gate.email,
    })

    if (winnerInsertError) {
      const sf = schemaFeil((winnerInsertError as { message?: string } | null)?.message)
      return NextResponse.json(
        { ok: false, feil: sf ?? "Kunne ikke lagre vinner." },
        { status: sf ? 500 : 400 }
      )
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

  if (action === "togglePremieUtlevert") {
    const premieId = String(body.premieId ?? "").trim()
    const lotteriId = String(body.lotteriId ?? "").trim()
    if (!premieId || !lotteriId) {
      return NextResponse.json({ ok: false, feil: "Mangler premie/lotteri." }, { status: 400 })
    }

    const { data: lotteriRow } = await gate.admin
      .from("lodd_lotteri")
      .select("status")
      .eq("id", lotteriId)
      .maybeSingle()

    const lotteriStatus = String((lotteriRow as Record<string, unknown> | null)?.status ?? "").trim()
    if (lotteriStatus !== "ended") {
      return NextResponse.json({ ok: false, feil: "Premie kan kun krysses ut når lotteriet er arkivert." }, { status: 400 })
    }

    const { data: joinRow } = await gate.admin
      .from("lodd_lotteri_premier")
      .select("premie_id")
      .eq("lotteri_id", lotteriId)
      .eq("premie_id", premieId)
      .maybeSingle()

    if (!joinRow) {
      return NextResponse.json({ ok: false, feil: "Premien tilhører ikke dette lotteriet." }, { status: 400 })
    }

    const { data: premieRow } = await gate.admin
      .from("lodd_premier")
      .select("status")
      .eq("id", premieId)
      .maybeSingle()

    const current = String((premieRow as Record<string, unknown> | null)?.status ?? "").trim()
    const next = current === "utlevert" ? "arkivert" : "utlevert"

    const { error } = await gate.admin.from("lodd_premier").update({ status: next }).eq("id", premieId)
    if (error) {
      const sf = schemaFeil((error as { message?: string } | null)?.message)
      return NextResponse.json(
        { ok: false, feil: sf ?? "Kunne ikke oppdatere premie." },
        { status: sf ? 500 : 400 }
      )
    }

    return NextResponse.json({ ok: true })
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

  if (type === "lotteri") {
    const { data, error: readError } = await gate.admin
      .from("lodd_lotteri")
      .select("status")
      .eq("id", id)
      .maybeSingle()

    if (readError) {
      const sf = schemaFeil((readError as { message?: string } | null)?.message)
      return NextResponse.json(
        { ok: false, feil: sf ?? "Kunne ikke hente lotteri." },
        { status: sf ? 500 : 400 }
      )
    }

    const status = String((data as Record<string, unknown> | null)?.status ?? "").trim()
    if (status === "active") {
      return NextResponse.json({ ok: false, feil: "Avslutt lotteriet før du sletter." }, { status: 400 })
    }

    const { error } = await gate.admin.from("lodd_lotteri").delete().eq("id", id)
    if (error) {
      const sf = schemaFeil((error as { message?: string } | null)?.message)
      return NextResponse.json(
        { ok: false, feil: sf ?? "Kunne ikke slette lotteri." },
        { status: sf ? 500 : 400 }
      )
    }
    return NextResponse.json({ ok: true })
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
