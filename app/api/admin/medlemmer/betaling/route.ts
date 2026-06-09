import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { createClient } from "@supabase/supabase-js"
import { hasPermission, normalizeRole } from "@/lib/roller"
import {
  ensureRegnskapForMembership,
  removeRegnskapForMembership,
} from "@/lib/medlemskontingent-regnskap"

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
}

async function getRole() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return { ok: false as const, status: 500 as const }
  }

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
  const email = (user?.email ?? "").trim().toLowerCase()
  if (!userId || !email) return { ok: false as const, status: 401 as const }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { data, error } = await admin
    .from("medlemmer")
    .select("role, aktiv")
    .eq("user_id", userId)
    .maybeSingle()

  if (error) {
    const msg = String((error as { message?: string } | null)?.message ?? "")
    if (/column/i.test(msg) && /user_id/i.test(msg)) {
      return {
        ok: false as const,
        status: 500 as const,
        feil:
          "Medlemsregister-tabellen mangler feltet user_id. Kjør dette i Supabase (SQL Editor):\n\n" +
          "alter table public.medlemmer add column if not exists user_id uuid;",
      }
    }
    if (/column/i.test(msg) && (/aktiv/i.test(msg) || /utmeldt_at/i.test(msg))) {
      return {
        ok: false as const,
        status: 500 as const,
        feil:
          "Medlemsregister-tabellen mangler felt for inn-/utmelding. Kjør dette i Supabase (SQL Editor):\n\n" +
          "alter table public.medlemmer add column if not exists aktiv boolean not null default true;\n" +
          "alter table public.medlemmer add column if not exists utmeldt_at timestamptz;",
      }
    }
    return { ok: false as const, status: 400 as const }
  }
  const ownerEmail = String(
    process.env.ADMIN_SUPERADMIN_EMAIL ?? process.env.ADMIN_BOOTSTRAP_EMAIL ?? ""
  )
    .trim()
    .toLowerCase()
  const role = ownerEmail && email === ownerEmail ? "superadmin" : normalizeRole(data?.role)
  if (data?.aktiv === false) {
    return { ok: false as const, status: 403 as const }
  }
  if (!hasPermission(role, "mark_membership_payment")) {
    return { ok: false as const, status: 403 as const }
  }

  return { ok: true as const, admin, role }
}

export async function PATCH(request: Request) {
  const gate = await getRole()
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, feil: "feil" in gate ? gate.feil : undefined },
      { status: gate.status }
    )
  }

  let payload: { medlemId?: string; betalt?: boolean }
  try {
    payload = (await request.json()) as { medlemId?: string; betalt?: boolean }
  } catch {
    return NextResponse.json({ ok: false, feil: "Ugyldig JSON." }, { status: 400 })
  }

  const medlemId = String(payload.medlemId ?? "").trim()
  const betalt = payload.betalt === true

  const isNumericId = /^\d+$/.test(medlemId)
  if (!isUuid(medlemId) && !isNumericId) {
    return NextResponse.json(
      { ok: false, feil: "Ugyldig medlem-id." },
      { status: 400 }
    )
  }
  const medlemIdValue = isNumericId ? Number(medlemId) : medlemId
  const { data: existingMember, error: memberError } = await gate.admin
    .from("medlemmer")
    .select("id, medlemsnummer, medlemskap_type, navn, epost, aktiv, kontingent_betalt_at, kontingent_gyldig_til")
    .eq("id", medlemIdValue)
    .maybeSingle()

  if (memberError) {
    return NextResponse.json(
      { ok: false, feil: "Kunne ikke hente medlem." },
      { status: 400 }
    )
  }

  if (!existingMember?.id) {
    return NextResponse.json(
      { ok: false, feil: "Fant ikke medlemmet." },
      { status: 404 }
    )
  }

  if (betalt) {
    const now = new Date()
    const gyldigTil = new Date(now)
    gyldigTil.setFullYear(gyldigTil.getFullYear() + 1)

    const { error } = await gate.admin
      .from("medlemmer")
      .update({
        kontingent_betalt_at: now.toISOString(),
        kontingent_gyldig_til: gyldigTil.toISOString(),
      })
      .eq("id", medlemIdValue)
      .or("aktiv.is.null,aktiv.eq.true")

    if (error) {
      const msg = String((error as { message?: string } | null)?.message ?? "")
      if (/column/i.test(msg) && /aktiv/i.test(msg)) {
        return NextResponse.json(
          {
            ok: false,
            feil:
              "Medlemsregister-tabellen mangler feltet aktiv. Kjør dette i Supabase (SQL Editor):\n\n" +
              "alter table public.medlemmer add column if not exists aktiv boolean not null default true;",
          },
          { status: 500 }
        )
      }
      return NextResponse.json(
        { ok: false, feil: "Kunne ikke lagre betaling." },
        { status: 400 }
      )
    }

    const regnskap = await ensureRegnskapForMembership(gate.admin, {
      ...existingMember,
      kontingent_betalt_at: now.toISOString(),
      kontingent_gyldig_til: gyldigTil.toISOString(),
    })
    if (!regnskap.ok) {
      return NextResponse.json(
        { ok: false, feil: regnskap.feil },
        { status: regnskap.status }
      )
    }

    return NextResponse.json({ ok: true })
  }

  const { error } = await gate.admin
    .from("medlemmer")
    .update({
      kontingent_betalt_at: null,
      kontingent_gyldig_til: null,
    })
    .eq("id", medlemIdValue)
    .or("aktiv.is.null,aktiv.eq.true")

  if (error) {
    const msg = String((error as { message?: string } | null)?.message ?? "")
    if (/column/i.test(msg) && /aktiv/i.test(msg)) {
      return NextResponse.json(
        {
          ok: false,
          feil:
            "Medlemsregister-tabellen mangler feltet aktiv. Kjør dette i Supabase (SQL Editor):\n\n" +
            "alter table public.medlemmer add column if not exists aktiv boolean not null default true;",
        },
        { status: 500 }
      )
    }
    return NextResponse.json(
      { ok: false, feil: "Kunne ikke fjerne betaling." },
      { status: 400 }
    )
  }

  const regnskap = await removeRegnskapForMembership(gate.admin, existingMember)
  if (!regnskap.ok) {
    return NextResponse.json(
      { ok: false, feil: regnskap.feil },
      { status: regnskap.status }
    )
  }

  return NextResponse.json({ ok: true })
}
