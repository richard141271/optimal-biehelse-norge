import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export const runtime = "nodejs"

export async function POST(request: Request) {
  let body: { password?: unknown }
  try {
    body = (await request.json()) as { password?: unknown }
  } catch {
    return NextResponse.json(
      { ok: false as const, feil: "Ugyldig forespørsel." },
      { status: 400 }
    )
  }

  const password = String(body.password ?? "")
  if (!password || password.length < 6) {
    return NextResponse.json(
      { ok: false as const, feil: "Passordet må være minst 6 tegn." },
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

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    return NextResponse.json(
      {
        ok: false as const,
        feil:
          error.name === "AuthSessionMissingError" ||
          /session/i.test(error.message || "")
            ? "Lenken er utløpt eller ugyldig. Be om en ny glemt passord-lenke."
            : "Kunne ikke endre passord. Prøv igjen.",
      },
      { status: 400 }
    )
  }

  return NextResponse.json({ ok: true as const }, { headers: response.headers })
}
