import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { createClient } from "@supabase/supabase-js"

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

type DbError = { message?: string | null }
type AdminDb = {
  from: (table: string) => {
    insert: (values: Record<string, unknown>) => PromiseLike<{ error: DbError | null }>
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: string) => PromiseLike<{ error: DbError | null }>
    }
  }
}

async function ensureRole(
  admin: unknown,
  email: string,
  role: "admin" | "superadmin"
) {
  const db = admin as AdminDb
  const insertRes = await db.from("admin_roles").insert({ email, role })
  if (!insertRes.error) return { ok: true as const }

  const msg = String((insertRes.error as { message?: string } | null)?.message ?? "")
  if (/duplicate|unique|conflict/i.test(msg)) {
    const updateRes = await db
      .from("admin_roles")
      .update({ role })
      .eq("email", email)
    if (!updateRes.error) return { ok: true as const }
  }

  return { ok: false as const, errorMessage: msg }
}

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const bootstrapEmail = (process.env.ADMIN_BOOTSTRAP_EMAIL ?? "").trim().toLowerCase()

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { ok: false, feil: "Supabase er ikke konfigurert." },
      { status: 500 }
    )
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

  const email = (user?.email ?? "").trim().toLowerCase()
  if (!email || !isValidEmail(email)) {
    return NextResponse.json(
      { ok: false, feil: "Ikke innlogget." },
      { status: 401 }
    )
  }

  if (!serviceRoleKey) {
    return NextResponse.json(
      { ok: false, feil: "Admin-roller er ikke konfigurert." },
      { status: 500 }
    )
  }

  const schemaFeil =
    "Admin-roller i Supabase er ikke satt opp. Kjør denne SQL-en i Supabase (SQL Editor), og prøv igjen:\n\n" +
    "create table if not exists public.admin_roles (\n" +
    "  email text primary key,\n" +
    "  role text not null,\n" +
    "  created_at timestamptz not null default now()\n" +
    ");\n"

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { data, error } = await admin
    .from("admin_roles")
    .select("role")
    .ilike("email", email)
    .maybeSingle()

  if (error) {
    const msg = String((error as { message?: string } | null)?.message ?? "")
    if ((/relation/i.test(msg) && /admin_roles/i.test(msg)) || /42p01/i.test(msg)) {
      return NextResponse.json({ ok: false, feil: schemaFeil }, { status: 500 })
    }
    return NextResponse.json(
      { ok: false, feil: "Kunne ikke sjekke rettigheter." },
      { status: 400 }
    )
  }

  let role = (data?.role ?? null) as string | null

  if (!role && bootstrapEmail && email === bootstrapEmail) {
    const res = await ensureRole(admin, email, "superadmin")
    if (res.ok) {
      role = "superadmin"
    } else {
      return NextResponse.json(
        {
          ok: false,
          feil:
            "Kunne ikke sette superbruker. Sjekk at tabellen admin_roles har kolonnene email (unique) og role.",
        },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({ ok: true, email, role })
}
