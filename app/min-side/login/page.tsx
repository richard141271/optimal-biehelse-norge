"use client"

import Link from "next/link"
import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

type Mode = "login" | "forgot" | "forgot-sent"

function cookieSerialize(
  name: string,
  value: string,
  options: {
    path?: string
    domain?: string
    expires?: Date
    maxAge?: number
    httpOnly?: boolean
    secure?: boolean
    sameSite?: true | false | "lax" | "strict" | "none"
  } = {}
) {
  const parts: string[] = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`]
  const p = options.path ?? "/"
  if (p) parts.push(`Path=${p}`)
  if (options.domain) parts.push(`Domain=${options.domain}`)
  if (options.maxAge && Number.isFinite(options.maxAge)) {
    parts.push(`Max-Age=${Math.floor(options.maxAge)}`)
  }
  if (options.expires && options.expires instanceof Date) {
    parts.push(`Expires=${options.expires.toUTCString()}`)
  }
  const isSecure = options.secure ?? (typeof window !== "undefined" && window.location.protocol === "https:")
  if (isSecure) parts.push("Secure")
  if (options.httpOnly) parts.push("HttpOnly")
  const ss = options.sameSite
  if (ss === "strict") parts.push("SameSite=Strict")
  else if (ss === "none") parts.push("SameSite=None")
  else parts.push("SameSite=Lax")
  return parts.join("; ")
}

function serializeCookie(
  name: string,
  value: string,
  options?: {
    path?: string
    domain?: string
    expires?: Date
    maxAge?: number
    httpOnly?: boolean
    secure?: boolean
    sameSite?: true | false | "lax" | "strict" | "none"
  }
) {
  try {
    document.cookie = cookieSerialize(name, value, options)
  } catch {}
}

function writeAuthCookiesFromSession(session: {
  access_token: string
  refresh_token: string
  expires_at?: number | null
}) {
  const access = String(session.access_token ?? "")
  const refresh = String(session.refresh_token ?? "")
  if (!access) return

  const expiresAt = session.expires_at && Number.isFinite(session.expires_at)
    ? new Date(session.expires_at * 1000)
    : new Date(Date.now() + 60 * 60 * 1000 * 24 * 7)

  serializeCookie("sb-access-token", access, { expires: expiresAt })
  serializeCookie("sb-refresh-token", refresh, { expires: expiresAt })
  try {
    const combined = encodeURIComponent(JSON.stringify([access, refresh]))
    serializeCookie("supabase-auth-token", combined, { expires: expiresAt })
  } catch {}
}



export default function MinSideLoginPage() {
  const [mode, setMode] = useState<Mode>("login")
  const [epost, setEpost] = useState("")
  const [passord, setPassord] = useState("")
  const [loading, setLoading] = useState(false)
  const [feil, setFeil] = useState<string | null>(null)
  const [suksess, setSuksess] = useState<string | null>(null)
  const epostRef = useRef<HTMLInputElement | null>(null)

  async function loggInn() {
    const email = (epostRef.current?.value ?? epost).trim().toLowerCase()
    const password = String(passord).trim()
    if (!email) {
      setSuksess(null)
      setFeil("Skriv inn e-post.")
      return
    }
    if (!password) {
      setSuksess(null)
      setFeil("Skriv inn passord.")
      return
    }
    if (loading) return

    setFeil(null)
    setSuksess(null)
    setLoading(true)
    try {
      const sb = createSupabaseBrowserClient()
      if (!sb) {
        throw new Error("Innlogging er ikke konfigurert (mangler miljøvariabler i frontend).")
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)
      const pending = sb.auth.signInWithPassword({ email, password })
      const wrapped = new Promise<typeof pending extends Promise<infer T> ? T : never>((resolve, reject) => {
        controller.signal.addEventListener("abort", () => reject(new Error("Innlogging tok for lang tid. Sjekk nettverket ditt og prøv igjen.")))
        pending.then(resolve, reject)
      })
      const { data, error } = await wrapped
      clearTimeout(timeout)

      if (error) throw error
      if (!data?.session) {
        throw new Error("Innlogging returnerte ingen sesjon. Prøv igjen.")
      }

      writeAuthCookiesFromSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at ?? null,
      })

      const url = new URL(window.location.href)
      const nextRaw = (url.searchParams.get("next") || "").trim()
      const next = nextRaw.startsWith("/") ? nextRaw : "/min-side"
      setTimeout(() => window.location.replace(next), 0)

    } catch (err) {
      const original = err instanceof Error ? err.message : String(err ?? "")
      const msg = original && /invalid|password|email/i.test(original)
        ? "Kunne ikke logge inn. Sjekk e-post og passord."
        : original && /abort|timeout|tok for lang/i.test(original)
          ? original
          : original || "Kunne ikke logge inn. Prøv igjen."
      try {
        console.error("[login]", err)
      } catch {}
      setFeil(msg)
    } finally {
      setLoading(false)
    }
  }



  async function sendGlemtPassord() {
    const email = (epostRef.current?.value ?? epost).trim().toLowerCase()
    if (!email) {
      setSuksess(null)
      setFeil("Skriv inn e-posten din så sender vi en lenke.")
      return
    }
    if (loading) return
    setFeil(null)
    setSuksess(null)
    setLoading(true)
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 20000)
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        cache: "no-store",
        signal: controller.signal,
      })
      clearTimeout(timeout)

      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        feil?: string
      }

      if (!res.ok || !payload.ok) {
        setFeil(payload.feil ?? "Kunne ikke sende lenke. Prøv igjen.")
        return
      }

      setMode("forgot-sent")
      setSuksess(
        "Hvis kontoen finnes, har vi sendt en lenke til deg på e-post. Sjekk søppelpost hvis du ikke ser den."
      )
    } catch {
      setFeil("Kunne ikke sende lenke. Prøv igjen.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle>Min side</CardTitle>
          <CardDescription>
            {mode === "forgot" || mode === "forgot-sent"
              ? "Få tilsendt en lenke for å angi nytt passord."
              : "Logg inn for å se medlemskortet ditt."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (mode === "forgot" || mode === "forgot-sent") {
                void sendGlemtPassord()
              } else {
                void loggInn()
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="epost">E-post</Label>
              <Input
                id="epost"
                name="email"
                type="email"
                autoComplete="username"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                ref={epostRef}
                value={epost}
                onChange={(e) => setEpost(e.target.value)}
                placeholder="navn@eksempel.no"
              />
            </div>

            {mode === "login" ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="passord">Passord</Label>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("forgot")
                      setFeil(null)
                      setSuksess(null)
                    }}
                    className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                  >
                    Glemt passord?
                  </button>
                </div>
                <Input
                  id="passord"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={passord}
                  onChange={(e) => setPassord(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            ) : null}

            {mode === "forgot" || mode === "forgot-sent" ? (
              <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                Vi viser ikke om en e-post finnes i systemet, for sikkerhetens skyld. Hvis
                e-posten er registrert, får du en lenke.
              </div>
            ) : null}

            {feil ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {feil}
              </div>
            ) : null}

            {suksess ? (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800">
                {suksess}
              </div>
            ) : null}

            <Button
              type="submit"
              disabled={loading}
              className="w-full"
            >
              {mode === "forgot" || mode === "forgot-sent"
                ? loading
                  ? "Sender lenke…"
                  : "Send lenke for nytt passord"
                : loading
                  ? "Logger inn…"
                  : "Logg inn"}
            </Button>
          </form>

          {mode === "forgot" || mode === "forgot-sent" ? (
            <div className="text-center text-sm">
              <button
                type="button"
                onClick={() => {
                  setMode("login")
                  setFeil(null)
                  setSuksess(null)
                }}
                className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                Tilbake til innlogging
              </button>
            </div>
          ) : null}

          <div className="space-y-1 text-center text-sm text-muted-foreground">
            <div>
              <Link href="/" className="hover:text-foreground">
                Til forsiden
              </Link>
            </div>
            <div>
              Trenger du hjelp?{" "}
              <a href="mailto:post@obno.no" className="underline underline-offset-4 hover:text-foreground">
                post@obno.no
              </a>
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
