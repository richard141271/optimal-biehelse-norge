import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { createClient } from "@supabase/supabase-js"

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

async function getCurrentUser() {
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
  if (!userId || !email || !isValidEmail(email)) return null
  return { email, userId }
}

async function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return null
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })
}

async function requireAdmin() {
  const user = await getCurrentUser()
  if (!user) return { ok: false as const, status: 401 as const }

  const admin = await getAdminClient()
  if (!admin) return { ok: false as const, status: 500 as const }

  const { data, error } = await admin
    .from("medlemmer")
    .select("role, aktiv")
    .eq("epost", user.email)
    .maybeSingle()

  if (error) {
    const msg = String((error as { message?: string } | null)?.message ?? "")
    if (/column/i.test(msg) && (/aktiv/i.test(msg) || /utmeldt_at/i.test(msg))) {
      return {
        ok: false as const,
        status: 500 as const,
        feil:
          "Medlemsregister-tabellen mangler felt for inn-/utmelding. Kjør dette i Supabase (SQL Editor):\n\n" +
          "alter table public.medlemmer add column if not exists aktiv boolean not null default true;\n" +
          "alter table public.medlemmer add column if not exists utmeldt_at timestamptz;",
      }
    }
    if (/column/i.test(msg) && /role/i.test(msg)) {
      return {
        ok: false as const,
        status: 500 as const,
        feil:
          "Medlemsregister-tabellen mangler feltet role. Kjør dette i Supabase (SQL Editor):\n\n" +
          "alter table public.medlemmer add column if not exists role text not null default 'user';",
      }
    }
    return { ok: false as const, status: 400 as const }
  }
  if (data?.aktiv === false) {
    return { ok: false as const, status: 403 as const }
  }
  if (data?.role !== "admin" && data?.role !== "superadmin") {
    return { ok: false as const, status: 403 as const }
  }

  return {
    ok: true as const,
    admin,
    email: user.email,
    userId: user.userId,
    role: data.role as "admin" | "superadmin",
  }
}

export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, feil: "feil" in gate ? gate.feil : undefined },
      { status: gate.status }
    )
  }

  const { data, error, count } = await gate.admin
    .from("medlemmer")
    .select(
      "id, created_at, user_id, medlemsnummer, medlemskap_type, navn, adresse, postnr, sted, epost, telefon, kontingent_betalt_at, kontingent_gyldig_til, role, aktiv, utmeldt_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .limit(1000)

  if (error) {
    const msg = String((error as { message?: string } | null)?.message ?? "")
    if (/column/i.test(msg) && (/aktiv/i.test(msg) || /utmeldt_at/i.test(msg))) {
      return NextResponse.json(
        {
          ok: false,
          feil:
            "Medlemsregister-tabellen mangler felt for inn-/utmelding. Kjør dette i Supabase (SQL Editor):\n\n" +
            "alter table public.medlemmer add column if not exists aktiv boolean not null default true;\n" +
            "alter table public.medlemmer add column if not exists utmeldt_at timestamptz;",
        },
        { status: 500 }
      )
    }
    return NextResponse.json(
      { ok: false, feil: "Kunne ikke hente medlemsregister." },
      { status: 400 }
    )
  }

  let safeCount: number | null = typeof count === "number" ? count : null
  if (safeCount == null) {
    const { count: fallbackCount } = await gate.admin
      .from("medlemmer")
      .select("id", { count: "exact", head: true })
    safeCount = typeof fallbackCount === "number" ? fallbackCount : (data ?? []).length
  }

  return NextResponse.json({
    ok: true,
    medlemmer: data ?? [],
    count: safeCount,
    minRolle: gate.role,
  })
}

