import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export const runtime = "nodejs"

function firstNonEmpty(...vals: Array<string | undefined>) {
  for (const v of vals) {
    const t = String(v ?? "").trim()
    if (t) return t
  }
  return ""
}

function ensureAbsoluteOrigin(
  candidate: string,
  fallbackHost: string
): { origin: string; kind: string } {
  const raw = String(candidate ?? "").trim()
  if (/^https?:\/\//i.test(raw)) {
    const u = new URL(raw)
    return { origin: `${u.protocol}//${u.host}`, kind: "explicit" }
  }
  const host = raw || fallbackHost || "obno.no"
  return { origin: `https://${host}`, kind: "derived" }
}

function absRedirectTo(slug: string) {
  const hostFromSiteUrl = firstNonEmpty(
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_VERCEL_URL,
    process.env.VERCEL_URL,
    process.env.NEXT_PUBLIC_HOST,
    process.env.HOST
  )
  const fallback = firstNonEmpty(
    process.env.VERCEL_BRANCH_URL,
    process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL
  )
  const { origin } = ensureAbsoluteOrigin(hostFromSiteUrl, fallback)
  return `${origin}${slug.startsWith("/") ? slug : `/${slug}`}`
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
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    if (error) {
      const msg = String(error.message || "").trim()
      if (/redirect|redirectTo|url/i.test(msg)) {
        return NextResponse.json(
          {
            ok: false as const,
            feil: `Tilbakelenken er ikke tillatt for din Supabase e-postmal: ${redirectTo}`,
          },
          { status: 502 }
        )
      }
      if (/email/i.test(msg) || /rate|overuse|quota/i.test(msg)) {
        return NextResponse.json(
          {
            ok: false as const,
            feil:
              "Kunne ikke sende e-post akkurat nå. Prøv igjen litt senere, eller kontakt post@obno.no om det vedvarer.",
          },
          { status: 502 }
        )
      }
      return NextResponse.json(
        { ok: false as const, feil: "Kunne ikke sende e-post. Prøv igjen litt senere." },
        { status: 502 }
      )
    }
  } catch (err) {
    const msg = String((err as { message?: unknown } | null)?.message || "").trim()
    return NextResponse.json(
      {
        ok: false as const,
        feil: msg
          ? `Kunne ikke sende e-post: ${msg}`
          : "Kunne ikke sende e-post. Prøv igjen litt senere.",
      },
      { status: 502 }
    )
  }

  return NextResponse.json(
    { ok: true as const },
    { headers: response.headers, status: 200 }
  )
}

