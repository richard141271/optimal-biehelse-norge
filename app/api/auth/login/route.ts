import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export const runtime = "nodejs"

function copyCookies(from: NextResponse, to: NextResponse) {
  try {
    for (const cookie of from.cookies.getAll()) {
      const opts: {
        path?: string
        domain?: string
        sameSite?: "strict" | "lax" | "none"
        secure?: boolean
        httpOnly?: boolean
        expires?: Date
        maxAge?: number
        priority?: "low" | "medium" | "high"
        partitioned?: boolean
      } = {}
      if ("path" in cookie && (cookie as unknown as { path?: string }).path) {
        opts.path = (cookie as unknown as { path?: string }).path
      }
      if ("domain" in cookie && (cookie as unknown as { domain?: string }).domain) {
        opts.domain = (cookie as unknown as { domain?: string }).domain
      }
      if ("sameSite" in cookie && (cookie as unknown as { sameSite?: string }).sameSite) {
        const s = (cookie as unknown as { sameSite?: string }).sameSite ?? "lax"
        if (s === "strict" || s === "lax" || s === "none") opts.sameSite = s as "strict" | "lax" | "none"
      } else {
        opts.sameSite = "lax"
      }
      if ("secure" in cookie && typeof (cookie as unknown as { secure?: boolean }).secure === "boolean") {
        opts.secure = (cookie as unknown as { secure?: boolean }).secure
      } else {
        opts.secure = process.env.NODE_ENV === "production"
      }
      if ("httpOnly" in cookie && typeof (cookie as unknown as { httpOnly?: boolean }).httpOnly === "boolean") {
        opts.httpOnly = (cookie as unknown as { httpOnly?: boolean }).httpOnly
      }
      if ("expires" in cookie && (cookie as unknown as { expires?: Date }).expires) {
        opts.expires = (cookie as unknown as { expires?: Date }).expires
      }
      if ("maxAge" in cookie && typeof (cookie as unknown as { maxAge?: number }).maxAge === "number") {
        opts.maxAge = (cookie as unknown as { maxAge?: number }).maxAge
      }
      to.cookies.set({ name: cookie.name, value: cookie.value, ...opts })
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
    request: { headers: request.headers },
  })

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieResponse.cookies.set(name, value, options)
        }
      },
    },
  })

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error || !data?.session) {
    const msg = String(error?.message || "").trim()
    const fallback = msg && /invalid|password|email/i.test(msg)
      ? "Kunne ikke logge inn. Sjekk e-post og passord."
      : "Kunne ikke logge inn. Sjekk e-post og passord."
    return NextResponse.json(
      { ok: false as const, feil: msg || fallback },
      { status: 401 }
    )
  }

  const finalResponse = NextResponse.json(
    { ok: true as const, next },
    { status: 200, headers: { "x-obno-auth": "ok" } }
  )
  copyCookies(cookieResponse, finalResponse)
  return finalResponse
}

