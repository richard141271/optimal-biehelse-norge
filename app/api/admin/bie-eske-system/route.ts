import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

const bucket = "bie-eske-system"

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
    Views: Record<
      string,
      {
        Row: Record<string, unknown>
        Relationships: unknown[]
      }
    >
    Functions: Record<
      string,
      {
        Args: Record<string, unknown>
        Returns: unknown
      }
    >
    Enums: Record<string, string>
    CompositeTypes: Record<string, Record<string, unknown>>
  }
}

type AdminClient = SupabaseClient<Db>

const schemaFeil =
  "Bie-Eske System mangler tabeller i Supabase. Kjør denne SQL-en i Supabase (SQL Editor), og prøv igjen:\n\n" +
  "create extension if not exists \"pgcrypto\";\n" +
  "create table if not exists public.lek_v2_lager (\n" +
  "  id uuid primary key default gen_random_uuid(),\n" +
  "  created_at timestamptz not null default now(),\n" +
  "  updated_at timestamptz not null default now(),\n" +
  "  kind text not null,\n" +
  "  name text not null,\n" +
  "  dedupe_key text not null,\n" +
  "  active boolean not null default true,\n" +
  "  person_name text,\n" +
  "  location_type text,\n" +
  "  address text,\n" +
  "  lat numeric,\n" +
  "  lng numeric,\n" +
  "  responsible_lager_id uuid references public.lek_v2_lager(id) on delete set null\n" +
  ");\n" +
  "create unique index if not exists lek_v2_lager_dedupe_key_uq on public.lek_v2_lager (dedupe_key);\n" +
  "create index if not exists lek_v2_lager_updated_at_idx on public.lek_v2_lager (updated_at desc);\n" +
  "create table if not exists public.lek_v2_lager_saldo (\n" +
  "  lager_id uuid not null references public.lek_v2_lager(id) on delete cascade,\n" +
  "  item text not null,\n" +
  "  qty integer not null default 0,\n" +
  "  updated_at timestamptz not null default now(),\n" +
  "  primary key (lager_id, item)\n" +
  ");\n" +
  "create table if not exists public.lek_v2_lager_bevegelser (\n" +
  "  id uuid primary key default gen_random_uuid(),\n" +
  "  created_at timestamptz not null default now(),\n" +
  "  from_lager_id uuid references public.lek_v2_lager(id) on delete set null,\n" +
  "  to_lager_id uuid references public.lek_v2_lager(id) on delete set null,\n" +
  "  item text not null,\n" +
  "  qty integer not null,\n" +
  "  reason text not null,\n" +
  "  note text,\n" +
  "  actor_epost text,\n" +
  "  actor_role text\n" +
  ");\n" +
  "create index if not exists lek_v2_lager_bevegelser_created_at_idx on public.lek_v2_lager_bevegelser (created_at desc);\n" +
  "create table if not exists public.lek_v2_lokasjon_hendelser (\n" +
  "  id uuid primary key default gen_random_uuid(),\n" +
  "  created_at timestamptz not null default now(),\n" +
  "  location_lager_id uuid not null references public.lek_v2_lager(id) on delete cascade,\n" +
  "  type text not null,\n" +
  "  glasses_left integer,\n" +
  "  filled_added integer,\n" +
  "  comment text,\n" +
  "  lat numeric,\n" +
  "  lng numeric,\n" +
  "  image1_path text,\n" +
  "  image2_path text,\n" +
  "  image3_path text,\n" +
  "  actor_epost text,\n" +
  "  actor_role text\n" +
  ");\n" +
  "create index if not exists lek_v2_lokasjon_hendelser_created_at_idx on public.lek_v2_lokasjon_hendelser (created_at desc);\n" +
  "create index if not exists lek_v2_lokasjon_hendelser_location_created_at_idx on public.lek_v2_lokasjon_hendelser (location_lager_id, created_at desc);\n"

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function isSchemaError(msg: string) {
  const m = msg.toLowerCase()
  if (m.includes("42p01")) return true
  if (m.includes("schema cache") && m.includes("lek_v2_")) return true
  if (m.includes("relation") && m.includes("does not exist")) return true
  if (m.includes("could not find the table")) return true
  if (m.includes("not found")) return true
  if (m.includes("does not exist")) return true
  if (m.includes("column") && m.includes("lek_v2_")) return true
  return false
}

