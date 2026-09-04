import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { hasPermission, normalizeRole } from "@/lib/roller"

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
}

async function getAuth() {
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
  const email = String(user?.email ?? "").trim().toLowerCase()
  if (!userId || !email || !isValidEmail(email)) return null
  return { userId, email }
}

async function requireAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return { ok: false as const, status: 500 as const }
  }

  const auth = await getAuth()
  if (!auth) return { ok: false as const, status: 401 as const }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { data, error } = await admin
    .from("medlemmer")
    .select("role")
    .eq("user_id", auth.userId)
    .maybeSingle()

  if (error) return { ok: false as const, status: 400 as const }
  const ownerEmail = String(
    process.env.ADMIN_SUPERADMIN_EMAIL ?? process.env.ADMIN_BOOTSTRAP_EMAIL ?? ""
  )
    .trim()
    .toLowerCase()
  const role = ownerEmail && auth.email === ownerEmail ? "superadmin" : normalizeRole(data?.role)
  if (!hasPermission(role, "manage_projects")) {
    return { ok: false as const, status: 403 as const }
  }

  return { ok: true as const, admin, email: auth.email, role }
}

const bucket = "prosjekt-vedlegg"

export const AVSLUTTET_RESULTAT_ALTERNATIVER = [
  "gikk_bra",
  "noen_utfordringer",
  "fiasko",
  "dyrt",
  "billigere",
  "vanskelig",
  "ekstraarbeid",
  "bra_samarbeid",
  "materiale_vanskelig",
] as const

export type AvsluttetResultatAlternativ = (typeof AVSLUTTET_RESULTAT_ALTERNATIVER)[number]

