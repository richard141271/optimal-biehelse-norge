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

export const dynamic = "force-dynamic"

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

const bucket = "prosjekt-vedlegg"

function schemaFeil() {
  return (
    "Prosjekt-tabellen i Supabase mangler felter. Kjør denne SQL-en i Supabase (SQL Editor), og prøv igjen:\n\n" +
    "alter table public.prosjekt_soknader add column if not exists status text;\n" +
    "alter table public.prosjekt_soknader add column if not exists admin_svar text;\n" +
    "alter table public.prosjekt_soknader add column if not exists admin_svar_at timestamptz;\n" +
    "alter table public.prosjekt_soknader add column if not exists admin_svar_sent_at timestamptz;\n" +
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
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { ok: false, feil: "Supabase er ikke konfigurert." },
      { status: 500 }
    )
  }

  const email = await getLoggedInEmail()
  if (!email) {
    return NextResponse.json({ ok: false, feil: "Ikke innlogget." }, { status: 401 })
  }

  if (!serviceRoleKey) {
    return NextResponse.json(
      { ok: false, feil: "Mine prosjekter krever SUPABASE_SERVICE_ROLE_KEY i miljøvariabler." },
      { status: 500 }
    )
  }

  const { id } = await context.params
  const prosjektId = String(id ?? "").trim()
  if (!isUuid(prosjektId)) {
    return NextResponse.json({ ok: false, feil: "Ugyldig id." }, { status: 400 })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const baseSelect =
    "id, created_at, medlemsnummer, navn, epost, telefon, tittel, sted, budsjett, beskrivelse, status"
  const fullSelect = `${baseSelect}, vedlegg_paths, admin_svar, admin_svar_at, admin_svar_sent_at`

  let schemaWarning: string | null = null
  let row: Record<string, unknown> | null = null

  const full = await admin
    .from("prosjekt_soknader")
    .select(fullSelect)
    .eq("id", prosjektId)
    .eq("epost", email)
    .maybeSingle()

  if (full.error) {
    const msg = String((full.error as { message?: string } | null)?.message ?? "")
    if (/column/i.test(msg) && /admin_svar/i.test(msg)) {
      schemaWarning = schemaFeil()
    }
    const fallback = await admin
      .from("prosjekt_soknader")
      .select(`${baseSelect}, vedlegg_paths`)
      .eq("id", prosjektId)
      .eq("epost", email)
      .maybeSingle()

    if (fallback.error) {
      const msg2 = String((fallback.error as { message?: string } | null)?.message ?? "")
      if ((/relation/i.test(msg2) && /prosjekt_soknader/i.test(msg2)) || /42p01/i.test(msg2)) {
        return NextResponse.json({ ok: false, feil: schemaFeil() }, { status: 500 })
      }
      return NextResponse.json({ ok: false, feil: "Kunne ikke hente prosjekt." }, { status: 400 })
    }
    row = (fallback.data as unknown as Record<string, unknown> | null) ?? null
  } else {
    row = (full.data as unknown as Record<string, unknown> | null) ?? null
  }

  if (!row) {
    return NextResponse.json({ ok: false, feil: "Fant ikke prosjekt." }, { status: 404 })
  }

  const paths = Array.isArray(row.vedlegg_paths) ? (row.vedlegg_paths as string[]) : []
  const signed = await Promise.all(
    paths.slice(0, 12).map(async (p) => {
      const { data } = await admin.storage.from(bucket).createSignedUrl(p, 60)
      return data?.signedUrl ?? null
    })
  )

  let hendelser: Record<string, unknown>[] | null = null
  const logRes = await admin
    .from("prosjekt_hendelser")
    .select("id, created_at, type, message")
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

