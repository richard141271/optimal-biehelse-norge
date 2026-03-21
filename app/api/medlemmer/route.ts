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

  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  let medlemsnummer: number | null = null
  if (medlemskapType === "innmeldt") {
    const { data: siste, error: maxError } = await supabase
      .from("medlemmer")
      .select("medlemsnummer")
      .order("medlemsnummer", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (maxError) {
      return NextResponse.json(
        {
          ok: false,
          feil:
            "Medlemsnummer kan ikke genereres før tabellen er oppdatert i Supabase.",
        },
        { status: 500 }
      )
    }

    const max =
      (siste as { medlemsnummer?: number | null } | null)?.medlemsnummer ?? null
    medlemsnummer = max ? max + 1 : 1000
  }

  const { error } = await supabase.from("medlemmer").insert({
    medlemskap_type: medlemskapType,
    medlemsnummer,
    navn: navn || null,
    adresse: adresse || null,
    postnr: postnr || null,
    sted: sted || null,
    epost,
    telefon: telefon || null,
  })

  if (error) {
    return NextResponse.json(
      { ok: false, feil: "Kunne ikke registrere medlemskap akkurat nå." },
      { status: 400 }
    )
  }

  return NextResponse.json({ ok: true })
}
