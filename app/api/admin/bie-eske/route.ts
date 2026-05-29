import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

const bucket = "bie-eske"

const schemaFeil =
  "Bie-eske-modulen mangler tabeller i Supabase. Kjør denne SQL-en i Supabase (SQL Editor), og prøv igjen:\n\n" +
  "create extension if not exists \"pgcrypto\";\n" +
  "create table if not exists public.lek_bie_esker (\n" +
  "  id uuid primary key default gen_random_uuid(),\n" +
  "  created_at timestamptz not null default now(),\n" +
  "  box_code text not null,\n" +
  "  internal_id text,\n" +
  "  place_type text,\n" +
  "  place_name text,\n" +
  "  capacity integer not null default 15,\n" +
  "  active boolean not null default true,\n" +
  "  installed_at timestamptz,\n" +
  "  installed_status text,\n" +
  "  installed_lat numeric,\n" +
  "  installed_lng numeric,\n" +
  "  installed_by_epost text\n" +
  ");\n" +
  "create unique index if not exists lek_bie_esker_box_code_uq on public.lek_bie_esker (box_code);\n" +
  "create table if not exists public.lek_bie_eske_hendelser (\n" +
  "  id uuid primary key default gen_random_uuid(),\n" +
  "  created_at timestamptz not null default now(),\n" +
  "  box_code text not null references public.lek_bie_esker(box_code) on delete cascade,\n" +
  "  kind text not null,\n" +
  "  status text not null,\n" +
  "  glasses_left integer,\n" +
  "  place_type text,\n" +
  "  place_name text,\n" +
  "  comment text,\n" +
  "  filled_now boolean not null default false,\n" +
  "  filled_added integer,\n" +
  "  lat numeric,\n" +
  "  lng numeric,\n" +
  "  image1_path text,\n" +
  "  image2_path text,\n" +
  "  image3_path text,\n" +
  "  actor_epost text,\n" +
  "  actor_role text\n" +
  ");\n" +
  "create index if not exists lek_bie_eske_hendelser_created_at_idx on public.lek_bie_eske_hendelser (created_at desc);\n" +
  "create index if not exists lek_bie_eske_hendelser_box_created_at_idx on public.lek_bie_eske_hendelser (box_code, created_at desc);\n"

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function isSchemaError(msg: string) {
  const m = msg.toLowerCase()
  if (m.includes("42p01")) return true
  if (m.includes("schema cache") && (m.includes("lek_bie_esker") || m.includes("lek_bie_eske_hendelser"))) return true
  if (m.includes("relation") && m.includes("does not exist")) return true
  if (m.includes("could not find the table")) return true
  if (m.includes("not found")) return true
  if (m.includes("does not exist")) return true
  if (m.includes("column") && (m.includes("lek_bie_esker") || m.includes("lek_bie_eske_hendelser"))) return true
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

async function requireBieEskeAccess() {
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

  const role = String((data as { role?: unknown } | null)?.role ?? "").trim().toLowerCase()
  if (role !== "admin" && role !== "superadmin" && role !== "frivillig") {
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

  return {
    ok: true as const,
    admin,
    role: role as "admin" | "superadmin" | "frivillig",
    email: auth.email,
  }
}

export async function GET() {
  const gate = await requireBieEskeAccess()
  if (!gate.ok) return NextResponse.json({ ok: false, feil: gate.feil }, { status: gate.status })

  const { data: boxes, error: boxError } = await gate.admin
    .from("lek_bie_esker")
    .select("box_code, internal_id, place_type, place_name, capacity, active, installed_at, installed_status")
    .order("created_at", { ascending: false })
    .limit(500)

  if (boxError) {
    const msg = String((boxError as { message?: string } | null)?.message ?? "")
    return NextResponse.json({ ok: false, feil: isSchemaError(msg) ? schemaFeil : "Kunne ikke hente bokser." }, { status: isSchemaError(msg) ? 500 : 400 })
  }

  const { data: events, error: eventError } = await gate.admin
    .from("lek_bie_eske_hendelser")
    .select(
      "id, created_at, box_code, kind, status, glasses_left, place_type, place_name, filled_now, filled_added, lat, lng, image1_path, image2_path, image3_path, actor_epost"
    )
    .order("created_at", { ascending: false })
    .limit(200)

  if (eventError) {
    const msg = String((eventError as { message?: string } | null)?.message ?? "")
    return NextResponse.json({ ok: false, feil: isSchemaError(msg) ? schemaFeil : "Kunne ikke hente historikk." }, { status: isSchemaError(msg) ? 500 : 400 })
  }

  const latestByBox = new Map<string, Record<string, unknown>>()
  for (const e of (events ?? []) as Record<string, unknown>[]) {
    const boxCode = String(e.box_code ?? "").trim()
    if (!boxCode) continue
    if (!latestByBox.has(boxCode)) latestByBox.set(boxCode, e)
  }

  const needsFill: Record<string, unknown>[] = []
  for (const [boxCode, e] of latestByBox.entries()) {
    const status = String(e.status ?? "").trim().toLowerCase()
    const left = toInt(e.glasses_left) ?? null
    const marked =
      status === "må fylles" ||
      status === "ma_fylles" ||
      status === "tom" ||
      status === "nesten tom" ||
      status === "nesten_tom" ||
      status === "skadet" ||
      status === "qr fungerer ikke" ||
      status === "qr_fungerer_ikke" ||
      (left != null && left <= 2)
    if (marked) needsFill.push({ box_code: boxCode, latest: e })
  }

  needsFill.sort((a, b) => {
    const ad = String((a.latest as Record<string, unknown>).created_at ?? "")
    const bd = String((b.latest as Record<string, unknown>).created_at ?? "")
    return bd.localeCompare(ad)
  })

  return NextResponse.json({
    ok: true,
    role: gate.role,
    boxes: boxes ?? [],
    recent: events ?? [],
    needsFill,
    totals: {
      totalBoxes: Array.isArray(boxes) ? boxes.length : 0,
      activeBoxes: (boxes ?? []).filter((b) => (b as { active?: unknown }).active !== false).length,
      needsFill: needsFill.length,
    },
  })
}

export async function POST(request: Request) {
  const gate = await requireBieEskeAccess()
  if (!gate.ok) return NextResponse.json({ ok: false, feil: gate.feil }, { status: gate.status })

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json(
      { ok: false, feil: "Ugyldig forespørsel (kunne ikke lese skjema/bilder)." },
      { status: 400 }
    )
  }

  const kind = String(form.get("kind") ?? "").trim().toLowerCase()
  const boxCode = String(form.get("boxCode") ?? "").trim()
  const internalId = String(form.get("internalId") ?? "").trim()
  const status = String(form.get("status") ?? "").trim()
  const placeType = String(form.get("placeType") ?? "").trim()
  const placeName = String(form.get("placeName") ?? "").trim()
  const comment = String(form.get("comment") ?? "").trim()
  const filledNow = String(form.get("filledNow") ?? "").trim() === "true"

  const glassesLeft = toInt(form.get("glassesLeft"))
  const filledAdded = toInt(form.get("filledAdded"))
  const capacityInput = toInt(form.get("capacity"))
  const lat = toNumber(form.get("lat"))
  const lng = toNumber(form.get("lng"))

  if (kind !== "runde" && kind !== "utsetting") {
    return NextResponse.json({ ok: false, feil: "Ugyldig type." }, { status: 400 })
  }
  if (!boxCode) {
    return NextResponse.json({ ok: false, feil: "Mangler boksnummer." }, { status: 400 })
  }
  if (!status) {
    return NextResponse.json({ ok: false, feil: "Velg status." }, { status: 400 })
  }
  if (!placeType) {
    return NextResponse.json({ ok: false, feil: "Velg type sted." }, { status: 400 })
  }

  const capacity = capacityInput != null && capacityInput >= 1 && capacityInput <= 50 ? capacityInput : 15
  const safeGlassesLeft =
    glassesLeft != null && glassesLeft >= 0 && glassesLeft <= capacity ? glassesLeft : null
  const safeFilledAdded =
    filledNow && filledAdded != null && filledAdded >= 0 && filledAdded <= 200 ? filledAdded : null

  const rawFiles = form.getAll("images")
  const files = rawFiles.filter((f) => f instanceof File && f.size > 0) as File[]
  const images = files.slice(0, 3)

  for (const f of images) {
    if (String(f.type || "").startsWith("video/")) {
      return NextResponse.json({ ok: false, feil: "Bilde må være et bilde (ikke video)." }, { status: 400 })
    }
    if (f.size > 4 * 1024 * 1024) {
      return NextResponse.json({ ok: false, feil: "Bilde er for stort (maks 4 MB)." }, { status: 400 })
    }
  }

  const { error: createBucketError } = await gate.admin.storage.createBucket(bucket, { public: false })
  if (createBucketError) {
    const msg = String((createBucketError as { message?: string } | null)?.message ?? "")
    if (!/exists/i.test(msg) && !/already/i.test(msg)) {
      return NextResponse.json(
        {
          ok: false,
          feil: "Lagring av bilder er ikke satt opp i Supabase Storage. Lag en bucket som heter 'bie-eske' (private), og prøv igjen.",
        },
        { status: 500 }
      )
    }
  }

  const eventId = crypto.randomUUID()
  const uploaded: string[] = []
  const paths: Array<string | null> = [null, null, null]

  for (let i = 0; i < images.length; i++) {
    const f = images[i]
    const ext = (f.type || "").toLowerCase().includes("png")
      ? "png"
      : (f.type || "").toLowerCase().includes("webp")
        ? "webp"
        : "jpg"
    const path = `${boxCode}/${kind}/${eventId}-${i + 1}.${ext}`
    const body = await f.arrayBuffer()
    const { error: uploadError } = await gate.admin.storage
      .from(bucket)
      .upload(path, body, { upsert: false, contentType: f.type || undefined })
    if (uploadError) {
      if (uploaded.length) {
        await gate.admin.storage.from(bucket).remove(uploaded)
      }
      return NextResponse.json({ ok: false, feil: "Kunne ikke laste opp bilde." }, { status: 400 })
    }
    uploaded.push(path)
    paths[i] = path
  }

  const nowIso = new Date().toISOString()

  const upsertBox: Record<string, unknown> = {
    box_code: boxCode,
    internal_id: internalId || null,
    place_type: placeType,
    place_name: placeName || null,
    capacity,
    active: true,
  }

  if (kind === "utsetting") {
    upsertBox.installed_at = nowIso
    upsertBox.installed_status = status
    upsertBox.installed_lat = lat
    upsertBox.installed_lng = lng
    upsertBox.installed_by_epost = gate.email
  }

  const { error: upsertError } = await gate.admin
    .from("lek_bie_esker")
    .upsert(upsertBox, { onConflict: "box_code" })

  if (upsertError) {
    const msg = String((upsertError as { message?: string } | null)?.message ?? "")
    if (uploaded.length) {
      await gate.admin.storage.from(bucket).remove(uploaded)
    }
    return NextResponse.json({ ok: false, feil: isSchemaError(msg) ? schemaFeil : "Kunne ikke lagre boks." }, { status: isSchemaError(msg) ? 500 : 400 })
  }

  const insertEvent: Record<string, unknown> = {
    id: eventId,
    created_at: nowIso,
    box_code: boxCode,
    kind,
    status,
    glasses_left: safeGlassesLeft,
    place_type: placeType,
    place_name: placeName || null,
    comment: comment || null,
    filled_now: filledNow,
    filled_added: safeFilledAdded,
    lat,
    lng,
    image1_path: paths[0],
    image2_path: paths[1],
    image3_path: paths[2],
    actor_epost: gate.email,
    actor_role: gate.role,
  }

  const { error: insertError } = await gate.admin.from("lek_bie_eske_hendelser").insert(insertEvent)

  if (insertError) {
    const msg = String((insertError as { message?: string } | null)?.message ?? "")
    if (uploaded.length) {
      await gate.admin.storage.from(bucket).remove(uploaded)
    }
    return NextResponse.json({ ok: false, feil: isSchemaError(msg) ? schemaFeil : "Kunne ikke lagre registrering." }, { status: isSchemaError(msg) ? 500 : 400 })
  }

  return NextResponse.json({ ok: true })
}
