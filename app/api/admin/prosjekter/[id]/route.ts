import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
}

async function getLoggedInEmail() {
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
  const email = String(user?.email ?? "").trim().toLowerCase()
  if (!email || !isValidEmail(email)) return null
  return email
}

async function requireAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return { ok: false as const, status: 500 as const }
  }

  const email = await getLoggedInEmail()
  if (!email) return { ok: false as const, status: 401 as const }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { data, error } = await admin
    .from("medlemmer")
    .select("role")
    .eq("epost", email)
    .maybeSingle()

  if (error) return { ok: false as const, status: 400 as const }
  if (data?.role !== "admin" && data?.role !== "superadmin") {
    return { ok: false as const, status: 403 as const }
  }

  return { ok: true as const, admin, email, role: data.role as "admin" | "superadmin" }
}

const bucket = "prosjekt-vedlegg"

function schemaFeil() {
  return (
    "Prosjekt-tabellen i Supabase mangler felter. Kjør denne SQL-en i Supabase (SQL Editor), og prøv igjen:\n\n" +
    "alter table public.prosjekt_soknader add column if not exists status text;\n" +
    "alter table public.prosjekt_soknader add column if not exists admin_svar text;\n" +
    "alter table public.prosjekt_soknader add column if not exists admin_svar_at timestamptz;\n" +
    "alter table public.prosjekt_soknader add column if not exists admin_svar_sent_at timestamptz;\n"
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
  const fullSelect = `${baseSelect}, vedlegg_paths, admin_svar, admin_svar_at, admin_svar_sent_at`

  let row: Record<string, unknown> | null = null
  let errorMsg = ""

  const full = await gate.admin
    .from("prosjekt_soknader")
    .select(fullSelect)
    .eq("id", prosjektId)
    .maybeSingle()

  if (full.error) {
    errorMsg = String((full.error as { message?: string } | null)?.message ?? "")
    const fallback = await gate.admin
      .from("prosjekt_soknader")
      .select(`${baseSelect}, vedlegg_paths`)
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
    if (/column/i.test(errorMsg) && /admin_svar/i.test(errorMsg)) {
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

  return NextResponse.json({
    ok: true,
    prosjekt: {
      ...row,
      vedlegg_signed_urls: signed.filter(Boolean),
    },
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

  let payload: { status?: string; svar?: string; send?: boolean }
  try {
    payload = (await request.json()) as { status?: string; svar?: string; send?: boolean }
  } catch {
    return NextResponse.json({ ok: false, feil: "Ugyldig JSON." }, { status: 400 })
  }

  const nextStatus = payload.status != null ? String(payload.status).trim() : null
  const svar = payload.svar != null ? String(payload.svar).trim() : null
  const send = payload.send === true

  const allowedStatuses = new Set(["mottatt", "under behandling", "godkjent", "avslått"])
  if (nextStatus != null && !allowedStatuses.has(nextStatus)) {
    return NextResponse.json({ ok: false, feil: "Ugyldig status." }, { status: 400 })
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

  if (!nextStatus && !svar) {
    return NextResponse.json({ ok: false, feil: "Ingenting å oppdatere." }, { status: 400 })
  }

  const { data: prosjekt, error: prosjektError } = await gate.admin
    .from("prosjekt_soknader")
    .select("id, tittel, epost")
    .eq("id", prosjektId)
    .maybeSingle()

  if (prosjektError) {
    return NextResponse.json({ ok: false, feil: "Kunne ikke hente prosjekt." }, { status: 400 })
  }
  if (!prosjekt) {
    return NextResponse.json({ ok: false, feil: "Fant ikke prosjekt." }, { status: 404 })
  }

  const update: Record<string, unknown> = {}
  if (nextStatus != null) update.status = nextStatus
  if (svar != null) {
    update.admin_svar = svar
    update.admin_svar_at = new Date().toISOString()
  }

  const { error: updateError } = await gate.admin
    .from("prosjekt_soknader")
    .update(update)
    .eq("id", prosjektId)

  if (updateError) {
    const msg = String((updateError as { message?: string } | null)?.message ?? "")
    if (/column/i.test(msg) && /admin_svar/i.test(msg)) {
      return NextResponse.json({ ok: false, feil: schemaFeil() }, { status: 500 })
    }
    return NextResponse.json(
      { ok: false, feil: "Kunne ikke oppdatere prosjekt." },
      { status: 400 }
    )
  }

  if (!send) {
    return NextResponse.json({ ok: true })
  }

  const to = String((prosjekt as { epost?: string | null }).epost ?? "").trim()
  if (!isValidEmail(to)) {
    return NextResponse.json(
      { ok: false, feil: "Prosjektet mangler gyldig e-postadresse." },
      { status: 400 }
    )
  }

  const tittel = String((prosjekt as { tittel?: string | null }).tittel ?? "Prosjektforslag").trim()
  const subject = `Svar på prosjektforslag: ${tittel}`
  const text = `Hei!\n\nHer er svar på prosjektforslaget ditt:\n\n${svar}\n\nHilsen\nOBNO`

  const mail = await sendResendEmail(to, subject, text)
  if (!mail.ok) {
    return NextResponse.json({ ok: false, feil: mail.feil }, { status: 500 })
  }

  await gate.admin
    .from("prosjekt_soknader")
    .update({ admin_svar_sent_at: new Date().toISOString() })
    .eq("id", prosjektId)

  return NextResponse.json({ ok: true })
}