export async function PATCH(request: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, feil: "feil" in gate ? gate.feil : undefined },
      { status: gate.status }
    )
  }

  let payload: { medlemId?: string; role?: string; aktiv?: boolean }
  try {
    payload = (await request.json()) as { medlemId?: string; role?: string; aktiv?: boolean }
  } catch {
    return NextResponse.json({ ok: false, feil: "Ugyldig JSON." }, { status: 400 })
  }

  const medlemId = String(payload.medlemId ?? "").trim()
  const role = String(payload.role ?? "").trim()
  const aktiv = typeof payload.aktiv === "boolean" ? payload.aktiv : undefined

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      medlemId
    )
  const isNumericId = /^\d+$/.test(medlemId)
  if (!medlemId || (!isUuid && !isNumericId)) {
    return NextResponse.json(
      { ok: false, feil: "Ugyldig medlem-id." },
      { status: 400 }
    )
  }

  const hasRoleUpdate = role === "user" || role === "admin"
  const hasAktivUpdate = typeof aktiv === "boolean"
  if (!hasRoleUpdate && !hasAktivUpdate) {
    return NextResponse.json(
      { ok: false, feil: "Ugyldig forespørsel." },
      { status: 400 }
    )
  }

  if (hasRoleUpdate && gate.role !== "superadmin") {
    return NextResponse.json(
      { ok: false, feil: "Kun superbruker kan endre rolle." },
      { status: 403 }
    )
  }

  const medlemIdValue = isNumericId ? Number(medlemId) : medlemId

  const { data: target, error: targetError } = await gate.admin
    .from("medlemmer")
    .select("id, role, epost, aktiv")
    .eq("id", medlemIdValue)
    .maybeSingle()

  if (targetError) {
    return NextResponse.json(
      { ok: false, feil: "Kunne ikke hente medlem." },
      { status: 400 }
    )
  }

  if (!target) {
    return NextResponse.json(
      { ok: false, feil: "Fant ikke medlem." },
      { status: 404 }
    )
  }

  if (target.role === "superadmin") {
    return NextResponse.json(
      { ok: false, feil: "Superbruker kan ikke endres her." },
      { status: 400 }
    )
  }

  const update: Record<string, unknown> = {}
  if (hasRoleUpdate) update.role = role
  if (hasAktivUpdate) {
    if (aktiv) {
      update.aktiv = true
      update.utmeldt_at = null
    } else {
      update.aktiv = false
      update.utmeldt_at = new Date().toISOString()
      update.role = "user"
      update.kontingent_betalt_at = null
      update.kontingent_gyldig_til = null
    }
  }

  const { error: updateError } = await gate.admin
    .from("medlemmer")
    .update(update)
    .eq("id", medlemIdValue)

  if (updateError) {
    const msg = String((updateError as { message?: string } | null)?.message ?? "")
    if (/column/i.test(msg) && /role/i.test(msg)) {
      return NextResponse.json(
        {
          ok: false,
          feil:
            "Feltet role mangler i medlemsregisteret. Legg til kolonnen i Supabase: alter table public.medlemmer add column if not exists role text not null default 'user';",
        },
        { status: 500 }
      )
    }
    if (/column/i.test(msg) && (/aktiv/i.test(msg) || /utmeldt_at/i.test(msg))) {
      return NextResponse.json(
        {
          ok: false,
          feil:
            "Medlemsregister-tabellen mangler felt for inn-/utmelding. Kjør dette i Supabase (SQL Editor):\n\n" +
            "alter table public.medlemmer add column if not exists aktiv boolean not null default true;\n" +
            "alter table public.medlemmer add column if not exists utmeldt_at timestamptz;",
        },
        { status: 500 }
      )
    }
    return NextResponse.json(
      { ok: false, feil: "Kunne ikke oppdatere rolle." },
      { status: 400 }
    )
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, feil: "feil" in gate ? gate.feil : undefined },
      { status: gate.status }
    )
  }

  if (gate.role !== "admin" && gate.role !== "superadmin") {
    return NextResponse.json({ ok: false, feil: "Kun admin kan melde ut medlemmer." }, { status: 403 })
  }

  let payload: { medlemId?: string } | null = null
  try {
    payload = (await request.json()) as { medlemId?: string }
  } catch {
    payload = null
  }

  const medlemId = String(payload?.medlemId ?? "").trim()
  if (medlemId) {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        medlemId
      )
    const isNumericId = /^\d+$/.test(medlemId)
    if (!isUuid && !isNumericId) {
      return NextResponse.json(
        { ok: false, feil: "Ugyldig medlem-id." },
        { status: 400 }
      )
    }

    const medlemIdValue = isNumericId ? Number(medlemId) : medlemId

    const { data: target, error: targetError } = await gate.admin
      .from("medlemmer")
      .select("id, role, epost")
      .eq("id", medlemIdValue)
      .maybeSingle()

    if (targetError) {
      return NextResponse.json(
        { ok: false, feil: "Kunne ikke hente medlem." },
        { status: 400 }
      )
    }

    if (!target?.id) {
      return NextResponse.json(
        { ok: false, feil: "Fant ikke medlem." },
        { status: 404 }
      )
    }

    if (target.role === "superadmin") {
      return NextResponse.json(
        { ok: false, feil: "Superbruker kan ikke meldes ut." },
        { status: 400 }
      )
    }

    const { error: updateError } = await gate.admin
      .from("medlemmer")
      .update({
        aktiv: false,
        utmeldt_at: new Date().toISOString(),
        role: "user",
        kontingent_betalt_at: null,
        kontingent_gyldig_til: null,
      })
      .eq("id", medlemIdValue)

    if (updateError) {
      const msg = String((updateError as { message?: string } | null)?.message ?? "")
      if (/column/i.test(msg) && (/aktiv/i.test(msg) || /utmeldt_at/i.test(msg))) {
        return NextResponse.json(
          {
            ok: false,
            feil:
              "Medlemsregister-tabellen mangler felt for inn-/utmelding. Kjør dette i Supabase (SQL Editor):\n\n" +
              "alter table public.medlemmer add column if not exists aktiv boolean not null default true;\n" +
              "alter table public.medlemmer add column if not exists utmeldt_at timestamptz;",
          },
          { status: 500 }
        )
      }
      return NextResponse.json(
        { ok: false, feil: "Kunne ikke melde ut medlem." },
        { status: 400 }
      )
    }

    return NextResponse.json({ ok: true })
  }

  const { error: updateError } = await gate.admin
    .from("medlemmer")
    .update({
      aktiv: false,
      utmeldt_at: new Date().toISOString(),
      role: "user",
      kontingent_betalt_at: null,
      kontingent_gyldig_til: null,
    })
    .neq("role", "superadmin")

  if (updateError) {
    const msg = String((updateError as { message?: string } | null)?.message ?? "")
    if (/column/i.test(msg) && (/aktiv/i.test(msg) || /utmeldt_at/i.test(msg))) {
      return NextResponse.json(
        {
          ok: false,
          feil:
            "Medlemsregister-tabellen mangler felt for inn-/utmelding. Kjør dette i Supabase (SQL Editor):\n\n" +
            "alter table public.medlemmer add column if not exists aktiv boolean not null default true;\n" +
            "alter table public.medlemmer add column if not exists utmeldt_at timestamptz;",
        },
        { status: 500 }
      )
    }
    return NextResponse.json(
      { ok: false, feil: "Kunne ikke melde ut medlemmer." },
      { status: 400 }
    )
  }

  return NextResponse.json({ ok: true })
}

