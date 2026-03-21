import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

type Payload = {
  navn?: string
  epost?: string
  telefon?: string
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
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

  if (telefon.length < 6 || telefon.length > 20) {
    return NextResponse.json(
      { ok: false, feil: "Skriv inn et gyldig telefonnummer." },
      { status: 400 }
    )
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  const { error } = await supabase.from("medlemmer").insert({
    navn,
    epost,
    telefon,
  })

  if (error) {
    return NextResponse.json(
      { ok: false, feil: "Kunne ikke registrere medlemskap akkurat nå." },
      { status: 400 }
    )
  }

  return NextResponse.json({ ok: true })
}
