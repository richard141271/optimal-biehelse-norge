"use client"

import Link from "next/link"
import { useMemo, useRef, useState } from "react"
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

export default function MinSideLoginPage() {
  const [mode, setMode] = useState<Mode>("login")
  const [epost, setEpost] = useState("")
  const [passord, setPassord] = useState("")
  const [loading, setLoading] = useState(false)
  const [feil, setFeil] = useState<string | null>(null)
  const [suksess, setSuksess] = useState<string | null>(null)
  const epostRef = useRef<HTMLInputElement | null>(null)

  const nextParam = useMemo(() => {
    if (typeof window === "undefined") return ""
    const url = new URL(window.location.href)
    const n = url.searchParams.get("next")
    return n && n.startsWith("/") ? n : "/min-side"
  }, [])

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
        setFeil("Innlogging er ikke konfigurert (mangler miljøvariabler).")
        return
      }

      const { data, error } = await sb.auth.signInWithPassword({ email, password })
      if (error || !data?.session) {
        const msg = String(error?.message || "").trim()
        setFeil(
          msg && /invalid|password|email/i.test(msg)
            ? "Kunne ikke logge inn. Sjekk e-post og passord."
            : msg || "Kunne ikke logge inn. Sjekk e-post og passord."
        )
        return
      }

      window.location.href = nextParam
    } catch {
      setFeil("Kunne ikke logge inn. Prøv igjen.")
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
