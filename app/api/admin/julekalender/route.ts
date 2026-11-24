import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { hasPermission, normalizeRole } from "@/lib/roller"

export const dynamic = "force-dynamic"

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

const SCHEMA_SQL =
  "Julekalender-tabellene mangler. Kjør denne SQL-en i Supabase (SQL Editor), og prøv igjen:\n\n" +
  "create table if not exists public.julekalender (\n" +
  "  id uuid primary key default gen_random_uuid(),\n" +
  "  created_at timestamptz not null default now(),\n" +
  "  aar int not null,\n" +
  "  tittel text not null default 'Julekalender',\n" +
  "  beskrivelse text,\n" +
  "  pris numeric not null default 50,\n" +
  "  status text not null default 'draft',\n" +
  "  start_at timestamptz,\n" +
  "  end_at timestamptz,\n" +
  "  created_by_epost text\n" +
  ");\n" +
  "create table if not exists public.julekalender_luker (\n" +
  "  id uuid primary key default gen_random_uuid(),\n" +
  "  kalender_id uuid not null references public.julekalender(id) on delete cascade,\n" +
  "  dag int not null,\n" +
  "  premie_id uuid references public.lodd_premier(id) on delete set null,\n" +
  "  premie_tekst text,\n" +
  "  apnet_at timestamptz,\n" +
  "  apnet_av text,\n" +
  "  vinner_loddnr integer,\n" +
  "  vinner_telefon text,\n" +
  "  unique (kalender_id, dag)\n" +
  ");\n" +
  "create table if not exists public.julekalender_kjop (\n" +
  "  id uuid primary key default gen_random_uuid(),\n" +
  "  created_at timestamptz not null default now(),\n" +
  "  kalender_id uuid not null references public.julekalender(id) on delete cascade,\n" +
  "  telefon text not null,\n" +
  "  antall integer not null,\n" +
  "  belop numeric not null,\n" +
  "  status text not null default 'pending',\n" +
  "  vipps_ref text,\n" +
  "  paid_at timestamptz,\n" +
  "  lodd_fra integer,\n" +
  "  lodd_til integer\n" +
  ");\n" +
  "create index if not exists julekalender_status_idx on public.julekalender (status);\n" +
  "create index if not exists julekalender_kjop_kalender_idx on public.julekalender_kjop (kalender_id, created_at desc);\n"

function isSchemaError(msg: string) {
  return /relation|table|does not exist/i.test(msg) && /julekalender/i.test(msg)
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

  const { data: roleRow } = await admin
    .from("medlemmer")
    .select("role, aktiv")
    .eq("user_id", userId)
    .maybeSingle()

  const aktiv = (roleRow as { aktiv?: unknown } | null)?.aktiv
  if (aktiv === false) {
    return { ok: false as const, status: 403 as const, feil: "Ingen tilgang." }
  }

  const ownerEmail = String(
    process.env.ADMIN_SUPERADMIN_EMAIL ?? process.env.ADMIN_BOOTSTRAP_EMAIL ?? "",
  )
    .trim()
    .toLowerCase()
  const role =
    ownerEmail && email === ownerEmail
      ? "superadmin"
      : normalizeRole(String((roleRow as { role?: unknown } | null)?.role ?? ""))

  if (!hasPermission(role, "manage_lottery")) {
    return { ok: false as const, status: 403 as const, feil: "Ingen tilgang." }
  }

  return { ok: true as const, admin, email, role }
}