function schemaFeil() {
  return (
    "Prosjekt-tabellen i Supabase mangler felter. Kjør denne SQL-en i Supabase (SQL Editor), og prøv igjen:\n\n" +
    "alter table public.prosjekt_soknader add column if not exists status text;\n" +
    "alter table public.prosjekt_soknader add column if not exists admin_svar text;\n" +
    "alter table public.prosjekt_soknader add column if not exists admin_svar_at timestamptz;\n" +
    "alter table public.prosjekt_soknader add column if not exists admin_svar_sent_at timestamptz;\n" +
    "alter table public.prosjekt_soknader add column if not exists admin_intern_notat text;\n" +
    "alter table public.prosjekt_soknader add column if not exists admin_intern_notat_at timestamptz;\n" +
    "alter table public.prosjekt_soknader add column if not exists avsluttet_at timestamptz;\n" +
    "alter table public.prosjekt_soknader add column if not exists avsluttet_resultat text[];\n" +
    "alter table public.prosjekt_soknader add column if not exists avsluttet_kommentar text;\n" +
    "\n" +
    "create table if not exists public.prosjekt_hendelser (\n" +
    "  id uuid primary key default gen_random_uuid(),\n" +
    "  created_at timestamptz not null default now(),\n" +
    "  prosjekt_id uuid not null references public.prosjekt_soknader(id) on delete cascade,\n" +
    "  actor_email text,\n" +
    "  type text not null,\n" +
    "  message text\n" +
    ");\n" +
    "create index if not exists prosjekt_hendelser_prosjekt_id_idx on public.prosjekt_hendelser(prosjekt_id);\n"
  )
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin()
  if (!gate.ok) {
    return NextResponse.json({ ok: false }, { status: gate.status })
  }

  const { id } = await context.params
  const prosjektId = String(id ?? "").trim()
  if (!isUuid(prosjektId)) {
    return NextResponse.json({ ok: false, feil: "Ugyldig id." }, { status: 400 })
  }

  const baseSelect =
    "id, created_at, medlemsnummer, navn, epost, telefon, tittel, sted, budsjett, beskrivelse, status"
  const fullSelect = `${baseSelect}, vedlegg_paths, admin_svar, admin_svar_at, admin_svar_sent_at, admin_intern_notat, admin_intern_notat_at, avsluttet_at, avsluttet_resultat, avsluttet_kommentar`

  let row: Record<string, unknown> | null = null
  let errorMsg = ""
  let schemaWarning: string | null = null

  const full = await gate.admin
    .from("prosjekt_soknader")
    .select(fullSelect)
    .eq("id", prosjektId)
    .maybeSingle()

  if (full.error) {
    errorMsg = String((full.error as { message?: string } | null)?.message ?? "")
    if (/column/i.test(errorMsg) && /(admin_svar|admin_intern_notat|avsluttet_)/i.test(errorMsg)) {
      schemaWarning = schemaFeil()
    }
    let fallbackSelect = `${baseSelect}, vedlegg_paths`
    if (/admin_svar_sent_at/i.test(errorMsg)) {
      fallbackSelect = `${baseSelect}, vedlegg_paths, admin_svar, admin_svar_at`
    } else if (/admin_svar_at/i.test(errorMsg)) {
      fallbackSelect = `${baseSelect}, vedlegg_paths, admin_svar`
    }
    if (/admin_intern_notat_at/i.test(errorMsg)) {
      fallbackSelect = `${fallbackSelect}, admin_intern_notat`
    }

    const fallback = await gate.admin
      .from("prosjekt_soknader")
      .select(fallbackSelect)
      .eq("id", prosjektId)
      .maybeSingle()
    if (fallback.error) {
      const msg = String((fallback.error as { message?: string } | null)?.message ?? "")
      if ((/relation/i.test(msg) && /prosjekt_soknader/i.test(msg)) || /42p01/i.test(msg)) {
        return NextResponse.json({ ok: false, feil: schemaFeil() }, { status: 500 })
      }
      return NextResponse.json({ ok: false, feil: "Kunne ikke hente prosjekt." }, { status: 400 })
    }
    row = (fallback.data as unknown as Record<string, unknown> | null) ?? null
  } else {
    row = (full.data as unknown as Record<string, unknown> | null) ?? null
  }

  if (!row) {
    if (/column/i.test(errorMsg) && /(admin_svar|admin_intern_notat)/i.test(errorMsg)) {
      return NextResponse.json({ ok: false, feil: schemaFeil() }, { status: 500 })
    }
    return NextResponse.json({ ok: false, feil: "Fant ikke prosjekt." }, { status: 404 })
  }

  const paths = Array.isArray(row.vedlegg_paths) ? (row.vedlegg_paths as string[]) : []
  const signed = await Promise.all(
    paths.slice(0, 12).map(async (p) => {
      const { data } = await gate.admin.storage.from(bucket).createSignedUrl(p, 60)
      return data?.signedUrl ?? null
    })
  )

  let hendelser: Record<string, unknown>[] | null = null
  const logRes = await gate.admin
    .from("prosjekt_hendelser")
    .select("id, created_at, type, message, actor_email")
    .eq("prosjekt_id", prosjektId)
    .order("created_at", { ascending: false })
    .limit(50)

  if (logRes.error) {
    const msg = String((logRes.error as { message?: string } | null)?.message ?? "")
    if ((/relation/i.test(msg) && /prosjekt_hendelser/i.test(msg)) || /42p01/i.test(msg)) {
      schemaWarning = schemaFeil()
    }
  } else {
    hendelser = (logRes.data as unknown as Record<string, unknown>[] | null) ?? null
  }

  return NextResponse.json({
    ok: true,
    prosjekt: {
      ...row,
      vedlegg_signed_urls: signed.filter(Boolean),
      hendelser: hendelser ?? [],
    },
    schemaWarning,
  })
}

