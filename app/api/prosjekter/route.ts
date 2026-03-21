import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

type Payload = {
  medlemsnummer?: string
  navn?: string
  epost?: string
  telefon?: string
  tittel?: string
  sted?: string
  budsjett?: string
  beskrivelse?: string
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function parseMoney(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const normalized = trimmed.replace(/\s/g, "").replace(/\./g, "").replace(",", ".")
  const n = Number(normalized)
  if (!Number.isFinite(n) || n < 0) return null
  return n
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

  const navn = (payload.navn ?? "").trim()
  const epost = (payload.epost ?? "").trim()
  const telefon = (payload.telefon ?? "").trim()
  const tittel = (payload.tittel ?? "").trim()
  const sted = (payload.sted ?? "").trim()
  const beskrivelse = (payload.beskrivelse ?? "").trim()
  const medlemsnummer = (payload.medlemsnummer ?? "").trim()
  const budsjettTall = parseMoney(payload.budsjett ?? "")

  if (navn.length < 2 || navn.length > 80) {
    return NextResponse.json(
      { ok: false, feil: "Skriv inn et gyldig navn." },
      { status: 400 }
    )
  }

  if (!isValidEmail(epost)) {
    return NextResponse.json(
      { ok: false, feil: "Skriv inn en gyldig e-postadresse." },
      { status: 400 }
    )
  }

  if (telefon && (telefon.length < 6 || telefon.length > 20)) {
    return NextResponse.json(
      { ok: false, feil: "Skriv inn et gyldig telefonnummer." },
      { status: 400 }
    )
  }

  if (tittel.length < 4 || tittel.length > 120) {
    return NextResponse.json(
      { ok: false, feil: "Skriv inn en gyldig prosjekttittel." },
      { status: 400 }
    )
  }

  if (sted.length < 2 || sted.length > 80) {
    return NextResponse.json(
      { ok: false, feil: "Skriv inn et gyldig sted." },
      { status: 400 }
    )
  }

  if (beskrivelse.length < 20 || beskrivelse.length > 6000) {
    return NextResponse.json(
      { ok: false, feil: "Beskriv prosjektet litt mer." },
      { status: 400 }
    )
  }

  const medlemsnummerTall =
    medlemsnummer && /^\d{3,10}$/.test(medlemsnummer)
      ? Number(medlemsnummer)
      : null

  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  const { error } = await supabase.from("prosjekt_soknader").insert({
    medlemsnummer: medlemsnummerTall,
    navn,
    epost,
    telefon: telefon || null,
    tittel,
    sted,
    budsjett: budsjettTall,
    beskrivelse,
    status: "mottatt",
  })

  if (error) {
    return NextResponse.json(
      { ok: false, feil: "Kunne ikke sende inn prosjektforslaget akkurat nå." },
      { status: 400 }
    )
  }

  return NextResponse.json({ ok: true })
}