function toInt(v: unknown) {
  const n = Number(String(v ?? "").trim())
  if (!Number.isFinite(n)) return null
  return Math.trunc(n)
}

function toNumber(v: unknown) {
  const s = String(v ?? "").trim()
  if (!s) return null
  const n = Number(s.replace(",", "."))
  return Number.isFinite(n) ? n : null
}

function normalizeText(v: string) {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

function roundCoord(v: number) {
  return Math.round(v * 10_000) / 10_000
}

function makeDedupeKey(kind: string, name: string, lat: number | null, lng: number | null) {
  const k = normalizeText(kind)
  const n = normalizeText(name)
  if (!k || !n) return ""
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    return `${k}|${n}|${roundCoord(lat)},${roundCoord(lng)}`
  }
  return `${k}|${n}`
}

function toSafeStorageKey(v: string) {
  const s = String(v ?? "").trim()
  if (!s) return "x"
  const cleaned = s
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
  return cleaned || "x"
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

async function requireAccess() {
  const auth = await getAuth()
  if (!auth.ok) return auth

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) return { ok: false as const, status: 500 as const, feil: "Mangler SUPABASE_SERVICE_ROLE_KEY." }

  const admin = createClient<Db>(auth.supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { data, error } = await admin.from("medlemmer").select("role, aktiv").eq("user_id", auth.userId).maybeSingle()
  if (error) return { ok: false as const, status: 400 as const, feil: "Kunne ikke hente tilgang." }
  if ((data as { aktiv?: unknown } | null)?.aktiv === false) return { ok: false as const, status: 403 as const, feil: "Ingen tilgang." }

  const role = String((data as { role?: unknown } | null)?.role ?? "").trim().toLowerCase()
  if (role !== "admin" && role !== "superadmin" && role !== "frivillig") return { ok: false as const, status: 403 as const, feil: "Ingen tilgang." }

  return { ok: true as const, admin, role: role as "admin" | "superadmin" | "frivillig", email: auth.email }
}

async function ensureBucket(admin: AdminClient) {
  const { error } = await admin.storage.createBucket(bucket, { public: false })
  if (!error) return { ok: true as const }
  const msg = String((error as { message?: string } | null)?.message ?? "")
  if (/(exists|already|duplicate|conflict|409)/i.test(msg)) return { ok: true as const }
  return { ok: false as const }
}

async function getSaldo(admin: AdminClient, lagerIds: string[]) {
  if (!lagerIds.length) return new Map<string, Record<string, number>>()
  const { data, error } = await admin
    .from("lek_v2_lager_saldo")
    .select("lager_id, item, qty")
    .in("lager_id", lagerIds)
  if (error) return new Map<string, Record<string, number>>()
  const m = new Map<string, Record<string, number>>()
  for (const r of (data ?? []) as Array<{ lager_id?: unknown; item?: unknown; qty?: unknown }>) {
    const id = String(r.lager_id ?? "")
    const item = String(r.item ?? "")
    const qty = Number(r.qty ?? 0)
    if (!id || !item || !Number.isFinite(qty)) continue
    const row = m.get(id) ?? {}
    row[item] = Math.trunc(qty)
    m.set(id, row)
  }
  return m
}

async function applyDelta(admin: AdminClient, lagerId: string, item: string, delta: number) {
  const d = Math.trunc(delta)
  if (!lagerId || !item || !Number.isFinite(d) || d === 0) return { ok: true as const }
  const { data: existing, error: selErr } = await admin
    .from("lek_v2_lager_saldo")
    .select("qty")
    .eq("lager_id", lagerId)
    .eq("item", item)
    .maybeSingle()
  if (selErr) return { ok: false as const }
  const curr = Number((existing as { qty?: unknown } | null)?.qty ?? 0)
  const next = Math.trunc((Number.isFinite(curr) ? curr : 0) + d)
  const nowIso = new Date().toISOString()
  const { error: upErr } = await admin
    .from("lek_v2_lager_saldo")
    .upsert({ lager_id: lagerId, item, qty: next, updated_at: nowIso } as unknown as never, { onConflict: "lager_id,item" })
  if (upErr) return { ok: false as const }
  return { ok: true as const, qty: next }
}

export async function GET(request: Request) {
  const gate = await requireAccess()
  if (!gate.ok) return NextResponse.json({ ok: false, feil: gate.feil }, { status: gate.status })
  const admin = gate.admin as AdminClient

  const url = new URL(request.url)
  const action = String(url.searchParams.get("action") ?? "").trim() || "overview"

  if (action === "searchLocations") {
    const q = String(url.searchParams.get("q") ?? "").trim()
    if (q.length < 2) return NextResponse.json({ ok: true, results: [] })
    const { data, error } = await admin
      .from("lek_v2_lager")
      .select("id, kind, name, location_type, address, lat, lng, responsible_lager_id, updated_at, active")
      .eq("kind", "location")
      .or(`name.ilike.%${q}%,address.ilike.%${q}%,location_type.ilike.%${q}%`)
      .order("updated_at", { ascending: false })
      .limit(20)
    if (error) {
      const msg = String((error as { message?: string } | null)?.message ?? "")
      return NextResponse.json({ ok: false, feil: isSchemaError(msg) ? schemaFeil : "Kunne ikke søke lokasjoner." }, { status: isSchemaError(msg) ? 500 : 400 })
    }
    return NextResponse.json({ ok: true, results: data ?? [] })
  }

  if (action === "getLocation") {
    const id = String(url.searchParams.get("id") ?? "").trim()
    if (!id) return NextResponse.json({ ok: false, feil: "Mangler lokasjon." }, { status: 400 })
    const { data: location, error: locErr } = await admin
      .from("lek_v2_lager")
      .select("id, kind, name, location_type, address, lat, lng, responsible_lager_id, updated_at, active")
      .eq("id", id)
      .maybeSingle()
    if (locErr) {
      const msg = String((locErr as { message?: string } | null)?.message ?? "")
      return NextResponse.json({ ok: false, feil: isSchemaError(msg) ? schemaFeil : "Kunne ikke hente lokasjon." }, { status: isSchemaError(msg) ? 500 : 400 })
    }
    const { data: events, error: evErr } = await admin
      .from("lek_v2_lokasjon_hendelser")
      .select("id, created_at, location_lager_id, type, glasses_left, filled_added, comment, lat, lng, image1_path, image2_path, image3_path, actor_epost")
      .eq("location_lager_id", id)
      .order("created_at", { ascending: false })
      .limit(80)
    if (evErr) {
      const msg = String((evErr as { message?: string } | null)?.message ?? "")
      return NextResponse.json({ ok: false, feil: isSchemaError(msg) ? schemaFeil : "Kunne ikke hente historikk." }, { status: isSchemaError(msg) ? 500 : 400 })
    }

    const saldo = await getSaldo(admin, [id])
    const balances = saldo.get(id) ?? {}

    const bucketOk = await ensureBucket(admin)
    if (!bucketOk.ok) return NextResponse.json({ ok: false, feil: "Storage er ikke satt opp." }, { status: 500 })

    const signed: Record<string, string> = {}
    for (const e of (events ?? []) as Array<{ image1_path?: unknown; image2_path?: unknown; image3_path?: unknown }>) {
      for (const p of [e.image1_path, e.image2_path, e.image3_path]) {
        const path = String(p ?? "").trim()
        if (!path || signed[path]) continue
        const { data } = await admin.storage.from(bucket).createSignedUrl(path, 60 * 10)
        const url = String((data as { signedUrl?: unknown } | null)?.signedUrl ?? "")
        if (url) signed[path] = url
      }
    }

    return NextResponse.json({ ok: true, location: location ?? null, balances, events: events ?? [], signed })
  }

  const { data: lagre, error: lagreErr } = await admin
    .from("lek_v2_lager")
    .select("id, kind, name, person_name, location_type, address, lat, lng, responsible_lager_id, updated_at, active")
    .order("updated_at", { ascending: false })
    .limit(600)
  if (lagreErr) {
    const msg = String((lagreErr as { message?: string } | null)?.message ?? "")
    return NextResponse.json({ ok: false, feil: isSchemaError(msg) ? schemaFeil : "Kunne ikke hente oversikt." }, { status: isSchemaError(msg) ? 500 : 400 })
  }

  const ids = (lagre ?? []).map((l: unknown) => String((l as { id?: unknown }).id ?? "")).filter(Boolean)
  const saldo = await getSaldo(admin, ids)

  const enriched = (lagre ?? []).map((l: unknown) => {
    const id = String((l as { id?: unknown }).id ?? "")
    return { ...(l as Record<string, unknown>), balances: saldo.get(id) ?? {} } as Record<string, unknown>
  })

  const locations = (enriched as Array<Record<string, unknown>>).filter((l) => String(l.kind ?? "") === "location")
  const totals = {
    totalLagere: (enriched as Array<unknown>).length,
    totalLokasjoner: locations.length,
  }

  return NextResponse.json({ ok: true, role: gate.role, lagre: enriched, locations, totals })
}

export async function POST(request: Request) {
  const gate = await requireAccess()
  if (!gate.ok) return NextResponse.json({ ok: false, feil: gate.feil }, { status: gate.status })
  const admin = gate.admin as AdminClient

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ ok: false, feil: "Ugyldig forespørsel." }, { status: 400 })
  }

  const action = String(form.get("action") ?? "").trim()
  if (!action) return NextResponse.json({ ok: false, feil: "Mangler action." }, { status: 400 })

  const bucketOk = await ensureBucket(admin)
  if (!bucketOk.ok) return NextResponse.json({ ok: false, feil: "Storage er ikke satt opp." }, { status: 500 })

  const nowIso = new Date().toISOString()

  if (action === "createMain") {
    const name = String(form.get("name") ?? "").trim() || "Hovedlager"
    const dedupe = makeDedupeKey("main", name, null, null)
    const { data: existing, error: exErr } = await admin.from("lek_v2_lager").select("id").eq("dedupe_key", dedupe).maybeSingle()
    if (exErr) {
      const msg = String((exErr as { message?: string } | null)?.message ?? "")
      return NextResponse.json({ ok: false, feil: isSchemaError(msg) ? schemaFeil : "Kunne ikke opprette lager." }, { status: isSchemaError(msg) ? 500 : 400 })
    }
    if (existing) return NextResponse.json({ ok: true, id: String((existing as { id?: unknown }).id ?? ""), reused: true })
    const id = crypto.randomUUID()
    const { error } = await admin
      .from("lek_v2_lager")
      .insert({ id, created_at: nowIso, updated_at: nowIso, kind: "main", name, dedupe_key: dedupe, active: true } as unknown as never)
    if (error) {
      const msg = String((error as { message?: string } | null)?.message ?? "")
      return NextResponse.json({ ok: false, feil: isSchemaError(msg) ? schemaFeil : "Kunne ikke opprette lager." }, { status: isSchemaError(msg) ? 500 : 400 })
    }
    return NextResponse.json({ ok: true, id, reused: false })
  }

  if (action === "createPerson") {
    const person = String(form.get("person") ?? "").trim()
    if (!person) return NextResponse.json({ ok: false, feil: "Mangler navn." }, { status: 400 })
    const dedupe = makeDedupeKey("person", person, null, null)
    const { data: existing, error: exErr } = await admin.from("lek_v2_lager").select("id").eq("dedupe_key", dedupe).maybeSingle()
    if (exErr) {
      const msg = String((exErr as { message?: string } | null)?.message ?? "")
      return NextResponse.json({ ok: false, feil: isSchemaError(msg) ? schemaFeil : "Kunne ikke opprette personlager." }, { status: isSchemaError(msg) ? 500 : 400 })
    }
    if (existing) return NextResponse.json({ ok: true, id: String((existing as { id?: unknown }).id ?? ""), reused: true })
    const id = crypto.randomUUID()
    const { error } = await admin.from("lek_v2_lager").insert({
      id,
      created_at: nowIso,
      updated_at: nowIso,
      kind: "person",
      name: person,
      person_name: person,
      dedupe_key: dedupe,
      active: true,
    } as unknown as never)
    if (error) {
      const msg = String((error as { message?: string } | null)?.message ?? "")
      return NextResponse.json({ ok: false, feil: isSchemaError(msg) ? schemaFeil : "Kunne ikke opprette personlager." }, { status: isSchemaError(msg) ? 500 : 400 })
    }
    return NextResponse.json({ ok: true, id, reused: false })
  }

  if (action === "adjust") {
    const lagerId = String(form.get("lagerId") ?? "").trim()
    const item = String(form.get("item") ?? "").trim()
    const qty = toInt(form.get("qty"))
    const note = String(form.get("note") ?? "").trim()
    if (!lagerId) return NextResponse.json({ ok: false, feil: "Mangler lager." }, { status: 400 })
    if (item !== "bie_eske" && item !== "glass") return NextResponse.json({ ok: false, feil: "Ugyldig vare." }, { status: 400 })
    if (qty == null || qty < 0) return NextResponse.json({ ok: false, feil: "Ugyldig antall." }, { status: 400 })

    const saldo = await getSaldo(admin, [lagerId])
    const curr = Number((saldo.get(lagerId) ?? {})[item] ?? 0)
    const next = Math.trunc(qty)
    const delta = next - (Number.isFinite(curr) ? Math.trunc(curr) : 0)
    if (delta !== 0) {
      const upd = await applyDelta(admin, lagerId, item, delta)
      if (!upd.ok) return NextResponse.json({ ok: false, feil: "Kunne ikke oppdatere lager." }, { status: 400 })
      const { error } = await admin.from("lek_v2_lager_bevegelser").insert({
        id: crypto.randomUUID(),
        created_at: nowIso,
        from_lager_id: delta < 0 ? lagerId : null,
        to_lager_id: delta > 0 ? lagerId : null,
        item,
        qty: Math.abs(delta),
        reason: "adjust",
        note: note || null,
        actor_epost: gate.email,
        actor_role: gate.role,
      } as unknown as never)
      if (error) {
        const msg = String((error as { message?: string } | null)?.message ?? "")
        return NextResponse.json({ ok: false, feil: isSchemaError(msg) ? schemaFeil : "Kunne ikke logge justering." }, { status: isSchemaError(msg) ? 500 : 400 })
      }
    }

    await admin.from("lek_v2_lager").update({ updated_at: nowIso } as unknown as never).eq("id", lagerId)
    return NextResponse.json({ ok: true })
  }

  if (action === "transfer") {
    const fromId = String(form.get("fromId") ?? "").trim()
    const toId = String(form.get("toId") ?? "").trim()
    const item = String(form.get("item") ?? "").trim()
    const qty = toInt(form.get("qty"))
    const note = String(form.get("note") ?? "").trim()
    if (!fromId || !toId) return NextResponse.json({ ok: false, feil: "Mangler lager." }, { status: 400 })
    if (!item) return NextResponse.json({ ok: false, feil: "Mangler vare." }, { status: 400 })
    if (!qty || qty <= 0) return NextResponse.json({ ok: false, feil: "Ugyldig antall." }, { status: 400 })

    const fromSaldo = await getSaldo(admin, [fromId])
    const curr = Number((fromSaldo.get(fromId) ?? {})[item] ?? 0)
    if (!Number.isFinite(curr) || curr < qty) return NextResponse.json({ ok: false, feil: "Ikke nok på lager." }, { status: 400 })

    const dec = await applyDelta(admin, fromId, item, -qty)
    if (!dec.ok) return NextResponse.json({ ok: false, feil: "Kunne ikke oppdatere lager." }, { status: 400 })
    const inc = await applyDelta(admin, toId, item, qty)
    if (!inc.ok) return NextResponse.json({ ok: false, feil: "Kunne ikke oppdatere lager." }, { status: 400 })

    const { error } = await admin.from("lek_v2_lager_bevegelser").insert({
      id: crypto.randomUUID(),
      created_at: nowIso,
      from_lager_id: fromId,
      to_lager_id: toId,
      item,
      qty,
      reason: "transfer",
      note: note || null,
      actor_epost: gate.email,
      actor_role: gate.role,
    } as unknown as never)
    if (error) {
      const msg = String((error as { message?: string } | null)?.message ?? "")
      return NextResponse.json({ ok: false, feil: isSchemaError(msg) ? schemaFeil : "Kunne ikke logge flytting." }, { status: isSchemaError(msg) ? 500 : 400 })
    }

    await admin.from("lek_v2_lager").update({ updated_at: nowIso } as unknown as never).in("id", [fromId, toId])
    return NextResponse.json({ ok: true })
  }

  if (action === "deploy") {
    const fromPersonId = String(form.get("fromPersonId") ?? "").trim()
    const locationName = String(form.get("locationName") ?? "").trim()
    const locationType = String(form.get("locationType") ?? "").trim()
    const address = String(form.get("address") ?? "").trim()
    const lat = toNumber(form.get("lat"))
    const lng = toNumber(form.get("lng"))
    const initialBoxes = toInt(form.get("boxes")) ?? 1
    const initialGlasses = toInt(form.get("glasses")) ?? 15
    const comment = String(form.get("comment") ?? "").trim()
    if (!fromPersonId) return NextResponse.json({ ok: false, feil: "Mangler personlager." }, { status: 400 })
    if (!locationName) return NextResponse.json({ ok: false, feil: "Mangler lokasjon." }, { status: 400 })
    if (!locationType) return NextResponse.json({ ok: false, feil: "Mangler type sted." }, { status: 400 })
    if (initialBoxes <= 0) return NextResponse.json({ ok: false, feil: "Ugyldig antall esker." }, { status: 400 })
    if (initialGlasses < 0) return NextResponse.json({ ok: false, feil: "Ugyldig antall glass." }, { status: 400 })

    const dedupe = makeDedupeKey("location", locationName, lat, lng) || makeDedupeKey("location", locationName, null, null)
    const { data: existing, error: exErr } = await admin
      .from("lek_v2_lager")
      .select("id")
      .eq("dedupe_key", dedupe)
      .maybeSingle()
    if (exErr) {
      const msg = String((exErr as { message?: string } | null)?.message ?? "")
      return NextResponse.json({ ok: false, feil: isSchemaError(msg) ? schemaFeil : "Kunne ikke opprette lokasjon." }, { status: isSchemaError(msg) ? 500 : 400 })
    }
    const locationId = existing ? String((existing as { id?: unknown }).id ?? "") : crypto.randomUUID()
    if (!existing) {
      const { error } = await admin.from("lek_v2_lager").insert({
        id: locationId,
        created_at: nowIso,
        updated_at: nowIso,
        kind: "location",
        name: locationName,
        dedupe_key: dedupe,
        active: true,
        location_type: locationType,
        address: address || null,
        lat,
        lng,
        responsible_lager_id: fromPersonId,
      } as unknown as never)
      if (error) {
        const msg = String((error as { message?: string } | null)?.message ?? "")
        return NextResponse.json({ ok: false, feil: isSchemaError(msg) ? schemaFeil : "Kunne ikke opprette lokasjon." }, { status: isSchemaError(msg) ? 500 : 400 })
      }
    } else {
      await admin
        .from("lek_v2_lager")
        .update({ updated_at: nowIso, location_type: locationType, address: address || null, lat, lng, responsible_lager_id: fromPersonId } as unknown as never)
        .eq("id", locationId)
    }

    const fromSaldo = await getSaldo(admin, [fromPersonId])
    const currBoxes = Number((fromSaldo.get(fromPersonId) ?? {})["bie_eske"] ?? 0)
    const currGlasses = Number((fromSaldo.get(fromPersonId) ?? {})["glass"] ?? 0)
    if (!Number.isFinite(currBoxes) || currBoxes < initialBoxes) return NextResponse.json({ ok: false, feil: "Ikke nok esker på personlager." }, { status: 400 })
    if (!Number.isFinite(currGlasses) || currGlasses < initialGlasses) return NextResponse.json({ ok: false, feil: "Ikke nok glass på personlager." }, { status: 400 })

    const decBoxes = await applyDelta(admin, fromPersonId, "bie_eske", -initialBoxes)
    if (!decBoxes.ok) return NextResponse.json({ ok: false, feil: "Kunne ikke oppdatere lager." }, { status: 400 })
    const incBoxes = await applyDelta(admin, locationId, "bie_eske", initialBoxes)
    if (!incBoxes.ok) return NextResponse.json({ ok: false, feil: "Kunne ikke oppdatere lager." }, { status: 400 })
    if (initialGlasses > 0) {
      const decGlass = await applyDelta(admin, fromPersonId, "glass", -initialGlasses)
      if (!decGlass.ok) return NextResponse.json({ ok: false, feil: "Kunne ikke oppdatere lager." }, { status: 400 })
      const incGlass = await applyDelta(admin, locationId, "glass", initialGlasses)
      if (!incGlass.ok) return NextResponse.json({ ok: false, feil: "Kunne ikke oppdatere lager." }, { status: 400 })
    }

    await admin.from("lek_v2_lager_bevegelser").insert(
      [
        { id: crypto.randomUUID(), created_at: nowIso, from_lager_id: fromPersonId, to_lager_id: locationId, item: "bie_eske", qty: initialBoxes, reason: "deploy", note: comment || null, actor_epost: gate.email, actor_role: gate.role },
        ...(initialGlasses > 0
          ? [
              { id: crypto.randomUUID(), created_at: nowIso, from_lager_id: fromPersonId, to_lager_id: locationId, item: "glass", qty: initialGlasses, reason: "deploy", note: comment || null, actor_epost: gate.email, actor_role: gate.role },
            ]
          : []),
      ] as unknown as never
    )

    const rawFiles = form.getAll("images")
    const files = rawFiles.filter((f) => f instanceof File && f.size > 0) as File[]
    const images = files.slice(0, 3)
    for (const f of images) {
      if (String(f.type || "").startsWith("video/")) return NextResponse.json({ ok: false, feil: "Bilde må være et bilde (ikke video)." }, { status: 400 })
      if (f.size > 4 * 1024 * 1024) return NextResponse.json({ ok: false, feil: "Bilde er for stort (maks 4 MB)." }, { status: 400 })
    }

    const eventId = crypto.randomUUID()
    const uploaded: string[] = []
    const paths: Array<string | null> = [null, null, null]
    for (let i = 0; i < images.length; i++) {
      const f = images[i]
      const ext = (f.type || "").toLowerCase().includes("png") ? "png" : (f.type || "").toLowerCase().includes("webp") ? "webp" : "jpg"
      const path = `${toSafeStorageKey(locationId)}/utsetting/${eventId}-${i + 1}.${ext}`
      const body = await f.arrayBuffer()
      const { error: uploadError } = await admin.storage.from(bucket).upload(path, body, { upsert: false, contentType: f.type || undefined })
      if (uploadError) {
        if (uploaded.length) await admin.storage.from(bucket).remove(uploaded)
        const msg = String((uploadError as { message?: string } | null)?.message ?? "").trim()
        return NextResponse.json({ ok: false, feil: msg ? `Kunne ikke laste opp bilde: ${msg}` : "Kunne ikke laste opp bilde." }, { status: 400 })
      }
      uploaded.push(path)
      paths[i] = path
    }

    const { error: evErr } = await admin.from("lek_v2_lokasjon_hendelser").insert({
      id: eventId,
      created_at: nowIso,
      location_lager_id: locationId,
      type: "utsetting",
      glasses_left: initialGlasses,
      filled_added: null,
      comment: comment || null,
      lat,
      lng,
      image1_path: paths[0],
      image2_path: paths[1],
      image3_path: paths[2],
      actor_epost: gate.email,
      actor_role: gate.role,
    } as unknown as never)
    if (evErr) {
      const msg = String((evErr as { message?: string } | null)?.message ?? "")
      if (uploaded.length) await admin.storage.from(bucket).remove(uploaded)
      return NextResponse.json({ ok: false, feil: isSchemaError(msg) ? schemaFeil : "Kunne ikke lagre historikk." }, { status: isSchemaError(msg) ? 500 : 400 })
    }

    await admin.from("lek_v2_lager").update({ updated_at: nowIso } as unknown as never).in("id", [fromPersonId, locationId])
    return NextResponse.json({ ok: true, locationId, reusedLocation: Boolean(existing) })
  }

  if (action === "control") {
    const locationId = String(form.get("locationId") ?? "").trim()
    const glassesLeft = toInt(form.get("glassesLeft"))
    const filledAdded = toInt(form.get("filledAdded"))
    const fromLagerId = String(form.get("fromLagerId") ?? "").trim()
    const comment = String(form.get("comment") ?? "").trim()
    const lat = toNumber(form.get("lat"))
    const lng = toNumber(form.get("lng"))
    if (!locationId) return NextResponse.json({ ok: false, feil: "Mangler lokasjon." }, { status: 400 })
    if (glassesLeft == null || glassesLeft < 0) return NextResponse.json({ ok: false, feil: "Ugyldig glass igjen." }, { status: 400 })

    const saldo = await getSaldo(admin, [locationId])
    const curr = Number((saldo.get(locationId) ?? {})["glass"] ?? 0)
    const delta = Math.trunc(glassesLeft - (Number.isFinite(curr) ? curr : 0))
    if (delta !== 0) {
      if (delta > 0) {
        const inc = await applyDelta(admin, locationId, "glass", delta)
        if (!inc.ok) return NextResponse.json({ ok: false, feil: "Kunne ikke oppdatere lager." }, { status: 400 })
      } else {
        const dec = await applyDelta(admin, locationId, "glass", delta)
        if (!dec.ok) return NextResponse.json({ ok: false, feil: "Kunne ikke oppdatere lager." }, { status: 400 })
      }
      await admin.from("lek_v2_lager_bevegelser").insert({
        id: crypto.randomUUID(),
        created_at: nowIso,
        from_lager_id: delta < 0 ? locationId : null,
        to_lager_id: delta > 0 ? locationId : null,
        item: "glass",
        qty: Math.abs(delta),
        reason: "count_adjust",
        note: "Kontroll: justering til telt antall",
        actor_epost: gate.email,
        actor_role: gate.role,
      } as unknown as never)
    }

    if (filledAdded != null && filledAdded > 0) {
      if (!fromLagerId) return NextResponse.json({ ok: false, feil: "Velg hvilket lager glass tas fra." }, { status: 400 })
      const fromSaldo = await getSaldo(admin, [fromLagerId])
      const currFrom = Number((fromSaldo.get(fromLagerId) ?? {})["glass"] ?? 0)
      if (!Number.isFinite(currFrom) || currFrom < filledAdded) return NextResponse.json({ ok: false, feil: "Ikke nok glass på valgt lager." }, { status: 400 })

      const dec = await applyDelta(admin, fromLagerId, "glass", -filledAdded)
      if (!dec.ok) return NextResponse.json({ ok: false, feil: "Kunne ikke oppdatere lager." }, { status: 400 })
      const inc = await applyDelta(admin, locationId, "glass", filledAdded)
      if (!inc.ok) return NextResponse.json({ ok: false, feil: "Kunne ikke oppdatere lager." }, { status: 400 })

      await admin.from("lek_v2_lager_bevegelser").insert({
        id: crypto.randomUUID(),
        created_at: nowIso,
        from_lager_id: fromLagerId,
        to_lager_id: locationId,
        item: "glass",
        qty: filledAdded,
        reason: "refill",
        note: comment || null,
        actor_epost: gate.email,
        actor_role: gate.role,
      } as unknown as never)
    }

    const rawFiles = form.getAll("images")
    const files = rawFiles.filter((f) => f instanceof File && f.size > 0) as File[]
    const images = files.slice(0, 3)
    for (const f of images) {
      if (String(f.type || "").startsWith("video/")) return NextResponse.json({ ok: false, feil: "Bilde må være et bilde (ikke video)." }, { status: 400 })
      if (f.size > 4 * 1024 * 1024) return NextResponse.json({ ok: false, feil: "Bilde er for stort (maks 4 MB)." }, { status: 400 })
    }

    const eventId = crypto.randomUUID()
    const uploaded: string[] = []
    const paths: Array<string | null> = [null, null, null]
    for (let i = 0; i < images.length; i++) {
      const f = images[i]
      const ext = (f.type || "").toLowerCase().includes("png") ? "png" : (f.type || "").toLowerCase().includes("webp") ? "webp" : "jpg"
      const path = `${toSafeStorageKey(locationId)}/kontroll/${eventId}-${i + 1}.${ext}`
      const body = await f.arrayBuffer()
      const { error: uploadError } = await admin.storage.from(bucket).upload(path, body, { upsert: false, contentType: f.type || undefined })
      if (uploadError) {
        if (uploaded.length) await admin.storage.from(bucket).remove(uploaded)
        const msg = String((uploadError as { message?: string } | null)?.message ?? "").trim()
        return NextResponse.json({ ok: false, feil: msg ? `Kunne ikke laste opp bilde: ${msg}` : "Kunne ikke laste opp bilde." }, { status: 400 })
      }
      uploaded.push(path)
      paths[i] = path
    }

    const { error: evErr } = await admin.from("lek_v2_lokasjon_hendelser").insert({
      id: eventId,
      created_at: nowIso,
      location_lager_id: locationId,
      type: "kontroll",
      glasses_left: glassesLeft,
      filled_added: filledAdded != null && filledAdded > 0 ? filledAdded : null,
      comment: comment || null,
      lat,
      lng,
      image1_path: paths[0],
      image2_path: paths[1],
      image3_path: paths[2],
      actor_epost: gate.email,
      actor_role: gate.role,
    } as unknown as never)
    if (evErr) {
      const msg = String((evErr as { message?: string } | null)?.message ?? "")
      if (uploaded.length) await admin.storage.from(bucket).remove(uploaded)
      return NextResponse.json({ ok: false, feil: isSchemaError(msg) ? schemaFeil : "Kunne ikke lagre historikk." }, { status: isSchemaError(msg) ? 500 : 400 })
    }

    await admin.from("lek_v2_lager").update({ updated_at: nowIso } as unknown as never).eq("id", locationId)
    if (fromLagerId) await admin.from("lek_v2_lager").update({ updated_at: nowIso } as unknown as never).eq("id", fromLagerId)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, feil: "Ukjent action." }, { status: 400 })
}
