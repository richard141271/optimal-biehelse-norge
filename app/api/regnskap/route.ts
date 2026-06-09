import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { hasPermission, normalizeRole } from "@/lib/roller"

export const dynamic = "force-dynamic"

const MAX_BILAG_BYTES = 20 * 1024 * 1024

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function extFromNameAndType(filename: string, type: string) {
  const safe = (s: string) => s.replace(/[^a-z0-9]+/g, "").slice(0, 10)
  const name = String(filename ?? "").trim().toLowerCase()
  const t = String(type ?? "").trim().toLowerCase()

  const last = name.lastIndexOf(".")
  const fromName = last > 0 ? safe(name.slice(last + 1)) : ""
  if (fromName) return fromName

  if (t.includes("pdf")) return "pdf"
  if (t.includes("png")) return "png"
  if (t.includes("webp")) return "webp"
  if (t.includes("jpeg") || t.includes("jpg")) return "jpg"
  if (t.includes("heic")) return "heic"
  if (t.includes("heif")) return "heif"
  if (t.includes("csv")) return "csv"
  if (t.includes("json")) return "json"
  if (t.includes("xml")) return "xml"
  if (t.startsWith("text/")) return "txt"
  return "bin"
}

function parseMoney(value: string) {
  const trimmed = value.trim().replace(/\s/g, "")
  if (!trimmed) return null
  const cleaned = trimmed.replace(/[^\d,.-]/g, "")
  if (!cleaned || cleaned === "-" || cleaned === "," || cleaned === ".") return null

  const negative = cleaned.startsWith("-")
  const unsigned = negative ? cleaned.slice(1) : cleaned
  const lastComma = unsigned.lastIndexOf(",")
  const lastDot = unsigned.lastIndexOf(".")

  let decimalSep = ""
  if (lastComma >= 0 && lastDot >= 0) {
    decimalSep = lastComma > lastDot ? "," : "."
  } else if (lastComma >= 0) {
    const decimals = unsigned.length - lastComma - 1
    decimalSep = decimals > 0 && decimals <= 2 ? "," : ""
  } else if (lastDot >= 0) {
    const decimals = unsigned.length - lastDot - 1
    decimalSep = decimals > 0 && decimals <= 2 ? "." : ""
  }

  let normalized = unsigned
  if (decimalSep) {
    const idx = decimalSep === "," ? lastComma : lastDot
    const intPart = unsigned.slice(0, idx).replace(/[.,]/g, "")
    const fracPart = unsigned.slice(idx + 1).replace(/[^\d]/g, "")
    normalized = `${intPart || "0"}.${fracPart}`
  } else {
    normalized = unsigned.replace(/[.,]/g, "")
  }

  if (!/^\d+(\.\d+)?$/.test(normalized)) return null
  const n = Number(`${negative ? "-" : ""}${normalized}`)
  if (!Number.isFinite(n)) return null
  return n
}

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string") {
    return parseMoney(value)
  }
  return null
}

async function getAuth() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) return null

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
  const email = (user?.email ?? "").trim().toLowerCase()
  if (!userId || !email) return null
  return { userId, email, supabaseUrl }
}

const schemaFeil =
  "Regnskap-tabellen i Supabase mangler felter. Kjør denne SQL-en i Supabase (SQL Editor), og prøv igjen:\n\n" +
  "create table if not exists public.regnskap_poster (\n" +
  "  id uuid primary key default gen_random_uuid(),\n" +
  "  created_at timestamptz not null default now(),\n" +
  "  dato date not null,\n" +
  "  type text not null,\n" +
  "  belop numeric not null,\n" +
  "  motpart text,\n" +
  "  vare text,\n" +
  "  notat text,\n" +
  "  bilag_path text,\n" +
  "  bilag_ocr_text text,\n" +
  "  kilde text,\n" +
  "  utlegg_medlem_id text,\n" +
  "  utlegg_medlem_navn text,\n" +
  "  utlegg_medlem_epost text,\n" +
  "  utlegg_status text,\n" +
  "  utlegg_utbetalt_at timestamptz\n" +
  ");\n" +
  "alter table public.regnskap_poster add column if not exists bilag_ocr_text text;\n" +
  "alter table public.regnskap_poster add column if not exists kilde text;\n" +
  "alter table public.regnskap_poster add column if not exists utlegg_medlem_id text;\n" +
  "alter table public.regnskap_poster add column if not exists utlegg_medlem_navn text;\n" +
  "alter table public.regnskap_poster add column if not exists utlegg_medlem_epost text;\n" +
  "alter table public.regnskap_poster add column if not exists utlegg_status text;\n" +
  "alter table public.regnskap_poster add column if not exists utlegg_utbetalt_at timestamptz;\n"

const bucket = "bilag"

const innstillingerId = "main"

const innstillingerSchemaFeil =
  "Regnskap-innstillinger mangler i Supabase. Kjør denne SQL-en i Supabase (SQL Editor), og prøv igjen:\n\n" +
  "create table if not exists public.regnskap_innstillinger (\n" +
  "  id text primary key,\n" +
  "  created_at timestamptz not null default now(),\n" +
  "  updated_at timestamptz not null default now(),\n" +
  "  kontonummer text,\n" +
  "  saldo numeric not null default 0\n" +
  ");\n" +
  "insert into public.regnskap_innstillinger (id, kontonummer, saldo)\n" +
  "values ('main', null, 0)\n" +
  "on conflict (id) do nothing;\n"