export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ ok: false, feil: gate.feil }, { status: gate.status })

  const { admin } = gate

  const { data: kalendere, error: kalErr } = await admin
    .from("julekalender")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10)

  if (kalErr) {
    if (isSchemaError(String(kalErr.message ?? ""))) {
      return NextResponse.json({ ok: false, feil: SCHEMA_SQL }, { status: 500 })
    }
    return NextResponse.json({ ok: false, feil: "Kunne ikke hente julekalendere." }, { status: 400 })
  }

  const kalenderRows = (kalendere ?? []) as Record<string, unknown>[]
  const active =
    kalenderRows.find((k) => String(k.status ?? "") === "active") ??
    kalenderRows.find((k) => String(k.status ?? "") === "draft") ??
    null

  const selectedId = String(active?.id ?? "")
  let luker: Record<string, unknown>[] = []
  let kjop: Record<string, unknown>[] = []

  if (selectedId) {
    const { data: lukerRows, error: lukErr } = await admin
      .from("julekalender_luker")
      .select("*")
      .eq("kalender_id", selectedId)
      .order("dag", { ascending: true })

    if (lukErr && !isSchemaError(String(lukErr.message ?? ""))) {
      return NextResponse.json({ ok: false, feil: "Kunne ikke hente luker." }, { status: 400 })
    }
    luker = (lukerRows ?? []) as Record<string, unknown>[]

    const { data: kjopRows, error: kjopErr } = await admin
      .from("julekalender_kjop")
      .select("*")
      .eq("kalender_id", selectedId)
      .order("created_at", { ascending: false })
      .limit(200)

    if (kjopErr && !isSchemaError(String(kjopErr.message ?? ""))) {
      return NextResponse.json({ ok: false, feil: "Kunne ikke hente kjøp." }, { status: 400 })
    }
    kjop = (kjopRows ?? []) as Record<string, unknown>[]
  }

  const { data: premier, error: premErr } = await admin
    .from("lodd_premier")
    .select("id, tittel, sponsor_navn, verdi, image_path, status")
    .in("status", ["arkiv", "publisert"])
    .order("created_at", { ascending: false })
    .limit(200)

  if (premErr) {
    return NextResponse.json({ ok: false, feil: "Kunne ikke hente premier." }, { status: 400 })
  }

  const premieList = ((premier ?? []) as Record<string, unknown>[]).map((p) => ({
    id: String(p.id ?? ""),
    tittel: String(p.tittel ?? ""),
    sponsor_navn: p.sponsor_navn ? String(p.sponsor_navn) : null,
    verdi: p.verdi ? Number(p.verdi) : null,
    status: String(p.status ?? ""),
  }))

  return NextResponse.json({
    ok: true,
    kalendere: kalenderRows,
    selectedKalenderId: selectedId || null,
    luker,
    kjop,
    premier: premieList,
  })
}

