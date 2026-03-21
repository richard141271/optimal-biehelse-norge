import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

type Payload = {
  type?: "innmeldt" | "stotte"
  navn?: string
  adresse?: string
  postnr?: string
  sted?: string
  epost?: string
  telefon?: string
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function isValidPostnr(postnr: string) {
  return /^\d{4}$/.test(postnr)
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      {
        ok: false,
        feil: "Supabase er ikke konfigurert. Legg inn miljøvariabler først.",
      },
      { status: 500 }
    )
  }

  let payload: Payload
  try {
    payload = (await request.json()) as Payload
  } catch {
    return NextResponse.json(
      { ok: false, feil: "Ugyldig forespørsel." },
      { status: 400 }
    )
  }

  const medlemskapType = payload.type ?? "innmeldt"
  const navn = (payload.navn ?? "").trim()
  const adresse = (payload.adresse ?? "").trim()
  const postnr = (payload.postnr ?? "").trim()
  const sted = (payload.sted ?? "").trim()
  const epost = (payload.epost ?? "").trim()
  const telefon = (payload.telefon ?? "").trim()

  if (medlemskapType === "innmeldt") {
    if (navn.length < 2 || navn.length > 80) {
      return NextResponse.json(
        { ok: false, feil: "Skriv inn et gyldig navn." },
        { status: 400 }
      )
    }

    if (adresse.length < 4 || adresse.length > 120) {
      return NextResponse.json(
        { ok: false, feil: "Skriv inn en gyldig adresse." },
        { status: 400 }
      )
    }

    if (!isValidPostnr(postnr)) {
      return NextResponse.json(
        { ok: false, feil: "Skriv inn et gyldig postnummer (4 siffer)." },
        { status: 400 }
      )
    }

    if (sted.length < 2 || sted.length > 60) {
      return NextResponse.json(
        { ok: false, feil: "Skriv inn et gyldig poststed." },
        { status: 400 }
      )
    }
  }

  if (!isValidEmail(epost)) {
    return NextResponse.json(
      { ok: false, feil: "Skriv inn en gyldig e-postadresse." },
      { status: 400 }
    )
  }

  if (medlemskapType === "innmeldt") {
    if (telefon.length < 6 || telefon.length > 20) {
      return NextResponse.json(
        { ok: false, feil: "Skriv inn et gyldig telefonnummer." },
        { status: 400 }
      )
    }
  } else if (telefon) {
    if (telefon.length < 6 || telefon.length > 20) {
      return NextResponse.json(
        { ok: false, feil: "Skriv inn et gyldig telefonnummer." },
        { status: 400 }
      )
    }
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey ?? supabaseAnonKey, {
    auth: { persistSession: false },
  })

  const schemaFeil =
    "Medlemsregister-tabellen i Supabase mangler felter for medlemsnummer. Kjør denne SQL-en i Supabase (SQL Editor), og prøv igjen:\n\n" +
    "alter table public.medlemmer add column if not exists medlemskap_type text;\n" +
    "alter table public.medlemmer add column if not exists medlemsnummer integer;\n" +
    "alter table public.medlemmer add column if not exists adresse text;\n" +
    "alter table public.medlemmer add column if not exists postnr text;\n" +
    "alter table public.medlemmer add column if not exists sted text;\n" +
    "create sequence if not exists public.medlemmer_medlemsnummer_seq start 1000;\n" +
    "alter table public.medlemmer alter column medlemsnummer set default nextval('public.medlemmer_medlemsnummer_seq');\n" +
    "select setval('public.medlemmer_medlemsnummer_seq', greatest((select coalesce(max(medlemsnummer), 999) from public.medlemmer), 999) + 1, false);\n" +
    "create unique index if not exists medlemmer_medlemsnummer_uq on public.medlemmer(medlemsnummer) where medlemsnummer is not null;"

  const insertRow: Record<string, unknown> = {
    medlemskap_type: medlemskapType,
    navn: navn || null,
    adresse: adresse || null,
    postnr: postnr || null,
    sted: sted || null,
    epost,
    telefon: telefon || null,
    medlemsnummer: medlemskapType === "stotte" ? null : undefined,
  }

  const { data, error } = await supabase
    .from("medlemmer")
    .insert(insertRow)
    .select("medlemsnummer")
    .maybeSingle()

  if (error) {
    const msg = String((error as { message?: string } | null)?.message ?? "")
    if (
      /medlemsnummer/i.test(msg) ||
      /medlemskap_type/i.test(msg) ||
      /column/i.test(msg)
    ) {
      return NextResponse.json({ ok: false, feil: schemaFeil }, { status: 500 })
    }
    return NextResponse.json(
      { ok: false, feil: "Kunne ikke registrere medlemskap akkurat nå." },
      { status: 400 }
    )
  }

  if (
    medlemskapType === "innmeldt" &&
    (data as { medlemsnummer?: number | null } | null)?.medlemsnummer == null
  ) {
    return NextResponse.json({ ok: false, feil: schemaFeil }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