const loggSchemaFeil =
  "Regnskap mangler logg/arkiv i Supabase. Kjør denne SQL-en i Supabase (SQL Editor), og prøv igjen:\n\n" +
  "create table if not exists public.regnskap_logg (\n" +
  "  id uuid primary key default gen_random_uuid(),\n" +
  "  created_at timestamptz not null default now(),\n" +
  "  actor_epost text,\n" +
  "  actor_role text,\n" +
  "  action text not null,\n" +
  "  entity_type text not null,\n" +
  "  entity_id text,\n" +
  "  before jsonb,\n" +
  "  after jsonb,\n" +
  "  korreksjon_notat text,\n" +
  "  korreksjon_at timestamptz,\n" +
  "  korreksjon_av_epost text\n" +
  ");\n" +
  "create index if not exists regnskap_logg_created_at_idx on public.regnskap_logg (created_at desc);\n" +
  "create index if not exists regnskap_logg_entity_idx on public.regnskap_logg (entity_type, entity_id);\n"

function isMissingTable(message: string, table: string) {
  const m = message.toLowerCase()
  if (m.includes("42p01")) return true
  if (!m.includes(table.toLowerCase())) return false
  if (m.includes("relation") && m.includes("does not exist")) return true
  if (m.includes("schema cache")) return true
  if (m.includes("could not find the table")) return true
  if (m.includes("not found")) return true
  if (m.includes("does not exist")) return true
  return false
}

function isSchemaError(message: string, table: string) {
  const m = message.toLowerCase()
  if (isMissingTable(m, table)) return true
  if (m.includes("column") && m.includes(table.toLowerCase())) return true
  if (m.includes("column") && (m.includes("kontonummer") || m.includes("saldo") || m.includes("updated_at"))) {
    return true
  }
  return false
}

function isLoggSchemaError(message: string) {
  const m = message.toLowerCase()
  if (isMissingTable(m, "regnskap_logg")) return true
  if (m.includes("column") && m.includes("regnskap_logg")) return true
  if (m.includes("schema cache") && m.includes("regnskap_logg")) return true
  return false
}

async function loggHendelse(
  admin: SupabaseClient,
  entry: {
    actor_epost: string
    actor_role: string
    action: string
    entity_type: string
    entity_id?: string | null
    before?: unknown
    after?: unknown
  }
) {
  try {
    const { error } = await admin.from("regnskap_logg").insert({
      actor_epost: entry.actor_epost,
      actor_role: entry.actor_role,
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
    })
    if (error) {
      const msg = String((error as { message?: string } | null)?.message ?? "")
      if (isLoggSchemaError(msg)) return { ok: false as const, schemaFeil: true as const }
      return { ok: false as const, schemaFeil: false as const }
    }
    return { ok: true as const }
  } catch {
    return { ok: false as const, schemaFeil: false as const }
  }
}

async function hentInnstillinger(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("regnskap_innstillinger")
    .select("id, kontonummer, saldo")
    .eq("id", innstillingerId)
    .maybeSingle()

  if (error) {
    const msg = String((error as { message?: string } | null)?.message ?? "")
    if (isSchemaError(msg, "regnskap_innstillinger")) {
      return { ok: false as const, schemaFeil: true as const }
    }
    return { ok: false as const, schemaFeil: false as const }
  }

  if (data) {
    return {
      ok: true as const,
      kontonummer: typeof data.kontonummer === "string" ? data.kontonummer : "",
      saldo: toNumber((data as { saldo?: unknown } | null)?.saldo) ?? 0,
    }
  }

  const { error: insertError } = await admin.from("regnskap_innstillinger").insert({
    id: innstillingerId,
    kontonummer: null,
    saldo: 0,
    updated_at: new Date().toISOString(),
  })

  if (insertError) {
    const msg = String((insertError as { message?: string } | null)?.message ?? "")
    if (isSchemaError(msg, "regnskap_innstillinger")) {
      return { ok: false as const, schemaFeil: true as const }
    }
    if (/duplicate key/i.test(msg) || /already exists/i.test(msg)) {
      const { data: again, error: againError } = await admin
        .from("regnskap_innstillinger")
        .select("kontonummer, saldo")
        .eq("id", innstillingerId)
        .maybeSingle()
      if (againError || !again) return { ok: true as const, kontonummer: "", saldo: 0 }
      return {
        ok: true as const,
        kontonummer: typeof again.kontonummer === "string" ? again.kontonummer : "",
        saldo: toNumber((again as { saldo?: unknown } | null)?.saldo) ?? 0,
      }
    }
    return { ok: false as const, schemaFeil: false as const }
  }

  return { ok: true as const, kontonummer: "", saldo: 0 }
}