export async function POST(request: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ ok: false, feil: gate.feil }, { status: gate.status })
  const { admin, email } = gate

  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, feil: "Ugyldig JSON." }, { status: 400 })
  }

  const action = String(body.action ?? "").trim()

  if (action === "createKalender") {
    const aar = Number(body.aar ?? new Date().getFullYear())
    const tittel = String(body.tittel ?? "Julekalender").trim() || "Julekalender"
    const beskrivelse = String(body.beskrivelse ?? "").trim()
    const pris = Number(body.pris ?? 50)
    if (!Number.isFinite(pris) || pris <= 0) {
      return NextResponse.json({ ok: false, feil: "Ugyldig pris." }, { status: 400 })
    }

    const { data, error } = await admin
      .from("julekalender")
      .insert({
        aar,
        tittel,
        beskrivelse: beskrivelse || null,
        pris,
        status: "draft",
        created_by_epost: email,
      } as unknown as never)
      .select("id")
      .maybeSingle()

    if (error) {
      if (isSchemaError(String(error.message ?? ""))) {
        return NextResponse.json({ ok: false, feil: SCHEMA_SQL }, { status: 500 })
      }
      return NextResponse.json({ ok: false, feil: "Kunne ikke opprette julekalender." }, { status: 400 })
    }

    const kalenderId = String((data as { id?: string } | null)?.id ?? "")
    const lukerInsert = Array.from({ length: 24 }, (_, i) => ({
      kalender_id: kalenderId,
      dag: i + 1,
    }))

    if (kalenderId) {
      await admin.from("julekalender_luker").insert(lukerInsert as unknown as never)
    }

    return NextResponse.json({ ok: true, id: kalenderId })
  }

  if (action === "updateKalender") {
    const kalenderId = String(body.kalenderId ?? "").trim()
    if (!kalenderId) return NextResponse.json({ ok: false, feil: "Mangler kalender." }, { status: 400 })

    const patch: Record<string, unknown> = {}
    if ("tittel" in body) patch.tittel = String(body.tittel ?? "").trim() || "Julekalender"
    if ("beskrivelse" in body) patch.beskrivelse = String(body.beskrivelse ?? "").trim() || null
    if ("pris" in body) {
      const pris = Number(body.pris ?? NaN)
      if (Number.isFinite(pris) && pris > 0) patch.pris = pris
    }

    const { error } = await admin.from("julekalender").update(patch as unknown as never).eq("id", kalenderId)
    if (error) {
      return NextResponse.json({ ok: false, feil: "Kunne ikke oppdatere kalender." }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  }

  if (action === "activateKalender") {
    const kalenderId = String(body.kalenderId ?? "").trim()
    if (!kalenderId) return NextResponse.json({ ok: false, feil: "Mangler kalender." }, { status: 400 })

    const { data: row } = await admin
      .from("julekalender")
      .select("id, status")
      .eq("id", kalenderId)
      .maybeSingle()
    const status = String((row as { status?: string } | null)?.status ?? "")
    if (!row) return NextResponse.json({ ok: false, feil: "Ukjent kalender." }, { status: 404 })
    if (status === "ended") {
      return NextResponse.json({ ok: false, feil: "Kalenderen er avsluttet." }, { status: 400 })
    }

    const { data: existing } = await admin
      .from("julekalender")
      .select("id")
      .eq("status", "active")
      .neq("id", kalenderId)
      .limit(1)
    if (existing?.length) {
      return NextResponse.json({ ok: false, feil: "Det finnes allerede en aktiv julekalender." }, { status: 400 })
    }

    const now = new Date()
    const { error } = await admin
      .from("julekalender")
      .update({ status: "active", start_at: now.toISOString() } as unknown as never)
      .eq("id", kalenderId)
    if (error) return NextResponse.json({ ok: false, feil: "Kunne ikke aktivere." }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  if (action === "endKalender") {
    const kalenderId = String(body.kalenderId ?? "").trim()
    if (!kalenderId) return NextResponse.json({ ok: false, feil: "Mangler kalender." }, { status: 400 })
    const { error } = await admin.from("julekalender").update({ status: "ended" } as unknown as never).eq("id", kalenderId)
    if (error) return NextResponse.json({ ok: false, feil: "Kunne ikke avslutte." }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  if (action === "setPremie") {
    const kalenderId = String(body.kalenderId ?? "").trim()
    const dag = Number(body.dag ?? 0)
    const premieId = String(body.premieId ?? "").trim()
    const premieTekst = String(body.premieTekst ?? "").trim()
    if (!kalenderId || !dag || dag < 1 || dag > 24) {
      return NextResponse.json({ ok: false, feil: "Ugyldig kalender/dag." }, { status: 400 })
    }

    const patch: Record<string, unknown> = {}
    if (premieId) patch.premie_id = premieId
    if (premieTekst) patch.premie_tekst = premieTekst
    if (!premieId && !premieTekst) {
      patch.premie_id = null
      patch.premie_tekst = null
    }

    const { error } = await admin
      .from("julekalender_luker")
      .update(patch as unknown as never)
      .eq("kalender_id", kalenderId)
      .eq("dag", dag)
    if (error) return NextResponse.json({ ok: false, feil: "Kunne ikke sette premie." }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  if (action === "apneLuk") {
    const kalenderId = String(body.kalenderId ?? "").trim()
    const dag = Number(body.dag ?? 0)
    if (!kalenderId || !dag || dag < 1 || dag > 24) {
      return NextResponse.json({ ok: false, feil: "Ugyldig kalender/dag." }, { status: 400 })
    }

    const { data: luk, error: lukErr } = await admin
      .from("julekalender_luker")
      .select("id, apnet_at, vinner_loddnr")
      .eq("kalender_id", kalenderId)
      .eq("dag", dag)
      .maybeSingle()
    if (lukErr) return NextResponse.json({ ok: false, feil: "Kunne ikke hente luke." }, { status: 400 })
    if (!luk) return NextResponse.json({ ok: false, feil: "Luke finnes ikke." }, { status: 404 })

    const apnet = Boolean((luk as { apnet_at?: string | null }).apnet_at)
    let vinnerLoddnr = (luk as { vinner_loddnr?: number | null }).vinner_loddnr ?? null

    if (!vinnerLoddnr) {
      const { data: kjopRows, error: kjopErr } = await admin
        .from("julekalender_kjop")
        .select("lodd_fra, lodd_til")
        .eq("kalender_id", kalenderId)
        .eq("status", "paid")
      if (kjopErr) return NextResponse.json({ ok: false, feil: "Kunne ikke hente kjøp." }, { status: 400 })

      const alleLodd: number[] = []
      for (const r of (kjopRows ?? []) as { lodd_fra: number; lodd_til: number }[]) {
        const fra = Number(r.lodd_fra ?? 0)
        const til = Number(r.lodd_til ?? 0)
        if (fra > 0 && til >= fra) {
          for (let n = fra; n <= til; n++) alleLodd.push(n)
        }
      }
      if (alleLodd.length === 0) {
        return NextResponse.json({ ok: false, feil: "Ingen betalte lodd å trekke fra enda." }, { status: 400 })
      }
      vinnerLoddnr = alleLodd[Math.floor(Math.random() * alleLodd.length)]

      const { data: vinnerRow } = await admin
        .from("julekalender_kjop")
        .select("telefon")
        .eq("kalender_id", kalenderId)
        .eq("status", "paid")
        .lte("lodd_fra", vinnerLoddnr)
        .gte("lodd_til", vinnerLoddnr)
        .limit(1)
        .maybeSingle()
      const vinnerTelefon = String((vinnerRow as { telefon?: string } | null)?.telefon ?? "")

      await admin
        .from("julekalender_luker")
        .update({ vinner_loddnr: vinnerLoddnr, vinner_telefon: vinnerTelefon || null } as unknown as never)
        .eq("kalender_id", kalenderId)
        .eq("dag", dag)
    }

    if (!apnet) {
      const { error } = await admin
        .from("julekalender_luker")
        .update({ apnet_at: new Date().toISOString(), apnet_av: email } as unknown as never)
        .eq("kalender_id", kalenderId)
        .eq("dag", dag)
      if (error) return NextResponse.json({ ok: false, feil: "Kunne ikke åpne luke." }, { status: 400 })
    }

    return NextResponse.json({ ok: true, vinner_loddnr: vinnerLoddnr })
  }

  if (action === "tilbakestillLuk") {
    const kalenderId = String(body.kalenderId ?? "").trim()
    const dag = Number(body.dag ?? 0)
    if (!kalenderId || !dag || dag < 1 || dag > 24) {
      return NextResponse.json({ ok: false, feil: "Ugyldig kalender/dag." }, { status: 400 })
    }
    const { error } = await admin
      .from("julekalender_luker")
      .update({ apnet_at: null, apnet_av: null, vinner_loddnr: null, vinner_telefon: null } as unknown as never)
      .eq("kalender_id", kalenderId)
      .eq("dag", dag)
    if (error) return NextResponse.json({ ok: false, feil: "Kunne ikke tilbakestille." }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, feil: "Ukjent handling." }, { status: 400 })
}
