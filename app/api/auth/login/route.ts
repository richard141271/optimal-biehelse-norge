import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export const runtime = "nodejs"

function mergeSetCookieHeaders(from: Headers, to: NextResponse) {
  try {
    const setCookies = from.getSetCookie()
    for (const raw of setCookies) {
      to.headers.append("set-cookie", raw)
    }
  } catch {}
}

export async function POST(request: NextRequest) {
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
  const cookieResponse = NextResponse.next({
    request: { headers: new Headers(request.headers) },
  })

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieResponse.cookies.set(name, value, {
            path: "/",
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            httpOnly: false,
            ...options,
          })
        }
      },
    },
  })

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error || !data?.session) {
    const msg = String(error?.message || "").trim()
    return NextResponse.json(
      {
        ok: false as const,
        feil: msg && /invalid|password|email/i.test(msg)
          ? "Kunne ikke logge inn. Sjekk e-post og passord."
          : msg || "Kunne ikke logge inn. Sjekk e-post og passord.",
      },
      { status: 401 }
    )
  }

  const finalResponse = NextResponse.json(
    { ok: true as const, next },
    { status: 200, headers: { "x-obno-auth": "ok" } }
  )
  mergeSetCookieHeaders(cookieResponse.headers, finalResponse)
  return finalResponse
}