function describeError(error: unknown) {
  if (!error) return null
  if (typeof error === "string") return error
  if (error instanceof Error) return error.message || "Ukjent feil"
  const e = error as Record<string, unknown>
  const message = typeof e.message === "string" ? e.message : ""
  const errorCode = typeof e.error === "string" ? e.error : ""
  const statusCode =
    typeof e.statusCode === "number"
      ? String(e.statusCode)
      : typeof e.status === "number"
        ? String(e.status)
        : ""
  const parts = [message, errorCode && `code=${errorCode}`, statusCode && `status=${statusCode}`]
    .filter(Boolean)
    .join(" ")
    .trim()
  return parts || "Ukjent feil"
}

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { ok: false, feil: "Supabase er ikke konfigurert. Legg inn miljøvariabler først." },
      { status: 500 }
    )
  }

  const auth = await getAuth()
  if (!auth) {
    return NextResponse.json({ ok: false, feil: "Ikke innlogget." }, { status: 401 })
  }

  if (!serviceRoleKey) {
    return NextResponse.json(
      { ok: false, feil: "Regnskap i admin krever SUPABASE_SERVICE_ROLE_KEY i miljøvariabler." },
      { status: 500 }
    )
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { data: roleRow } = await admin
    .from("medlemmer")
    .select("role")
    .eq("user_id", auth.userId)
    .maybeSingle()
  const role = String(roleRow?.role ?? "")
  const ownerEmail = String(
    process.env.ADMIN_SUPERADMIN_EMAIL ?? process.env.ADMIN_BOOTSTRAP_EMAIL ?? ""
  )
    .trim()
    .toLowerCase()
  const resolvedRole = ownerEmail && auth.email === ownerEmail ? "superadmin" : normalizeRole(role)
  if (!hasPermission(resolvedRole, "view_finance")) {
    if (!ownerEmail || auth.email !== ownerEmail) {
      return NextResponse.json({ ok: false, feil: "Ingen tilgang." }, { status: 403 })
    }
  }

  const { data, error } = await admin
    .from("regnskap_poster")
    .select(
      "id, created_at, dato, type, belop, motpart, vare, notat, bilag_path, kilde, utlegg_medlem_id, utlegg_medlem_navn, utlegg_medlem_epost, utlegg_status, utlegg_utbetalt_at"
    )
    .order("dato", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500)

  if (error) {
    const msg = String((error as { message?: string } | null)?.message ?? "")
    if (
      (/relation/i.test(msg) && /regnskap_poster/i.test(msg)) ||
      /42p01/i.test(msg) ||
      /column/i.test(msg) ||
      /schema cache/i.test(msg)
    ) {
      return NextResponse.json({ ok: false, feil: schemaFeil }, { status: 500 })
    }
    return NextResponse.json({ ok: false, feil: "Kunne ikke hente regnskap." }, { status: 400 })
  }

  const rows = (data ?? []) as Record<string, unknown>[]
  const result = await Promise.all(
    rows.map(async (r) => {
      const path = typeof r.bilag_path === "string" ? r.bilag_path : null
      if (!path) return { ...r, bilag_url: null }
      const { data: signed } = await admin.storage.from(bucket).createSignedUrl(path, 60)
      return { ...r, bilag_url: signed?.signedUrl ?? null }
    })
  )

  let inn = 0
  let ut = 0
  for (const p of result) {
    const type = String((p as { type?: unknown } | null)?.type ?? "")
    const bel = toNumber((p as { belop?: unknown } | null)?.belop) ?? 0
    if (type === "inntekt") inn += bel
    if (type === "utgift") ut += bel
  }

  const resultat = inn - ut
  const innstillinger = await hentInnstillinger(admin)
  if (!innstillinger.ok) {
    return NextResponse.json({
      ok: true,
      poster: result,
      innstillinger: { kontonummer: "", saldo: resultat },
      innstillingerFeil: innstillinger.schemaFeil ? innstillingerSchemaFeil : "Kunne ikke hente innstillinger.",
      summer: { inn, ut, resultat },
    })
  }

  return NextResponse.json({
    ok: true,
    poster: result,
    innstillinger: { kontonummer: innstillinger.kontonummer, saldo: resultat + (innstillinger.saldo ?? 0) },
    summer: { inn, ut, resultat },
  })
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { ok: false, feil: "Supabase er ikke konfigurert. Legg inn miljøvariabler først." },
      { status: 500 }
    )
  }

  const auth = await getAuth()
  if (!auth) {
    return NextResponse.json({ ok: false, feil: "Ikke innlogget." }, { status: 401 })
  }

  if (!serviceRoleKey) {
    return NextResponse.json(
      { ok: false, feil: "Regnskap i admin krever SUPABASE_SERVICE_ROLE_KEY i miljøvariabler." },
      { status: 500 }
    )
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { data: roleRow } = await admin
    .from("medlemmer")
    .select("role")
    .eq("user_id", auth.userId)
    .maybeSingle()
  const role = String(roleRow?.role ?? "")
  const ownerEmail = String(
    process.env.ADMIN_SUPERADMIN_EMAIL ?? process.env.ADMIN_BOOTSTRAP_EMAIL ?? ""
  )
    .trim()
    .toLowerCase()
  const resolvedRole = ownerEmail && auth.email === ownerEmail ? "superadmin" : normalizeRole(role)
  if (!hasPermission(resolvedRole, "manage_finance")) {
    if (!ownerEmail || auth.email !== ownerEmail) {
      return NextResponse.json({ ok: false, feil: "Ingen tilgang." }, { status: 403 })
    }
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json(
      {
        ok: false,
        feil: "Ugyldig forespørsel (kunne ikke lese fil). Hvis du laster opp bilag: prøv en mindre fil.",
      },
      { status: 400 }
    )
  }

  const type = String(form.get("type") ?? "").trim()
  const dato = String(form.get("dato") ?? "").trim() || todayIso()
  const belop = parseMoney(String(form.get("belop") ?? ""))
  const motpart = String(form.get("motpart") ?? "").trim()
  const vare = String(form.get("vare") ?? "").trim()
  const notat = String(form.get("notat") ?? "").trim()
  const bilagTekst = String(form.get("bilagTekst") ?? "").trim()
  const utleggMedlemId = String(form.get("utleggMedlemId") ?? "").trim()
  const utleggMedlemNavn = String(form.get("utleggMedlemNavn") ?? "").trim()
  const utleggMedlemEpost = String(form.get("utleggMedlemEpost") ?? "").trim()
  const utleggStatus = String(form.get("utleggStatus") ?? "").trim()
  const bilag = form.get("bilag")

  if (type !== "utgift" && type !== "inntekt") {
    return NextResponse.json({ ok: false, feil: "Velg type (utgift/inntekt)." }, { status: 400 })
  }

  if (!belop && belop !== 0) {
    return NextResponse.json({ ok: false, feil: "Skriv inn et gyldig beløp." }, { status: 400 })
  }

  let bilagPath: string | null = null
  if (bilag instanceof File && bilag.size > 0) {
    if (String(bilag.type || "").startsWith("video/")) {
      return NextResponse.json({ ok: false, feil: "Bilag kan ikke være video." }, { status: 400 })
    }
    if (bilag.size > MAX_BILAG_BYTES) {
      return NextResponse.json(
        { ok: false, feil: "Bilag er for stort (maks 20 MB)." },
        { status: 400 }
      )
    }

    const { error: createBucketError } = await admin.storage.createBucket(bucket, {
      public: false,
    })
    if (createBucketError) {
      const msg = String((createBucketError as { message?: string } | null)?.message ?? "")
      if (!/exists/i.test(msg) && !/already/i.test(msg)) {
        return NextResponse.json(
          {
            ok: false,
            feil: "Lagring av bilag er ikke satt opp i Supabase Storage. Lag en bucket som heter 'bilag' (private), og prøv igjen.",
          },
          { status: 500 }
        )
      }
    }

    const ext = extFromNameAndType(bilag.name, bilag.type)
    bilagPath = `${todayIso()}/${crypto.randomUUID()}.${ext}`
    const body = await bilag.arrayBuffer()
    const { error: uploadError } = await admin.storage
      .from(bucket)
      .upload(bilagPath, body, { upsert: false, contentType: bilag.type || undefined })
    if (uploadError) {
      const msg = describeError(uploadError)
      return NextResponse.json(
        {
          ok: false,
          feil: msg ? `Kunne ikke laste opp bilag: ${msg}` : "Kunne ikke laste opp bilag.",
        },
        { status: 400 }
      )
    }
  }

  const insert: Record<string, unknown> = {
    type,
    dato,
    belop,
    motpart: motpart || null,
    vare: vare || null,
    notat: notat || null,
    bilag_path: bilagPath,
    bilag_ocr_text: bilagTekst || null,
    kilde: "manuelt",
  }

  if (utleggMedlemId) insert.utlegg_medlem_id = utleggMedlemId
  if (utleggMedlemNavn) insert.utlegg_medlem_navn = utleggMedlemNavn
  if (utleggMedlemEpost) insert.utlegg_medlem_epost = utleggMedlemEpost
  if (utleggStatus) insert.utlegg_status = utleggStatus

  const { data: insertedRow, error } = await admin
    .from("regnskap_poster")
    .insert(insert)
    .select("id")
    .maybeSingle()

  if (error) {
    const msg = String((error as { message?: string } | null)?.message ?? "")
    if (
      (/(relation|column)/i.test(msg) && /regnskap_poster/i.test(msg)) ||
      /42p01/i.test(msg) ||
      /bilag_ocr_text/i.test(msg)
    ) {
      if (bilagPath) {
        await admin.storage.from(bucket).remove([bilagPath])
      }
      return NextResponse.json({ ok: false, feil: schemaFeil }, { status: 500 })
    }
    if (bilagPath) {
      await admin.storage.from(bucket).remove([bilagPath])
    }
    return NextResponse.json({ ok: false, feil: "Kunne ikke lagre regnskapspost." }, { status: 400 })
  }

  const logg = await loggHendelse(admin, {
    actor_epost: auth.email,
    actor_role: resolvedRole,
    action: "poster:create",
    entity_type: "regnskap_poster",
    entity_id: String((insertedRow as { id?: string } | null)?.id ?? "") || null,
    before: null,
    after: insert,
  })

  return NextResponse.json({ ok: true, loggFeil: !logg.ok && logg.schemaFeil ? loggSchemaFeil : undefined })
}

