import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export const runtime = "nodejs"

function absRedirectTo(slug: string) {
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    process.env.NEXT_PUBLIC_VERCEL_URL?.replace(/\/$/, "") ??
    "http://localhost:3000"
  return `${origin}${slug}`
}

export async function POST(request: Request) {
  let body: { email?: unknown }
  try {
    body = (await request.json()) as { email?: unknown }
  } catch {
    return NextResponse.json(
      { ok: false as const, feil: "Ugyldig forespørsel." },
      { status: 400 }
    )
  }

  const email = String(body.email ?? "").trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { ok: false as const, feil: "Skriv inn en gyldig e-post." },
      { status: 400 }
    )
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      {
        ok: false as const,
        feil: "Innlogging er ikke konfigurert (mangler miljøvariabler).",
      },
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

  const redirectTo = absRedirectTo("/auth/reset-password")
  try {
    await supabase.auth.resetPasswordForEmail(email, { redirectTo })
  } catch {
    return NextResponse.json(
      { ok: false as const, feil: "Kunne ikke sende e-post. Prøv igjen litt senere." },
      { status: 502 }
    )
  }

  return NextResponse.json(
    { ok: true as const },
    { headers: response.headers, status: 200 }
  )
}