async function sendResendEmail(to: string, subject: string, text: string) {
  const apiKey = String(process.env.RESEND_API_KEY ?? "").trim()
  const from = String(process.env.RESEND_FROM ?? "").trim()
  if (!apiKey || !from) {
    return {
      ok: false as const,
      feil: "E-post er ikke konfigurert. Sett RESEND_API_KEY og RESEND_FROM i miljøvariabler.",
    }
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text,
    }),
  })

  if (!res.ok) {
    let details = ""
    try {
      details = JSON.stringify(await res.json())
    } catch {
      details = ""
    }
    return { ok: false as const, feil: `Kunne ikke sende e-post. ${details}`.trim() }
  }

  return { ok: true as const }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin()
  if (!gate.ok) {
    return NextResponse.json({ ok: false }, { status: gate.status })
  }

  const { id } = await context.params
  const prosjektId = String(id ?? "").trim()
  if (!isUuid(prosjektId)) {
    return NextResponse.json({ ok: false, feil: "Ugyldig id." }, { status: 400 })
  }

  let payload: {
    status?: string
    svar?: string
    send?: boolean
    intern_notat?: string
    avslutt?: boolean
    aapne?: boolean
    avsluttet_resultat?: unknown
    avsluttet_kommentar?: string
    send_takksvar?: boolean
    takksvar_tekst?: string
  }
  try {
    payload = (await request.json()) as {
      status?: string
      svar?: string
      send?: boolean
      intern_notat?: string
      avslutt?: boolean
      aapne?: boolean
      avsluttet_resultat?: unknown
      avsluttet_kommentar?: string
      send_takksvar?: boolean
      takksvar_tekst?: string
    }
  } catch {
    return NextResponse.json({ ok: false, feil: "Ugyldig JSON." }, { status: 400 })
  }

  const nextStatus = payload.status != null ? String(payload.status).trim() : null
  const svar = payload.svar != null ? String(payload.svar).trim() : null
  const send = payload.send === true
  const internNotat = payload.intern_notat != null ? String(payload.intern_notat) : null
  const skalAvslutte = payload.avslutt === true
  const skalAapne = payload.aapne === true

  const rawResultat = payload.avsluttet_resultat
  const resultatListe: string[] = Array.isArray(rawResultat)
    ? rawResultat.map((v) => String(v ?? "").trim()).filter(Boolean)
    : []
  const ugyldige = resultatListe.filter(
    (t) => !(AVSLUTTET_RESULTAT_ALTERNATIVER as readonly string[]).includes(t)
  )
  if (ugyldige.length) {
    return NextResponse.json(
      { ok: false, feil: `Ugyldig resultatvalg: ${ugyldige.join(", ")}` },
      { status: 400 }
    )
  }

  const avsluttetKommentar =
    payload.avsluttet_kommentar != null ? String(payload.avsluttet_kommentar).trim() : null

  const sendTakksvar = payload.send_takksvar === true
  const takksvarTekst = sendTakksvar
    ? String(payload.takksvar_tekst ?? "").trim()
    : ""
  if (sendTakksvar && takksvarTekst.length < 2) {
    return NextResponse.json(
      { ok: false, feil: "Skriv en takk-melding før du sender den." },
      { status: 400 }
    )
  }

  const allowedStatuses = new Set([
    "mottatt",
    "under behandling",
    "godkjent",
    "avslått",
    "avsluttet",
  ])
  if (nextStatus != null && !allowedStatuses.has(nextStatus)) {
    return NextResponse.json({ ok: false, feil: "Ugyldig status." }, { status: 400 })
  }

  if (skalAvslutte && resultatListe.length === 0 && !avsluttetKommentar) {
    return NextResponse.json(
      { ok: false, feil: "Velg minst ett resultat, eller skriv en kommentar, før du avslutter." },
      { status: 400 }
    )
  }

  if (send && (!svar || svar.length < 2)) {
    return NextResponse.json({ ok: false, feil: "Svar kan ikke være tomt." }, { status: 400 })
  }

  if (svar && svar.length > 8000) {
    return NextResponse.json(
      { ok: false, feil: "Svar er for langt." },
      { status: 400 }
    )
  }

  if (internNotat != null && internNotat.length > 12000) {
    return NextResponse.json(
      { ok: false, feil: "Internnotatet er for langt." },
      { status: 400 }
    )
  }
  if (avsluttetKommentar != null && avsluttetKommentar.length > 8000) {
    return NextResponse.json(
      { ok: false, feil: "Avsluttet-kommentar er for lang." },
      { status: 400 }
    )
  }
  if (takksvarTekst.length > 8000) {
    return NextResponse.json(
      { ok: false, feil: "Takk-meldingen er for lang." },
      { status: 400 }
    )
  }

  if (
    !nextStatus &&
    !svar &&
    internNotat == null &&
    !skalAvslutte &&
    !skalAapne &&
    !sendTakksvar
  ) {
    return NextResponse.json({ ok: false, feil: "Ingenting å oppdatere." }, { status: 400 })
  }

  const { data: prosjekt, error: prosjektError } = await gate.admin
    .from("prosjekt_soknader")
    .select("id, tittel, epost, status, avsluttet_at, avsluttet_resultat, avsluttet_kommentar")
    .eq("id", prosjektId)
    .maybeSingle()

  if (prosjektError) {
    const msg = String((prosjektError as { message?: string } | null)?.message ?? "")
    if (/column/i.test(msg) && /avsluttet_/i.test(msg)) {
      return NextResponse.json({ ok: false, feil: schemaFeil() }, { status: 500 })
    }
    return NextResponse.json({ ok: false, feil: "Kunne ikke hente prosjekt." }, { status: 400 })
  }
  if (!prosjekt) {
    return NextResponse.json({ ok: false, feil: "Fant ikke prosjekt." }, { status: 404 })
  }

  const prosjektRow = prosjekt as {
    id?: string
    tittel?: string | null
    epost?: string | null
    status?: string | null
    avsluttet_at?: string | null
    avsluttet_resultat?: string[] | null
    avsluttet_kommentar?: string | null
  }
  const prevStatus = String(prosjektRow.status ?? "").trim() || null
  const erAvsluttetNaa = !!prosjektRow.avsluttet_at

  const update: Record<string, unknown> = {}
  let effectiveStatus: string | null = nextStatus ?? prevStatus
  if (nextStatus != null) update.status = nextStatus
  if (svar != null) {
    update.admin_svar = svar
    update.admin_svar_at = new Date().toISOString()
  }
  if (internNotat != null) {
    update.admin_intern_notat = internNotat
    update.admin_intern_notat_at = new Date().toISOString()
  }

  const nowIso = new Date().toISOString()
  if (skalAvslutte) {
    update.avsluttet_at = nowIso
    if (resultatListe.length) update.avsluttet_resultat = resultatListe
    if (avsluttetKommentar != null) update.avsluttet_kommentar = avsluttetKommentar
    if (nextStatus == null && !erAvsluttetNaa) {
      update.status = "avsluttet"
      effectiveStatus = "avsluttet"
    }
  } else if (skalAapne) {
    update.avsluttet_at = null
    if (nextStatus == null && prevStatus === "avsluttet") {
      update.status = "under behandling"
      effectiveStatus = "under behandling"
    }
  } else {
    if (resultatListe.length) update.avsluttet_resultat = resultatListe
    if (avsluttetKommentar != null) update.avsluttet_kommentar = avsluttetKommentar
  }

  let schemaWarning: string | null = null
  if (Object.keys(update).length) {
    const { error: updateError } = await gate.admin
      .from("prosjekt_soknader")
      .update(update)
      .eq("id", prosjektId)

    if (updateError) {
      const msg = String((updateError as { message?: string } | null)?.message ?? "")
      if (/column/i.test(msg) && /(admin_svar|admin_intern_notat|avsluttet_)/i.test(msg)) {
        return NextResponse.json({ ok: false, feil: schemaFeil() }, { status: 500 })
      }
      return NextResponse.json(
        { ok: false, feil: "Kunne ikke oppdatere prosjekt." },
        { status: 400 }
      )
    }
  }

  if (effectiveStatus !== prevStatus) {
    const log = await gate.admin.from("prosjekt_hendelser").insert({
      prosjekt_id: prosjektId,
      actor_email: gate.email,
      type: "status_endret",
      message: `Status: ${(prevStatus ?? "—")} → ${effectiveStatus ?? "—"}`,
    })
    if (log.error) {
      const msg = String((log.error as { message?: string } | null)?.message ?? "")
      if ((/relation/i.test(msg) && /prosjekt_hendelser/i.test(msg)) || /42p01/i.test(msg)) {
        schemaWarning = schemaFeil()
      }
    }
  }

  if (skalAvslutte) {
    const deler: string[] = []
    if (resultatListe.length) {
      const navnMap: Record<string, string> = {
        gikk_bra: "Gikk bra",
        noen_utfordringer: "Noen utfordringer",
        fiasko: "Fiasko",
        dyrt: "Dyrt",
        billigere: "Billigere enn planlagt",
        vanskelig: "Vanskelig",
        ekstraarbeid: "Ekstraarbeid",
        bra_samarbeid: "Bra samarbeid",
        materiale_vanskelig: "Vanskelig å få materiale",
      }
      deler.push(
        "Resultat: " + resultatListe.map((k) => navnMap[k] || k).join(", ")
      )
    }
    if (avsluttetKommentar) deler.push(`Kommentar: ${avsluttetKommentar}`)
    const log = await gate.admin.from("prosjekt_hendelser").insert({
      prosjekt_id: prosjektId,
      actor_email: gate.email,
      type: "prosjekt_avsluttet",
      message: deler.length ? `Prosjekt avsluttet. ${deler.join(" ")}` : "Prosjekt avsluttet.",
    })
    if (log.error) {
      const msg = String((log.error as { message?: string } | null)?.message ?? "")
      if ((/relation/i.test(msg) && /prosjekt_hendelser/i.test(msg)) || /42p01/i.test(msg)) {
        schemaWarning = schemaFeil()
      }
    }
  }
  if (skalAapne && erAvsluttetNaa) {
    const log = await gate.admin.from("prosjekt_hendelser").insert({
      prosjekt_id: prosjektId,
      actor_email: gate.email,
      type: "prosjekt_apnet",
      message: "Prosjekt åpnet igjen (fjernet avsluttet-status).",
    })
    if (log.error) {
      const msg = String((log.error as { message?: string } | null)?.message ?? "")
      if ((/relation/i.test(msg) && /prosjekt_hendelser/i.test(msg)) || /42p01/i.test(msg)) {
        schemaWarning = schemaFeil()
      }
    }
  }

  if (svar != null) {
    const log = await gate.admin.from("prosjekt_hendelser").insert({
      prosjekt_id: prosjektId,
      actor_email: gate.email,
      type: send ? "svar_sendt" : "svar_lagret",
      message: send ? "Svar sendt til søker." : "Svar lagret (ikke sendt).",
    })
    if (log.error) {
      const msg = String((log.error as { message?: string } | null)?.message ?? "")
      if ((/relation/i.test(msg) && /prosjekt_hendelser/i.test(msg)) || /42p01/i.test(msg)) {
        schemaWarning = schemaFeil()
      }
    }
  }

  if (send || sendTakksvar) {
    const resendApiKey = String(process.env.RESEND_API_KEY ?? "").trim()
    const resendFrom = String(process.env.RESEND_FROM ?? "").trim()
    const canSendEmail = Boolean(resendApiKey && resendFrom)

    const to = String(prosjektRow.epost ?? "").trim()
    if (!isValidEmail(to)) {
      return NextResponse.json(
        { ok: false, feil: "Prosjektet mangler gyldig e-postadresse." },
        { status: 400 }
      )
    }
    const tittel = String(prosjektRow.tittel ?? "Prosjektforslag").trim()

    if (canSendEmail && send) {
      const subject = `Svar på prosjektforslag: ${tittel}`
      const text = `Hei!\n\nHer er svar på prosjektforslaget ditt:\n\n${svar}\n\nHilsen\nOBNO`
      const mail = await sendResendEmail(to, subject, text)
      if (!mail.ok) {
        return NextResponse.json({ ok: false, feil: mail.feil }, { status: 500 })
      }
    }

    if (canSendEmail && sendTakksvar) {
      const subject = `Takk for prosjektet: ${tittel}`
      const text = `Hei!\n\n${takksvarTekst}\n\nHilsen\nOBNO`
      const mail = await sendResendEmail(to, subject, text)
      if (!mail.ok) {
        return NextResponse.json({ ok: false, feil: mail.feil }, { status: 500 })
      }
      const takkLog = await gate.admin.from("prosjekt_hendelser").insert({
        prosjekt_id: prosjektId,
        actor_email: gate.email,
        type: "takk_sendt",
        message: `Takk-varsel sendt til søker.`,
      })
      if (takkLog.error) {
        const msg = String((takkLog.error as { message?: string } | null)?.message ?? "")
        if ((/relation/i.test(msg) && /prosjekt_hendelser/i.test(msg)) || /42p01/i.test(msg)) {
          schemaWarning = schemaFeil()
        }
      }
    }

    if (send) {
      const sentUpdate = await gate.admin
        .from("prosjekt_soknader")
        .update({ admin_svar_sent_at: new Date().toISOString() })
        .eq("id", prosjektId)

      if (sentUpdate.error) {
        const msg = String((sentUpdate.error as { message?: string } | null)?.message ?? "")
        if (/column/i.test(msg) && /admin_svar_sent_at/i.test(msg)) {
          schemaWarning = schemaFeil()
        }
      }
    }
  }

  return NextResponse.json({ ok: true, schemaWarning })
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin()
  if (!gate.ok) {
    return NextResponse.json({ ok: false }, { status: gate.status })
  }

  if (gate.role !== "superadmin") {
    return NextResponse.json(
      { ok: false, feil: "Kun superbruker kan slette prosjekter." },
      { status: 403 }
    )
  }

  const { id } = await context.params
  const prosjektId = String(id ?? "").trim()
  if (!isUuid(prosjektId)) {
    return NextResponse.json({ ok: false, feil: "Ugyldig id." }, { status: 400 })
  }

  const { data: row, error: rowError } = await gate.admin
    .from("prosjekt_soknader")
    .select("id, vedlegg_paths")
    .eq("id", prosjektId)
    .maybeSingle()

  if (rowError) {
    const msg = String((rowError as { message?: string } | null)?.message ?? "")
    if ((/relation/i.test(msg) && /prosjekt_soknader/i.test(msg)) || /42p01/i.test(msg)) {
      return NextResponse.json({ ok: false, feil: schemaFeil() }, { status: 500 })
    }
    return NextResponse.json({ ok: false, feil: "Kunne ikke hente prosjekt." }, { status: 400 })
  }

  if (!row) {
    return NextResponse.json({ ok: false, feil: "Fant ikke prosjekt." }, { status: 404 })
  }

  const paths = Array.isArray(row.vedlegg_paths) ? (row.vedlegg_paths as string[]) : []
  if (paths.length) {
    try {
      await gate.admin.storage.from(bucket).remove(paths)
    } catch {}
  }

  try {
    await gate.admin.from("prosjekt_hendelser").delete().eq("prosjekt_id", prosjektId)
  } catch {}

  const { error: deleteError } = await gate.admin
    .from("prosjekt_soknader")
    .delete()
    .eq("id", prosjektId)

  if (deleteError) {
    return NextResponse.json({ ok: false, feil: "Kunne ikke slette prosjekt." }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
