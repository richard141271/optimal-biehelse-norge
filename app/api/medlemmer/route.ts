import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import {
  isCampaignActive,
  parseMemberIdValue,
  prisForMedlemskapstype,
  vervekampanjeSchemaFeil,
} from "@/lib/vervekampanje"

type Payload = {
  type?: "innmeldt" | "stotte" | "bedrift"
  navn?: string
  adresse?: string
  postnr?: string
  sted?: string
  epost?: string
  telefon?: string
  passord?: string
  referralCampaignId?: string
  referrerMemberId?: string
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

function removeUnsupportedMemberField(
  row: Record<string, unknown>,
  message: string
) {
  const msg = message.toLowerCase()
  const fieldOrder = [
    "medlemsnummer",
    "medlemskap_type",
    "user_id",
    "role",
    "adresse",
    "postnr",
    "sted",
    "telefon",
  ] as const
  for (const field of fieldOrder) {
    if (field in row && msg.includes(field.toLowerCase())) {
      delete row[field]
      return field
    }
  }
  return null
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
  const navn = (payload.navn ?? "").trim()
  const adresse = (payload.adresse ?? "").trim()
  const postnr = (payload.postnr ?? "").trim()
  const sted = (payload.sted ?? "").trim()
  const epost = (payload.epost ?? "").trim().toLowerCase()
  const telefon = digitsOnly((payload.telefon ?? "").trim())
  const passord = (payload.passord ?? "").trim()
  const referralCampaignId = String(payload.referralCampaignId ?? "").trim()
  const referrerMemberId = String(payload.referrerMemberId ?? "").trim()

  if (!passord || passord.length < 6 || passord.length > 200) {
    return NextResponse.json(
      { ok: false, feil: "Passord må være minst 6 tegn." },
      { status: 400 }
    )
  }

  if (
    medlemskapType !== "innmeldt" &&
    medlemskapType !== "stotte" &&
    medlemskapType !== "bedrift"
  ) {
    return NextResponse.json(
      { ok: false, feil: "Ugyldig medlemskapstype." },
      { status: 400 }
    )
  }

  if (navn.length < 2 || navn.length > 80) {
    return NextResponse.json(
      { ok: false, feil: "Skriv inn et gyldig navn." },
      { status: 400 }
    )
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

  if ((referralCampaignId && !referrerMemberId) || (!referralCampaignId && referrerMemberId)) {
    return NextResponse.json(
      { ok: false, feil: "Vervelenken er ufullstendig. Bruk hele vervelenken på nytt." },
      { status: 400 }
    )
  }

  let validReferral:
    | {
        campaignId: string
        referrerMemberId: string
        referrerUserId: string | null
        referrerName: string | null
        referrerEmail: string | null
      }
    | null = null

  if (referralCampaignId && referrerMemberId) {
    const { data: campaign, error: campaignError } = await supabase
      .from("vervekampanjer")
      .select("id, status, starts_at, ends_at")
      .eq("id", referralCampaignId)
      .maybeSingle()

    if (campaignError) {
      const sf = vervekampanjeSchemaFeil((campaignError as { message?: string } | null)?.message)
      return NextResponse.json(
        { ok: false, feil: sf ?? "Kunne ikke lese vervelenken." },
        { status: sf ? 500 : 400 }
      )
    }

    if (!campaign?.id || !isCampaignActive(campaign)) {
      return NextResponse.json(
        { ok: false, feil: "Denne vervekampanjen er ikke aktiv lenger." },
        { status: 400 }
      )
    }

    const { data: referrer, error: referrerError } = await supabase
      .from("medlemmer")
      .select("id, user_id, navn, epost, aktiv")
      .eq("id", parseMemberIdValue(referrerMemberId))
      .maybeSingle()

    if (referrerError) {
      const sf = vervekampanjeSchemaFeil((referrerError as { message?: string } | null)?.message)
      return NextResponse.json(
        { ok: false, feil: sf ?? "Kunne ikke lese vervelenken." },
        { status: sf ? 500 : 400 }
      )
    }

    if (!referrer?.id || referrer.aktiv === false) {
      return NextResponse.json(
        { ok: false, feil: "Vervelenken er ikke gyldig lenger." },
        { status: 400 }
      )
    }

    const referrerEmail = String(referrer.epost ?? "").trim().toLowerCase()
    if (referrerEmail && referrerEmail === epost) {
      return NextResponse.json(
        { ok: false, feil: "Du kan ikke verve deg selv." },
        { status: 400 }
      )
    }

    validReferral = {
      campaignId: referralCampaignId,
      referrerMemberId: String(referrer.id),
      referrerUserId: String(referrer.user_id ?? "").trim() || null,
      referrerName: String(referrer.navn ?? "").trim() || null,
      referrerEmail: referrerEmail || null,
    }
  }

  const schemaFeil =
    "Medlemsregister-tabellen i Supabase mangler tabell eller felter. Kjør denne SQL-en i Supabase (SQL Editor), og prøv igjen:\n\n" +
    "create table if not exists public.medlemmer (\n" +
    "  id bigint generated by default as identity primary key,\n" +
    "  created_at timestamptz not null default now(),\n" +
    "  user_id uuid,\n" +
    "  medlemskap_type text,\n" +
    "  medlemsnummer integer,\n" +
    "  role text not null default 'user',\n" +
    "  aktiv boolean not null default true,\n" +
    "  utmeldt_at timestamptz,\n" +
    "  navn text,\n" +
    "  adresse text,\n" +
    "  postnr text,\n" +
    "  sted text,\n" +
    "  epost text,\n" +
    "  telefon text,\n" +
    "  kontingent_betalt_at timestamptz,\n" +
    "  kontingent_gyldig_til date,\n" +
    "  utbetaling_kontonummer text\n" +
    ");\n" +
    "alter table public.medlemmer add column if not exists user_id uuid;\n" +
    "alter table public.medlemmer add column if not exists medlemskap_type text;\n" +
    "alter table public.medlemmer add column if not exists medlemsnummer integer;\n" +
    "alter table public.medlemmer add column if not exists role text not null default 'user';\n" +
    "alter table public.medlemmer add column if not exists aktiv boolean not null default true;\n" +
    "alter table public.medlemmer add column if not exists utmeldt_at timestamptz;\n" +
    "alter table public.medlemmer add column if not exists navn text;\n" +
    "alter table public.medlemmer add column if not exists adresse text;\n" +
    "alter table public.medlemmer add column if not exists postnr text;\n" +
    "alter table public.medlemmer add column if not exists sted text;\n" +
    "alter table public.medlemmer add column if not exists epost text;\n" +
    "alter table public.medlemmer add column if not exists telefon text;\n" +
    "alter table public.medlemmer add column if not exists kontingent_betalt_at timestamptz;\n" +
    "alter table public.medlemmer add column if not exists kontingent_gyldig_til date;\n" +
    "alter table public.medlemmer add column if not exists utbetaling_kontonummer text;\n" +
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

  const ownerEmail = String(
    process.env.ADMIN_SUPERADMIN_EMAIL ?? process.env.ADMIN_BOOTSTRAP_EMAIL ?? ""
  )
    .trim()
    .toLowerCase()
  const role = ownerEmail && epost === ownerEmail ? "superadmin" : "user"

  let nesteMedlemsnummer: number | null = null
  const { data: maxRow, error: maxError } = await supabase
    .from("medlemmer")
    .select("medlemsnummer")
    .order("medlemsnummer", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (maxError) {
    const msg = String((maxError as { message?: string } | null)?.message ?? "")
    if (/relation/i.test(msg) && /medlemmer/i.test(msg)) {
      await supabase.auth.admin.deleteUser(userId)
      return NextResponse.json({ ok: false, feil: schemaFeil }, { status: 500 })
    }
  } else {
    const maxVal = Number((maxRow as { medlemsnummer?: number | null } | null)?.medlemsnummer ?? 999)
    if (Number.isFinite(maxVal)) {
      nesteMedlemsnummer = Math.max(999, maxVal) + 1
    }
  }

  const insertRow: Record<string, unknown> = {
    user_id: userId,
    medlemskap_type: medlemskapType,
    role,
    navn: navn || null,
    adresse: adresse || null,
    postnr: postnr || null,
    sted: sted || null,
    epost,
    telefon: telefon || null,
  }
  if (nesteMedlemsnummer != null) {
    insertRow.medlemsnummer = nesteMedlemsnummer
  }

  let data: { id?: string | number | null; medlemsnummer?: number | null; navn?: string | null; epost?: string | null } | null = null
  let insertError: string | null = null
  for (let attempt = 0; attempt < 6; attempt++) {
    const result = await supabase
      .from("medlemmer")
      .insert(insertRow)
      .select("id, medlemsnummer, navn, epost")
      .maybeSingle()

    if (!result.error) {
      data =
        (result.data as {
          id?: string | number | null
          medlemsnummer?: number | null
          navn?: string | null
          epost?: string | null
        } | null) ?? null
      insertError = null
      break
    }

    const msg = String((result.error as { message?: string } | null)?.message ?? "")
    insertError = msg
    if (/relation/i.test(msg) && /medlemmer/i.test(msg)) {
      await supabase.auth.admin.deleteUser(userId)
      return NextResponse.json({ ok: false, feil: schemaFeil }, { status: 500 })
    }

    const removed = removeUnsupportedMemberField(insertRow, msg)
    if (!removed) break
  }

  if (insertError || !data?.id) {
    await supabase.auth.admin.deleteUser(userId)
    return NextResponse.json(
      { ok: false, feil: "Kunne ikke registrere medlemskap akkurat nå." },
      { status: 400 }
    )
  }

  if (validReferral) {
    const newMember = data as {
      id?: string | number | null
      navn?: string | null
      epost?: string | null
    } | null
    const referredMemberId = String(newMember?.id ?? "").trim()
    if (!referredMemberId) {
      await supabase.from("medlemmer").delete().eq("user_id", userId)
      await supabase.auth.admin.deleteUser(userId)
      return NextResponse.json(
        { ok: false, feil: "Kunne ikke lagre vervet riktig. Prov igjen." },
        { status: 500 }
      )
    }

    const referralInsert = {
      campaign_id: validReferral.campaignId,
      referrer_member_id: validReferral.referrerMemberId,
      referrer_user_id: validReferral.referrerUserId,
      referrer_name: validReferral.referrerName,
      referrer_email: validReferral.referrerEmail,
      referred_member_id: referredMemberId,
      referred_user_id: userId,
      referred_name: String(newMember?.navn ?? navn).trim() || navn,
      referred_email: String(newMember?.epost ?? epost).trim().toLowerCase() || epost,
      membership_type: medlemskapType,
      amount: prisForMedlemskapstype(medlemskapType),
    }

    const { error: referralError } = await supabase
      .from("vervekampanje_verv")
      .insert(referralInsert)

    if (referralError) {
      const sf = vervekampanjeSchemaFeil((referralError as { message?: string } | null)?.message)
      await supabase.from("medlemmer").delete().eq("id", parseMemberIdValue(referredMemberId))
      await supabase.auth.admin.deleteUser(userId)
      return NextResponse.json(
        {
          ok: false,
          feil:
            sf ??
            "Kunne ikke registrere vervet. Be medlemmet sende deg vervelenken på nytt og prøv igjen.",
        },
        { status: sf ? 500 : 400 }
      )
    }
  }

  return NextResponse.json({ ok: true })
}
