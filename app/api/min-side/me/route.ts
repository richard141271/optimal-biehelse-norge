import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { createClient } from "@supabase/supabase-js"

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

  const userId = user?.id ?? null
  const email = String(user?.email ?? "").trim().toLowerCase()
  if (!userId || !email || !isValidEmail(email)) {
    return { ok: false as const, status: 401 as const, feil: "Ikke innlogget." }
  }

  return { ok: true as const, userId, email, supabaseUrl }
}

function selectMedlem() {
  return "id, created_at, user_id, medlemsnummer, medlemskap_type, navn, adresse, postnr, sted, epost, telefon, kontingent_betalt_at, kontingent_gyldig_til, aktiv, utbetaling_kontonummer"
}

function fallbackSelectMedlem() {
  return "id, created_at, medlemsnummer, medlemskap_type, navn, adresse, postnr, sted, epost, telefon, kontingent_betalt_at, kontingent_gyldig_til"
}

export async function GET() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const auth = await getAuth()
  if (!auth.ok) return NextResponse.json({ ok: false, feil: auth.feil }, { status: auth.status })
  const { userId, email, supabaseUrl } = auth

  if (!serviceRoleKey) {
    return NextResponse.json(
      { ok: false, feil: "Medlemsoppslag er ikke konfigurert." },
      { status: 500 }
    )
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const schemaFeil =
    "Medlemsregister-tabellen mangler felt for inn-/utmelding. Kjør dette i Supabase (SQL Editor):\n\n" +
    "alter table public.medlemmer add column if not exists aktiv boolean not null default true;\n" +
    "alter table public.medlemmer add column if not exists utmeldt_at timestamptz;"

  const { data: byUserId, error: byUserIdError } = await admin
    .from("medlemmer")
    .select(selectMedlem())
    .eq("user_id", userId)
    .maybeSingle()

  if (byUserIdError) {
    const msg = String((byUserIdError as { message?: string } | null)?.message ?? "")
    if (/column/i.test(msg) && /(user_id|aktiv|utbetaling_kontonummer)/i.test(msg)) {
      const fallback = await admin
        .from("medlemmer")
        .select(fallbackSelectMedlem())
        .eq("epost", email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (fallback.error) {
        if (/column/i.test(msg) && /aktiv/i.test(msg)) {
          return NextResponse.json({ ok: false, feil: schemaFeil }, { status: 500 })
        }
        return NextResponse.json({ ok: false, feil: "Kunne ikke hente medlemsdata." }, { status: 400 })
      }
      if (fallback.data) {
        return NextResponse.json({
          ok: true,
          medlem: {
            ...((fallback.data as unknown as Record<string, unknown>) ?? {}),
            user_id: userId,
            aktiv: true,
            utbetaling_kontonummer: null,
          },
        })
      }
    }
    return NextResponse.json({ ok: false, feil: "Kunne ikke hente medlemsdata." }, { status: 400 })
  }

  if (byUserId) {
    if ((byUserId as { aktiv?: boolean | null } | null)?.aktiv === false) {
      return NextResponse.json(
        {
          ok: false,
          feil: "Du er meldt ut. Kontakt oss hvis du ønsker å bli aktivert igjen.",
        },
        { status: 404 }
      )
    }
    return NextResponse.json({ ok: true, medlem: byUserId })
  }

  const ownerEmail = String(
    process.env.ADMIN_SUPERADMIN_EMAIL ?? process.env.ADMIN_BOOTSTRAP_EMAIL ?? ""
  )
    .trim()
    .toLowerCase()

  if (ownerEmail && email === ownerEmail) {
    const byEmail = await admin
      .from("medlemmer")
      .select(selectMedlem())
      .eq("epost", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!byEmail.error && byEmail.data) {
      const row = byEmail.data as { id?: string; user_id?: string | null }
      const rowId = String(row.id ?? "").trim()
      const rowUserId = String(row.user_id ?? "").trim()

      if (rowId && rowUserId !== userId) {
        await admin.from("medlemmer").update({ user_id: userId }).eq("id", rowId)

        const refreshed = await admin
          .from("medlemmer")
          .select(selectMedlem())
          .eq("user_id", userId)
          .maybeSingle()

        if (!refreshed.error && refreshed.data) {
          return NextResponse.json({ ok: true, medlem: refreshed.data })
        }
      }
    }
  }

  return NextResponse.json(
    {
      ok: false,
      feil:
        "Fant ikke medlemskap. Medlemskap må være koblet til innlogging (user_id).\n\n" +
        `Innloggings-ID: ${userId}\n` +
        `E-post: ${email}\n\n` +
        "Hvis du nylig har blitt lagt inn manuelt, må en superbruker koble medlemskapet til innloggingen i medlemsregisteret.",
    },
    { status: 404 }
  )
}

export async function PATCH(request: Request) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const auth = await getAuth()
  if (!auth.ok) return NextResponse.json({ ok: false, feil: auth.feil }, { status: auth.status })
  const { userId, supabaseUrl } = auth

  if (!serviceRoleKey) {
    return NextResponse.json(
      { ok: false, feil: "Medlemsoppslag er ikke konfigurert." },
      { status: 500 }
    )
  }

  let payload: {
    navn?: string
    telefon?: string | null
    adresse?: string | null
    postnr?: string | null
    sted?: string | null
    utbetalingKontonummer?: string | null
  }
  try {
    payload = (await request.json()) as {
      navn?: string
      telefon?: string | null
      adresse?: string | null
      postnr?: string | null
      sted?: string | null
      utbetalingKontonummer?: string | null
    }
  } catch {
    return NextResponse.json({ ok: false, feil: "Ugyldig JSON." }, { status: 400 })
  }

  const navn = payload.navn != null ? String(payload.navn).trim() : ""
  if (!navn) {
    return NextResponse.json({ ok: false, feil: "Navn kan ikke være tomt." }, { status: 400 })
  }
  if (navn.length > 120) {
    return NextResponse.json({ ok: false, feil: "Navn er for langt." }, { status: 400 })
  }

  const normalize = (v: unknown) => {
    if (v === null || v === undefined) return null
    const s = String(v).trim()
    return s ? s : null
  }

  const normalizeKontonummer = (v: unknown) => {
    if (v === null || v === undefined) return null
    const digits = String(v).replace(/\D+/g, "")
    if (!digits) return null
    if (digits.length !== 11) return "__invalid__"
    return digits
  }

  const konto = normalizeKontonummer(payload.utbetalingKontonummer)
  if (konto === "__invalid__") {
    return NextResponse.json(
      { ok: false, feil: "Kontonummer må være 11 siffer (kun tall)." },
      { status: 400 }
    )
  }

  const update = {
    navn,
    telefon: normalize(payload.telefon),
    adresse: normalize(payload.adresse),
    postnr: normalize(payload.postnr),
    sted: normalize(payload.sted),
    utbetaling_kontonummer: konto,
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { data, error } = await admin
    .from("medlemmer")
    .update(update)
    .eq("user_id", userId)
    .eq("aktiv", true)
    .select(selectMedlem())
    .maybeSingle()

  if (error) {
    const msg = String((error as { message?: string } | null)?.message ?? "")
    if (/column/i.test(msg) && /aktiv/i.test(msg)) {
      return NextResponse.json(
        {
          ok: false,
          feil:
            "Medlemsregister-tabellen mangler feltet aktiv. Kjør dette i Supabase (SQL Editor):\n\n" +
            "alter table public.medlemmer add column if not exists aktiv boolean not null default true;",
        },
        { status: 500 }
      )
    }
    if (/column/i.test(msg) && /utbetaling_kontonummer/i.test(msg)) {
      return NextResponse.json(
        {
          ok: false,
          feil:
            "Medlemsregister-tabellen mangler feltet utbetaling_kontonummer. Kjør dette i Supabase (SQL Editor):\n\n" +
            "alter table public.medlemmer add column if not exists utbetaling_kontonummer text;",
        },
        { status: 500 }
      )
    }
    return NextResponse.json(
      { ok: false, feil: "Kunne ikke lagre opplysninger." },
      { status: 400 }
    )
  }
  if (!data) {
    return NextResponse.json(
      { ok: false, feil: "Fant ikke medlemsrad å oppdatere." },
      { status: 404 }
    )
  }

  return NextResponse.json({ ok: true, medlem: data })
}
