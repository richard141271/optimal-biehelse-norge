import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@supabase/supabase-js"
import { hasAnyAdminAccess, normalizeRole, permissionsForRole } from "@/lib/roller"

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function findCookieByPrefix(
  all: Array<{ name: string; value: string }>,
  prefixes: string[]
): string {
  for (const c of all) {
    const n = c.name.toLowerCase()
    for (const p of prefixes) {
      if (n.startsWith(p.toLowerCase())) {
        const v = String(c.value || "").trim()
        if (v) return v
      }
    }
  }
  return ""
}

function findAccessTokenFromCookies(
  all: Array<{ name: string; value: string }>
): string {
  for (const c of all) {
    const name = c.name.toLowerCase()
    if (name === "sb-access-token" || name.endsWith("-sb-access-token")) {
      const v = String(c.value || "").trim()
      if (v) return v
    }
    if (name === "supabase-auth-token" || name.endsWith("-supabase-auth-token")) {
      const raw = String(c.value || "").trim()
      try {
        const parsed = JSON.parse(decodeURIComponent(raw)) as unknown[]
        const token = String((parsed as Array<unknown>)[0] ?? "").trim()
        if (token) return token
      } catch {}
    }
  }
  return ""
}

async function getAuth() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false as const, status: 500 as const, feil: "Supabase er ikke konfigurert." }
  }

  const all = (await cookies()).getAll()
  const accessToken =
    findAccessTokenFromCookies(all) || findCookieByPrefix(all, ["sb-access-token"])
  if (!accessToken) {
    return { ok: false as const, status: 401 as const, feil: "Ikke innlogget." }
  }

  try {
    const url = new URL(supabaseUrl)
    const res = await fetch(`${url.protocol}//${url.host}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    })
    const data = (await res.json().catch(() => ({}))) as {
      id?: unknown
      email?: unknown
    }
    if (!res.ok || !data.id) {
      return {
        ok: false as const,
        status: 401 as const,
        feil: "Innlogging er utløpt, logg inn på nytt.",
      }
    }
    const userId = String(data.id).trim()
    const email = String(data.email ?? "").trim().toLowerCase()
    if (!userId || !email || !isValidEmail(email)) {
      return {
        ok: false as const,
        status: 401 as const,
        feil: "Innloggingsbruker mangler e-post. Logg inn på nytt.",
      }
    }
    return { ok: true as const, userId, email, supabaseUrl }
  } catch {
    return {
      ok: false as const,
      status: 502 as const,
      feil: "Kunne ikke verifisere innlogging. Prøv igjen.",
    }
  }
}

export async function GET() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const auth = await getAuth()
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, feil: auth.feil },
      { status: auth.status }
    )
  }
  const { userId, email, supabaseUrl } = auth

  if (!serviceRoleKey) {
    return NextResponse.json(
      { ok: false, feil: "Admin er ikke konfigurert." },
      { status: 500 }
    )
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { data, error } = await admin
    .from("medlemmer")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle()

  if (error) {
    return NextResponse.json(
      { ok: false, feil: "Kunne ikke sjekke admin-tilgang." },
      { status: 400 }
    )
  }

  const ownerEmail = String(
    process.env.ADMIN_SUPERADMIN_EMAIL ?? process.env.ADMIN_BOOTSTRAP_EMAIL ?? ""
  )
    .trim()
    .toLowerCase()
  const role = ownerEmail && email === ownerEmail ? "superadmin" : normalizeRole(data?.role)
  if (!hasAnyAdminAccess(role)) {
    return NextResponse.json(
      { ok: false, feil: "Ingen adminrolle tilgjengelig." },
      { status: 403 }
    )
  }

  return NextResponse.json({
    ok: true,
    email,
    userId,
    role,
    permissions: permissionsForRole(role),
  })
}