export async function PUT(request: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, feil: "feil" in gate ? gate.feil : undefined },
      { status: gate.status }
    )
  }

  let payload: {
    medlemId?: string
    navn?: string | null
    adresse?: string | null
    postnr?: string | null
    sted?: string | null
    epost?: string | null
    telefon?: string | null
    medlemsnummer?: number | string | null
    medlemskap_type?: string | null
    authEmail?: string | null
    authPassword?: string | null
  }
  try {
    payload = (await request.json()) as {
      medlemId?: string
      navn?: string | null
      adresse?: string | null
      postnr?: string | null
      sted?: string | null
      epost?: string | null
      telefon?: string | null
      medlemsnummer?: number | string | null
      medlemskap_type?: string | null
      authEmail?: string | null
      authPassword?: string | null
    }
  } catch {
    return NextResponse.json({ ok: false, feil: "Ugyldig JSON." }, { status: 400 })
  }

  const medlemId = String(payload.medlemId ?? "").trim()
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      medlemId
    )
  const isNumericId = /^\d+$/.test(medlemId)
  if (!medlemId || (!isUuid && !isNumericId)) {
    return NextResponse.json({ ok: false, feil: "Ugyldig medlem-id." }, { status: 400 })
  }
  const medlemIdValue = isNumericId ? Number(medlemId) : medlemId

  const { data: target, error: targetError } = await gate.admin
    .from("medlemmer")
    .select("id, role, user_id")
    .eq("id", medlemIdValue)
    .maybeSingle()

  if (targetError) {
    return NextResponse.json({ ok: false, feil: "Kunne ikke hente medlem." }, { status: 400 })
  }
  if (!target?.id) {
    return NextResponse.json({ ok: false, feil: "Fant ikke medlem." }, { status: 404 })
  }
  if (target.role === "superadmin") {
    return NextResponse.json({ ok: false, feil: "Superbruker kan ikke endres her." }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if ("navn" in payload) update.navn = payload.navn ? String(payload.navn).trim() : null
  if ("adresse" in payload) update.adresse = payload.adresse ? String(payload.adresse).trim() : null
  if ("postnr" in payload) update.postnr = payload.postnr ? String(payload.postnr).trim() : null
  if ("sted" in payload) update.sted = payload.sted ? String(payload.sted).trim() : null
  if ("epost" in payload) {
    const e = payload.epost ? String(payload.epost).trim().toLowerCase() : null
    if (e && !isValidEmail(e)) {
      return NextResponse.json({ ok: false, feil: "Ugyldig e-postadresse." }, { status: 400 })
    }
    update.epost = e
  }
  if ("telefon" in payload) update.telefon = payload.telefon ? String(payload.telefon).trim() : null
  if ("medlemskap_type" in payload) update.medlemskap_type = payload.medlemskap_type ? String(payload.medlemskap_type).trim() : null
  if ("medlemsnummer" in payload) {
    const raw = payload.medlemsnummer
    const n = raw == null || raw === "" ? null : Number(String(raw).trim())
    if (n != null && (!Number.isFinite(n) || n <= 0 || Math.floor(n) !== n)) {
      return NextResponse.json({ ok: false, feil: "Ugyldig medlemsnummer." }, { status: 400 })
    }
    update.medlemsnummer = n
  }

  const authEmail =
    payload.authEmail == null ? null : String(payload.authEmail).trim().toLowerCase()
  const authPassword = payload.authPassword == null ? null : String(payload.authPassword)

  const wantsAuthUpdate = authEmail != null || authPassword != null
  if (wantsAuthUpdate && gate.role !== "superadmin") {
    return NextResponse.json({ ok: false, feil: "Kun superbruker kan endre innlogging." }, { status: 403 })
  }

  if (wantsAuthUpdate) {
    const userId = String(target.user_id ?? "").trim()
    if (!userId) {
      return NextResponse.json(
        { ok: false, feil: "Medlemmet er ikke koblet til en innloggingsbruker (user_id mangler)." },
        { status: 400 }
      )
    }

    const authUpdate: Record<string, unknown> = {}
    if (authEmail != null) {
      if (authEmail && !isValidEmail(authEmail)) {
        return NextResponse.json({ ok: false, feil: "Ugyldig e-postadresse." }, { status: 400 })
      }
      authUpdate.email = authEmail
    }
    if (authPassword != null) {
      const pw = authPassword.trim()
      if (pw.length < 8) {
        return NextResponse.json({ ok: false, feil: "Passord må være minst 8 tegn." }, { status: 400 })
      }
      authUpdate.password = pw
    }

    if (Object.keys(authUpdate).length > 0) {
      const { error: authError } = await gate.admin.auth.admin.updateUserById(userId, authUpdate)
      if (authError) {
        return NextResponse.json(
          { ok: false, feil: "Kunne ikke oppdatere innlogging." },
          { status: 400 }
        )
      }
    }

    if (authEmail != null) {
      update.epost = authEmail || null
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, feil: "Ingen endringer." }, { status: 400 })
  }

  const { error: updateError } = await gate.admin
    .from("medlemmer")
    .update(update)
    .eq("id", medlemIdValue)

  if (updateError) {
    return NextResponse.json({ ok: false, feil: "Kunne ikke oppdatere medlem." }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
