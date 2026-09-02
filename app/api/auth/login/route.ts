import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export const runtime = "nodejs"

export async function POST(request: Request) {
  let body: { email?: unknown; password?: unknown; next?: unknown }
  try {
    body = (await request.json()) as { email?: unknown; password?: unknown; next?: unknown }
  } catch {
    return NextResponse.json(
      { ok: false as const, feil: "Ugyldig forespørsel." },
      { status: 400 }
    )
  }

  const email = String(body.email ?? "").trim().toLowerCase()
  const password = String(body.password ?? "")
  const nextRaw = String(body.next ?? "").trim()
  const next = nextRaw.startsWith("/") ? nextRaw : "/min-side"

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { ok: false as const, feil: "Skriv inn en gyldig e-post." },
      { status: 400 }
    )
  }
  if (!password) {
    return NextResponse.json(
      { ok: false as const, feil: "Skriv inn passord." },
      { status: 400 }
    )
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { ok: false as const, feil: "Innlogging er ikke konfigurert (mangler miljøvariabler)." },
      { status: 500 }
    )
  }

  const cookieStore = await cookies()
  const response = NextResponse.next()

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error || !data?.session) {
    return NextResponse.json(
      { ok: false as const, feil: "Kunne ikke logge inn. Sjekk e-post og passord." },
      { status: 401 }
    )
  }

  return NextResponse.json({ ok: true as const, next }, { headers: response.headers })
}
