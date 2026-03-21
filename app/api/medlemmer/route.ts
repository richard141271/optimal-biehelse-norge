import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

type Payload = {
  type?: "innmeldt" | "stotte" | "bedrift"
  orgnr?: string
  navn?: string
  adresse?: string
  postnr?: string
  sted?: string
  epost?: string
  telefon?: string
  passord?: string
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function isValidPostnr(postnr: string) {
  return /^\d{4}$/.test(postnr)
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "")
}

function isValidNorskTelefon(telefon: string) {
  return /^\d{8}$/.test(telefon)
}

function isValidOrgnr(orgnr: string) {
  return /^\d{9}$/.test(orgnr)
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

  if (!serviceRoleKey) {
    return NextResponse.json(
      {
        ok: false,
        feil:
          "Medlemsregistrering med passord krever SUPABASE_SERVICE_ROLE_KEY i miljøvariabler.",
      },
      { status: 500 }
    )
  }

  const medlemskapType = payload.type ?? "innmeldt"
  const orgnr = digitsOnly((payload.orgnr ?? "").trim())
  const navn = (payload.navn ?? "").trim()
  const adresse = (payload.adresse ?? "").trim()
  const postnr = (payload.postnr ?? "").trim()
  const sted = (payload.sted ?? "").trim()
  const epost = (payload.epost ?? "").trim().toLowerCase()
  const telefon = digitsOnly((payload.telefon ?? "").trim())
  const passord = (payload.passord ?? "").trim()

  if (!passord || passord.length < 8 || passord.length > 200) {
    return NextResponse.json(
      { ok: false, feil: "Passord må være minst 8 tegn." },
      { status: 400 }
    )
  }

  if (medlemskapType !== "innmeldt" && medlemskapType !== "stotte" && medlemskapType !== "bedrift") {
    return NextResponse.json(
      { ok: false, feil: "Ugyldig medlemskapstype." },
      { status: 400 }
    )
  }

  if (navn.length < 2 || navn.length > (medlemskapType === "bedrift" ? 120 : 80)) {
    return NextResponse.json(
      { ok: false, feil: "Skriv inn et gyldig navn." },
      { status: 400 }
    )
  }

  if (medlemskapType === "bedrift") {
    if (!isValidOrgnr(orgnr)) {
      return NextResponse.json(
        { ok: false, feil: "Skriv inn et gyldig org.nr. (9 siffer)." },
        { status: 400 }
      )
    }
  }

  if (medlemskapType === "innmeldt" || medlemskapType === "bedrift") {
    if (adresse.length < 4 || adresse.length > 200) {
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
  } else {
    if (adresse) {
      if (adresse.length < 4 || adresse.length > 200) {
        return NextResponse.json(
          { ok: false, feil: "Skriv inn en gyldig adresse." },
          { status: 400 }
        )
      }
    }
    if (postnr) {
      if (!isValidPostnr(postnr)) {
        return NextResponse.json(
          { ok: false, feil: "Skriv inn et gyldig postnummer (4 siffer)." },
          { status: 400 }
        )
      }
    }
    if (sted) {
      if (sted.length < 2 || sted.length > 60) {
        return NextResponse.json(
          { ok: false, feil: "Skriv inn et gyldig poststed." },
          { status: 400 }
        )
      }
    }
  }

  if (!isValidEmail(epost)) {
    return NextResponse.json(
      { ok: false, feil: "Skriv inn en gyldig e-postadresse." },
      { status: 400 }
    )
  }

  if (medlemskapType !== "stotte") {
    if (!isValidNorskTelefon(telefon)) {
      return NextResponse.json(
        { ok: false, feil: "Telefon må være 8 siffer." },
        { status: 400 }
      )
    }
  } else if (telefon) {
    if (!isValidNorskTelefon(telefon)) {
      return NextResponse.json(
        { ok: false, feil: "Telefon må være 8 siffer." },
        { status: 400 }
      )
    }
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const schemaFeil =
    "Medlemsregister-tabellen i Supabase mangler felter for medlemsnummer. Kjør denne SQL-en i Supabase (SQL Editor), og prøv igjen:\n\n" +
    "alter table public.medlemmer add column if not exists user_id uuid;\n" +
    "alter table public.medlemmer add column if not exists medlemskap_type text;\n" +
    "alter table public.medlemmer add column if not exists medlemsnummer integer;\n" +
    "alter table public.medlemmer add column if not exists orgnr text;\n" +
    "alter table public.medlemmer add column if not exists adresse text;\n" +
    "alter table public.medlemmer add column if not exists postnr text;\n" +
    "alter table public.medlemmer add column if not exists sted text;\n" +
    "create sequence if not exists public.medlemmer_medlemsnummer_seq start 1000;\n" +
    "alter table public.medlemmer alter column medlemsnummer set default nextval('public.medlemmer_medlemsnummer_seq');\n" +
    "select setval('public.medlemmer_medlemsnummer_seq', greatest((select coalesce(max(medlemsnummer), 999) from public.medlemmer), 999) + 1, false);\n" +
    "create unique index if not exists medlemmer_user_id_uq on public.medlemmer(user_id) where user_id is not null;\n" +
    "create unique index if not exists medlemmer_medlemsnummer_uq on public.medlemmer(medlemsnummer) where medlemsnummer is not null;"

  const { data: created, error: createError } =
    await supabase.auth.admin.createUser({
      email: epost,
      password: passord,
      email_confirm: true,
    })

  if (createError) {
    const msg = String((createError as { message?: string } | null)?.message ?? "")
    if (/already/i.test(msg) || /registered/i.test(msg) || /exists/i.test(msg)) {
      return NextResponse.json(
        {
          ok: false,
          feil:
            "E-post er allerede registrert. Logg inn på Min side i stedet for å registrere på nytt.",
        },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { ok: false, feil: "Kunne ikke opprette brukerkonto akkurat nå." },
      { status: 400 }
    )
  }

  const userId = created.user?.id ?? null
  if (!userId) {
    return NextResponse.json(
      { ok: false, feil: "Kunne ikke opprette brukerkonto akkurat nå." },
      { status: 400 }
    )
  }

  const insertRow: Record<string, unknown> = {
    user_id: userId,
    medlemskap_type: medlemskapType,
    orgnr: orgnr || null,
    navn: navn || null,
    adresse: adresse || null,
    postnr: postnr || null,
    sted: sted || null,
    epost,
    telefon: telefon || null,
  }

  const { data, error } = await supabase
    .from("medlemmer")
    .insert(insertRow)
    .select("medlemsnummer")
    .maybeSingle()

  if (error) {
    const msg = String((error as { message?: string } | null)?.message ?? "")
    if (/orgnr/i.test(msg) && /column/i.test(msg)) {
      const { data: retryData, error: retryError } = await supabase
        .from("medlemmer")
        .insert({
          user_id: userId,
          medlemskap_type: medlemskapType,
          navn: navn || null,
          adresse: adresse || null,
          postnr: postnr || null,
          sted: sted || null,
          epost,
          telefon: telefon || null,
        })
        .select("medlemsnummer")
        .maybeSingle()

      if (!retryError && (retryData as { medlemsnummer?: number | null } | null)?.medlemsnummer != null) {
        return NextResponse.json({ ok: true })
      }
    }
    if (
      /medlemsnummer/i.test(msg) ||
      /medlemskap_type/i.test(msg) ||
      /user_id/i.test(msg) ||
      /orgnr/i.test(msg) ||
      /column/i.test(msg)
    ) {
      await supabase.auth.admin.deleteUser(userId)
      return NextResponse.json({ ok: false, feil: schemaFeil }, { status: 500 })
    }
    await supabase.auth.admin.deleteUser(userId)
    return NextResponse.json(
      { ok: false, feil: "Kunne ikke registrere medlemskap akkurat nå." },
      { status: 400 }
    )
  }

  if (
    (data as { medlemsnummer?: number | null } | null)?.medlemsnummer == null
  ) {
    await supabase.auth.admin.deleteUser(userId)
    return NextResponse.json({ ok: false, feil: schemaFeil }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