export async function PATCH(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { ok: false, feil: "Supabase er ikke konfigurert. Legg inn miljøvariabler først." },
      { status: 500 }
    )
  }

  const auth = await getAuth()
  if (!auth) {
    return NextResponse.json({ ok: false, feil: "Ikke innlogget." }, { status: 401 })
  }

  if (!serviceRoleKey) {
    return NextResponse.json(
      { ok: false, feil: "Regnskap i admin krever SUPABASE_SERVICE_ROLE_KEY i miljøvariabler." },
      { status: 500 }
    )
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { data: roleRow } = await admin
    .from("medlemmer")
    .select("role")
    .eq("user_id", auth.userId)
    .maybeSingle()
  const role = String(roleRow?.role ?? "")
  const ownerEmail = String(
    process.env.ADMIN_SUPERADMIN_EMAIL ?? process.env.ADMIN_BOOTSTRAP_EMAIL ?? ""
  )
    .trim()
    .toLowerCase()
  const isBootstrapSuper = ownerEmail && auth.email === ownerEmail
  const resolvedRole = isBootstrapSuper ? "superadmin" : normalizeRole(role)
  if (!hasPermission(resolvedRole, "manage_finance")) {
    if (!ownerEmail || auth.email !== ownerEmail) {
      return NextResponse.json({ ok: false, feil: "Ingen tilgang." }, { status: 403 })
    }
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json(
      {
        ok: false,
        feil: "Ugyldig forespørsel (kunne ikke lese fil). Hvis du laster opp bilag: prøv en mindre fil.",
      },
      { status: 400 }
    )
  }

  const id = String(form.get("id") ?? "").trim()
  if (!id) {
    return NextResponse.json({ ok: false, feil: "Mangler id for regnskapspost." }, { status: 400 })
  }

  const typeInput = form.has("type") ? String(form.get("type") ?? "").trim() : ""
  const datoInput = form.has("dato") ? String(form.get("dato") ?? "").trim() : ""
  const belopRaw = form.has("belop") ? String(form.get("belop") ?? "").trim() : ""
  const belopInput = belopRaw ? parseMoney(belopRaw) : null
  const motpartInput = form.has("motpart") ? String(form.get("motpart") ?? "").trim() : null
  const vareInput = form.has("vare") ? String(form.get("vare") ?? "").trim() : null
  const notatInput = form.has("notat") ? String(form.get("notat") ?? "").trim() : null
  const hasBilagTekst = form.has("bilagTekst")
  const bilagTekstInput = hasBilagTekst ? String(form.get("bilagTekst") ?? "").trim() : null
  const utleggMedlemId = form.has("utleggMedlemId") ? String(form.get("utleggMedlemId") ?? "").trim() : null
  const utleggMedlemNavn = form.has("utleggMedlemNavn") ? String(form.get("utleggMedlemNavn") ?? "").trim() : null
  const utleggMedlemEpost = form.has("utleggMedlemEpost") ? String(form.get("utleggMedlemEpost") ?? "").trim() : null
  const utleggStatus = form.has("utleggStatus") ? String(form.get("utleggStatus") ?? "").trim() : null
  const utleggUtbetaltAt = form.has("utleggUtbetaltAt") ? String(form.get("utleggUtbetaltAt") ?? "").trim() : null
  const bilag = form.get("bilag")

  const { data: existingRow, error: existingError } = await admin
    .from("regnskap_poster")
    .select(
      "bilag_path, type, dato, belop, motpart, vare, notat, bilag_ocr_text, utlegg_medlem_id, utlegg_medlem_navn, utlegg_medlem_epost, utlegg_status, utlegg_utbetalt_at"
    )
    .eq("id", id)
    .maybeSingle()

  if (existingError) {
    return NextResponse.json({ ok: false, feil: "Kunne ikke hente regnskapspost." }, { status: 400 })
  }
  if (!existingRow) {
    return NextResponse.json({ ok: false, feil: "Regnskapspost finnes ikke." }, { status: 404 })
  }

  const isUtlegg =
    Boolean(
      String((existingRow as { utlegg_medlem_id?: unknown } | null)?.utlegg_medlem_id ?? "").trim() ||
        String((existingRow as { utlegg_status?: unknown } | null)?.utlegg_status ?? "").trim() ||
        String((existingRow as { utlegg_medlem_navn?: unknown } | null)?.utlegg_medlem_navn ?? "").trim() ||
        String((existingRow as { utlegg_medlem_epost?: unknown } | null)?.utlegg_medlem_epost ?? "").trim()
    )

  if (isUtlegg && resolvedRole !== "superadmin" && !isBootstrapSuper) {
    return NextResponse.json(
      { ok: false, feil: "Kun superbruker kan endre utlegg." },
      { status: 403 }
    )
  }

  const oldBilagPath = typeof existingRow.bilag_path === "string" ? existingRow.bilag_path : null
  const existingType = String((existingRow as { type?: unknown } | null)?.type ?? "").trim()
  const existingDato = String((existingRow as { dato?: unknown } | null)?.dato ?? "").trim() || todayIso()
  const existingBelop = toNumber((existingRow as { belop?: unknown } | null)?.belop)
  const existingMotpart = String((existingRow as { motpart?: unknown } | null)?.motpart ?? "").trim()
  const existingVare = String((existingRow as { vare?: unknown } | null)?.vare ?? "").trim()
  const existingNotat = String((existingRow as { notat?: unknown } | null)?.notat ?? "").trim()
  const existingBilagTekst = String((existingRow as { bilag_ocr_text?: unknown } | null)?.bilag_ocr_text ?? "").trim()

  const type = (typeInput || existingType).trim()
  const dato = (datoInput || existingDato).trim() || todayIso()
  const belop = belopInput ?? existingBelop
  const motpart = motpartInput === null ? existingMotpart : motpartInput
  const vare = vareInput === null ? existingVare : vareInput
  const notat = notatInput === null ? existingNotat : notatInput
  const bilagTekst = bilagTekstInput === null ? existingBilagTekst : bilagTekstInput

  if (type !== "utgift" && type !== "inntekt") {
    return NextResponse.json({ ok: false, feil: "Velg type (utgift/inntekt)." }, { status: 400 })
  }

  if (belop === null) {
    return NextResponse.json({ ok: false, feil: "Skriv inn et gyldig beløp." }, { status: 400 })
  }

  let newBilagPath: string | null = null
  if (bilag instanceof File && bilag.size > 0) {
    if (String(bilag.type || "").startsWith("video/")) {
      return NextResponse.json({ ok: false, feil: "Bilag kan ikke være video." }, { status: 400 })
    }
    if (bilag.size > MAX_BILAG_BYTES) {
      return NextResponse.json(
        { ok: false, feil: "Bilag er for stort (maks 20 MB)." },
        { status: 400 }
      )
    }

    const { error: createBucketError } = await admin.storage.createBucket(bucket, {
      public: false,
    })
    if (createBucketError) {
      const msg = String((createBucketError as { message?: string } | null)?.message ?? "")
      if (!/exists/i.test(msg) && !/already/i.test(msg)) {
        return NextResponse.json(
          {
            ok: false,
            feil: "Lagring av bilag er ikke satt opp i Supabase Storage. Lag en bucket som heter 'bilag' (private), og prøv igjen.",
          },
          { status: 500 }
        )
      }
    }

    const ext = extFromNameAndType(bilag.name, bilag.type)
    newBilagPath = `${todayIso()}/${crypto.randomUUID()}.${ext}`
    const body = await bilag.arrayBuffer()
    const { error: uploadError } = await admin.storage
      .from(bucket)
      .upload(newBilagPath, body, { upsert: false, contentType: bilag.type || undefined })
    if (uploadError) {
      const msg = describeError(uploadError)
      return NextResponse.json(
        {
          ok: false,
          feil: msg ? `Kunne ikke laste opp bilag: ${msg}` : "Kunne ikke laste opp bilag.",
        },
        { status: 400 }
      )
    }
  }

  const update: Record<string, unknown> = {
    type,
    dato,
    belop,
    motpart: motpart || null,
    vare: vare || null,
    notat: notat || null,
    kilde: "manuelt",
  }
  if (hasBilagTekst) update.bilag_ocr_text = bilagTekst || null
  if (newBilagPath) update.bilag_path = newBilagPath
  if (utleggMedlemId !== null) update.utlegg_medlem_id = utleggMedlemId || null
  if (utleggMedlemNavn !== null) update.utlegg_medlem_navn = utleggMedlemNavn || null
  if (utleggMedlemEpost !== null) update.utlegg_medlem_epost = utleggMedlemEpost || null
  if (utleggStatus !== null) update.utlegg_status = utleggStatus || null
  if (utleggUtbetaltAt !== null) update.utlegg_utbetalt_at = utleggUtbetaltAt ? utleggUtbetaltAt : null

  const { error: updateError } = await admin.from("regnskap_poster").update(update).eq("id", id)

  if (updateError) {
    const msg = String((updateError as { message?: string } | null)?.message ?? "")
    if (
      (/(relation|column)/i.test(msg) && /regnskap_poster/i.test(msg)) ||
      /42p01/i.test(msg) ||
      /bilag_ocr_text/i.test(msg)
    ) {
      if (newBilagPath) {
        await admin.storage.from(bucket).remove([newBilagPath])
      }
      return NextResponse.json({ ok: false, feil: schemaFeil }, { status: 500 })
    }
    if (newBilagPath) {
      await admin.storage.from(bucket).remove([newBilagPath])
    }
    return NextResponse.json({ ok: false, feil: "Kunne ikke oppdatere regnskapspost." }, { status: 400 })
  }

  if (newBilagPath && oldBilagPath && oldBilagPath !== newBilagPath) {
    await admin.storage.from(bucket).remove([oldBilagPath])
  }

  const logg = await loggHendelse(admin, {
    actor_epost: auth.email,
    actor_role: resolvedRole,
    action: "poster:update",
    entity_type: "regnskap_poster",
    entity_id: id,
    before: existingRow,
    after: { ...(existingRow as Record<string, unknown>), ...update },
  })

  return NextResponse.json({ ok: true, loggFeil: !logg.ok && logg.schemaFeil ? loggSchemaFeil : undefined })
}

