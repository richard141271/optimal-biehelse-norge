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

function digitsOnly(value: string) {
  return value.replace(/\D/g, "")
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
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

  let payload: Payload = {}
  let vedlegg: File[] = []
  const contentType = request.headers.get("content-type") ?? ""
  if (contentType.toLowerCase().includes("application/json")) {
    try {
      payload = (await request.json()) as Payload
    } catch {
      return NextResponse.json(
        { ok: false, feil: "Ugyldig forespørsel." },
        { status: 400 }
      )
    }
  } else {
    let form: FormData
    try {
      form = await request.formData()
    } catch {
      return NextResponse.json(
        { ok: false, feil: "Ugyldig forespørsel." },
        { status: 400 }
      )
    }
    payload = {
      medlemsnummer: String(form.get("medlemsnummer") ?? ""),
      navn: String(form.get("navn") ?? ""),
      epost: String(form.get("epost") ?? ""),
      telefon: String(form.get("telefon") ?? ""),
      tittel: String(form.get("tittel") ?? ""),
      sted: String(form.get("sted") ?? ""),
      budsjett: String(form.get("budsjett") ?? ""),
      beskrivelse: String(form.get("beskrivelse") ?? ""),
    }
    vedlegg = form
      .getAll("vedlegg")
      .filter((v): v is File => v instanceof File && v.size > 0)
  }

  const navn = (payload.navn ?? "").trim()
  const epost = (payload.epost ?? "").trim()
  const telefon = digitsOnly((payload.telefon ?? "").trim())
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

  if (telefon && telefon.length !== 8) {
    return NextResponse.json(
      { ok: false, feil: "Telefon må være 8 siffer." },
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

  const schemaFeil =
    "Prosjekt-tabellen i Supabase mangler felter. Kjør denne SQL-en i Supabase (SQL Editor), og prøv igjen:\n\n" +
    "alter table public.prosjekt_soknader add column if not exists vedlegg_paths text[];\n"

  const bucket = "prosjekt-vedlegg"
  const admin = createClient(supabaseUrl, serviceRoleKey ?? supabaseAnonKey, {
    auth: { persistSession: false },
  })

  if (vedlegg.length && !serviceRoleKey) {
    return NextResponse.json(
      { ok: false, feil: "Vedlegg krever SUPABASE_SERVICE_ROLE_KEY i miljøvariabler." },
      { status: 500 }
    )
  }

  if (vedlegg.length) {
    const { error: createBucketError } = await admin.storage.createBucket(bucket, {
      public: false,
    })
    if (createBucketError) {
      const msg = String((createBucketError as { message?: string } | null)?.message ?? "")
      if (!/exists/i.test(msg) && !/already/i.test(msg)) {
        return NextResponse.json(
          {
            ok: false,
            feil:
              "Lagring av vedlegg er ikke satt opp i Supabase Storage. Lag en bucket som heter 'prosjekt-vedlegg' (private), og prøv igjen.",
          },
          { status: 500 }
        )
      }
    }
  }

  const uploadedPaths: string[] = []
  try {
    if (vedlegg.length) {
      if (vedlegg.length > 5) {
        return NextResponse.json(
          { ok: false, feil: "Maks 5 vedlegg per prosjekt." },
          { status: 400 }
        )
      }
      for (const f of vedlegg) {
        if (f.size > 10 * 1024 * 1024) {
          return NextResponse.json(
            { ok: false, feil: "Hvert vedlegg kan maks være 10 MB." },
            { status: 400 }
          )
        }
        const safeName = (f.name || "vedlegg")
          .replace(/[^\p{L}\p{N}._-]+/gu, "-")
          .replace(/-+/g, "-")
          .slice(0, 80)
        const path = `${todayIso()}/${crypto.randomUUID()}-${safeName}`
        const body = await f.arrayBuffer()
        const { error: uploadError } = await admin.storage
          .from(bucket)
          .upload(path, body, { upsert: false, contentType: f.type || undefined })
        if (uploadError) {
          return NextResponse.json(
            { ok: false, feil: "Kunne ikke laste opp vedlegg." },
            { status: 400 }
          )
        }
        uploadedPaths.push(path)
      }
    }

    const insertRow: Record<string, unknown> = {
      medlemsnummer: medlemsnummerTall,
      navn,
      epost,
      telefon: telefon || null,
      tittel,
      sted,
      budsjett: budsjettTall,
      beskrivelse,
      status: "mottatt",
    }
    if (uploadedPaths.length) insertRow.vedlegg_paths = uploadedPaths

    const { error } = await admin.from("prosjekt_soknader").insert(insertRow)

    if (error) {
      const msg = String((error as { message?: string } | null)?.message ?? "")
      if (/vedlegg_paths/i.test(msg) || (/column/i.test(msg) && /vedlegg/i.test(msg))) {
        if (uploadedPaths.length) {
          await admin.storage.from(bucket).remove(uploadedPaths)
        }
        return NextResponse.json({ ok: false, feil: schemaFeil }, { status: 500 })
      }
      if (uploadedPaths.length) {
        await admin.storage.from(bucket).remove(uploadedPaths)
      }
      return NextResponse.json(
        { ok: false, feil: "Kunne ikke sende inn prosjektforslaget akkurat nå." },
        { status: 400 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch {
    if (uploadedPaths.length) {
      await admin.storage.from(bucket).remove(uploadedPaths)
    }
    return NextResponse.json(
      { ok: false, feil: "Kunne ikke sende inn prosjektforslaget akkurat nå." },
      { status: 400 }
    )
  }
}