export async function PUT(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { ok: false, feil: "Supabase er ikke konfigurert. Legg inn miljøvariabler først." },
      { status: 500 }
    )
  }

  const auth = await getAuth()
  if (!auth) {
    return NextResponse.json({ ok: false, feil: "Ikke innlogget." }, { status: 401 })
  }

  if (!serviceRoleKey) {
    return NextResponse.json(
      { ok: false, feil: "Regnskap i admin krever SUPABASE_SERVICE_ROLE_KEY i miljøvariabler." },
      { status: 500 }
    )
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { data: roleRow } = await admin
    .from("medlemmer")
    .select("role")
    .eq("user_id", auth.userId)
    .maybeSingle()
  const role = String(roleRow?.role ?? "")
  const ownerEmail = String(
    process.env.ADMIN_SUPERADMIN_EMAIL ?? process.env.ADMIN_BOOTSTRAP_EMAIL ?? ""
  )
    .trim()
    .toLowerCase()
  const isBootstrapSuper = ownerEmail && auth.email === ownerEmail
  const resolvedRole = isBootstrapSuper ? "superadmin" : normalizeRole(role)

  const innstillinger = await hentInnstillinger(admin)
  if (!innstillinger.ok) {
    return NextResponse.json(
      { ok: false, feil: innstillinger.schemaFeil ? innstillingerSchemaFeil : "Kunne ikke hente innstillinger." },
      { status: innstillinger.schemaFeil ? 500 : 400 }
    )
  }

  let payload: { kontonummer?: string | null; saldo?: string | number | null }
  try {
    payload = (await request.json()) as { kontonummer?: string | null; saldo?: string | number | null }
  } catch {
    return NextResponse.json({ ok: false, feil: "Ugyldig JSON." }, { status: 400 })
  }

  const hasKontoUpdate = Object.prototype.hasOwnProperty.call(payload, "kontonummer")
  const hasSaldoUpdate = Object.prototype.hasOwnProperty.call(payload, "saldo")
  if (!hasKontoUpdate && !hasSaldoUpdate) {
    return NextResponse.json({ ok: false, feil: "Ugyldig forespørsel." }, { status: 400 })
  }

  if (hasKontoUpdate && !hasPermission(resolvedRole, "manage_finance_settings") && !isBootstrapSuper) {
    return NextResponse.json(
      { ok: false, feil: "Du har ikke tilgang til å endre kontonummer." },
      { status: 403 }
    )
  }
  if (hasSaldoUpdate && resolvedRole !== "superadmin" && !isBootstrapSuper) {
    return NextResponse.json({ ok: false, feil: "Kun superbruker kan endre saldo." }, { status: 403 })
  }

  const kontonummer = hasKontoUpdate ? String(payload.kontonummer ?? "").trim() : innstillinger.kontonummer
  const saldoInput = payload.saldo
  const saldoParsed =
    !hasSaldoUpdate
      ? null
      : typeof saldoInput === "number"
        ? (Number.isFinite(saldoInput) ? saldoInput : null)
        : saldoInput == null
          ? null
          : parseMoney(String(saldoInput))

  if (hasSaldoUpdate && saldoParsed === null) {
    return NextResponse.json({ ok: false, feil: "Skriv inn en gyldig saldo." }, { status: 400 })
  }

  if (!hasSaldoUpdate) {
    const before = { kontonummer: innstillinger.kontonummer || null, saldo_justering: innstillinger.saldo }
    const { error } = await admin
      .from("regnskap_innstillinger")
      .update({
        kontonummer: kontonummer || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", innstillingerId)

    if (error) {
      const msg = String((error as { message?: string } | null)?.message ?? "")
      if (isSchemaError(msg, "regnskap_innstillinger")) {
        return NextResponse.json({ ok: false, feil: innstillingerSchemaFeil }, { status: 500 })
      }
      return NextResponse.json({ ok: false, feil: "Kunne ikke oppdatere innstillinger." }, { status: 400 })
    }

    const logg = await loggHendelse(admin, {
      actor_epost: auth.email,
      actor_role: resolvedRole,
      action: "innstillinger:update",
      entity_type: "regnskap_innstillinger",
      entity_id: innstillingerId,
      before,
      after: { kontonummer: kontonummer || null, saldo_justering: innstillinger.saldo },
    })

    return NextResponse.json({
      ok: true,
      innstillinger: { kontonummer },
      loggFeil: !logg.ok && logg.schemaFeil ? loggSchemaFeil : undefined,
    })
  }

  const { data: poster, error: posterError } = await admin
    .from("regnskap_poster")
    .select("type, belop")
    .limit(5000)

  if (posterError) {
    return NextResponse.json({ ok: false, feil: "Kunne ikke beregne saldo fra regnskap." }, { status: 400 })
  }

  let inn = 0
  let ut = 0
  for (const p of (poster ?? []) as Record<string, unknown>[]) {
    const type = String((p as { type?: unknown } | null)?.type ?? "")
    const bel = toNumber((p as { belop?: unknown } | null)?.belop) ?? 0
    if (type === "inntekt") inn += bel
    if (type === "utgift") ut += bel
  }
  const resultat = inn - ut
  const saldoJustering = (saldoParsed as number) - resultat

  const { error } = await admin
    .from("regnskap_innstillinger")
    .update({
      kontonummer: kontonummer || null,
      saldo: saldoJustering,
      updated_at: new Date().toISOString(),
    })
    .eq("id", innstillingerId)

  if (error) {
    const msg = String((error as { message?: string } | null)?.message ?? "")
    if (isSchemaError(msg, "regnskap_innstillinger")) {
      return NextResponse.json({ ok: false, feil: innstillingerSchemaFeil }, { status: 500 })
    }
    return NextResponse.json({ ok: false, feil: "Kunne ikke oppdatere innstillinger." }, { status: 400 })
  }

  const logg = await loggHendelse(admin, {
    actor_epost: auth.email,
    actor_role: resolvedRole,
    action: "innstillinger:update",
    entity_type: "regnskap_innstillinger",
    entity_id: innstillingerId,
    before: { kontonummer: innstillinger.kontonummer || null, saldo_justering: innstillinger.saldo },
    after: {
      kontonummer: kontonummer || null,
      saldo: saldoParsed,
      saldo_justering: saldoJustering,
      resultat,
    },
  })

  return NextResponse.json({
    ok: true,
    innstillinger: { kontonummer, saldo: saldoParsed },
    loggFeil: !logg.ok && logg.schemaFeil ? loggSchemaFeil : undefined,
  })
}

export async function DELETE(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { ok: false, feil: "Supabase er ikke konfigurert. Legg inn miljøvariabler først." },
      { status: 500 }
    )
  }

  const auth = await getAuth()
  if (!auth) {
    return NextResponse.json({ ok: false, feil: "Ikke innlogget." }, { status: 401 })
  }

  if (!serviceRoleKey) {
    return NextResponse.json(
      { ok: false, feil: "Regnskap i admin krever SUPABASE_SERVICE_ROLE_KEY i miljøvariabler." },
      { status: 500 }
    )
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { data: roleRow } = await admin
    .from("medlemmer")
    .select("role")
    .eq("user_id", auth.userId)
    .maybeSingle()
  const ownerEmail = String(
    process.env.ADMIN_SUPERADMIN_EMAIL ?? process.env.ADMIN_BOOTSTRAP_EMAIL ?? ""
  )
    .trim()
    .toLowerCase()
  const isBootstrapSuper = ownerEmail && auth.email === ownerEmail
  if (roleRow?.role !== "superadmin" && !isBootstrapSuper) {
    return NextResponse.json(
      { ok: false, feil: "Kun superbruker kan slette regnskapsposter." },
      { status: 403 }
    )
  }

  let payload: { id?: string }
  try {
    payload = (await request.json()) as { id?: string }
  } catch {
    return NextResponse.json({ ok: false, feil: "Ugyldig JSON." }, { status: 400 })
  }

  const id = String(payload.id ?? "").trim()
  if (!id) {
    return NextResponse.json({ ok: false, feil: "Mangler id for regnskapspost." }, { status: 400 })
  }

  const { data: existingRow, error: existingError } = await admin
    .from("regnskap_poster")
    .select("bilag_path, type, belop, utlegg_medlem_id, utlegg_status, utlegg_medlem_navn, utlegg_medlem_epost")
    .eq("id", id)
    .maybeSingle()

  if (existingError) {
    return NextResponse.json({ ok: false, feil: "Kunne ikke hente regnskapspost." }, { status: 400 })
  }
  if (!existingRow) {
    return NextResponse.json({ ok: false, feil: "Regnskapspost finnes ikke." }, { status: 404 })
  }

  const isUtlegg =
    Boolean(
      String((existingRow as { utlegg_medlem_id?: unknown } | null)?.utlegg_medlem_id ?? "").trim() ||
        String((existingRow as { utlegg_status?: unknown } | null)?.utlegg_status ?? "").trim() ||
        String((existingRow as { utlegg_medlem_navn?: unknown } | null)?.utlegg_medlem_navn ?? "").trim() ||
        String((existingRow as { utlegg_medlem_epost?: unknown } | null)?.utlegg_medlem_epost ?? "").trim()
    )

  if (isUtlegg && roleRow?.role !== "superadmin" && !isBootstrapSuper) {
    return NextResponse.json(
      { ok: false, feil: "Kun superbruker kan slette utlegg." },
      { status: 403 }
    )
  }

  const bilagPath = typeof existingRow.bilag_path === "string" ? existingRow.bilag_path : null

  const { error: deleteError } = await admin.from("regnskap_poster").delete().eq("id", id)
  if (deleteError) {
    return NextResponse.json({ ok: false, feil: "Kunne ikke slette regnskapspost." }, { status: 400 })
  }

  const logg = await loggHendelse(admin, {
    actor_epost: auth.email,
    actor_role: "superadmin",
    action: "poster:delete",
    entity_type: "regnskap_poster",
    entity_id: id,
    before: existingRow,
    after: null,
  })

  if (bilagPath) {
    try {
      await admin.storage.from(bucket).remove([bilagPath])
    } catch {}
  }

  return NextResponse.json({ ok: true, loggFeil: !logg.ok && logg.schemaFeil ? loggSchemaFeil : undefined })
}
