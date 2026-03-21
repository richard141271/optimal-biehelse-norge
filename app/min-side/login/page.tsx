"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
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

type Status =
  | { type: "idle" }
  | { type: "sending" }
  | { type: "error"; message: string }

export default function MinSideLoginPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const [epost, setEpost] = useState("")
  const [passord, setPassord] = useState("")
  const [status, setStatus] = useState<Status>({ type: "idle" })

  function getNextPath() {
    try {
      const sp = new URLSearchParams(window.location.search)
      const raw = (sp.get("next") || "/min-side").trim()
      return raw.startsWith("/") ? raw : "/min-side"
    } catch {
      return "/min-side"
    }
  }

  useEffect(() => {
    const id = setTimeout(() => {
      ;(async () => {
        const sb = supabase
        if (!sb) return
        try {
          const { data } = await sb.auth.getSession()
          if (data.session) {
            const next = getNextPath()
            window.location.assign(next)
          }
        } catch {}
      })()
    }, 0)
    return () => clearTimeout(id)
  }, [supabase])

  async function loggInn() {
    const sb = supabase
    if (!sb) {
      setStatus({
        type: "error",
        message: "Supabase er ikke konfigurert (mangler miljøvariabler).",
      })
      return
    }

    const email = epost.trim()
    const password = passord.trim()
    if (!email) {
      setStatus({ type: "error", message: "Skriv inn e-post." })
      return
    }
    if (!password) {
      setStatus({ type: "error", message: "Skriv inn passord." })
      return
    }

    if (status.type === "sending") return

    setStatus({ type: "sending" })
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 15000)
      )
      const { error } = await Promise.race([
        sb.auth.signInWithPassword({ email, password }),
        timeout,
      ])

      if (error) {
        setStatus({
          type: "error",
          message: "Kunne ikke logge inn. Sjekk e-post og passord.",
        })
        return
      }

      const next = getNextPath()
      window.location.assign(next)
    } catch {
      setStatus({
        type: "error",
        message: "Innlogging tok for lang tid. Prøv igjen.",
      })
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle>Min side</CardTitle>
          <CardDescription>Logg inn for å se medlemskortet ditt.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              void loggInn()
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
                value={epost}
                onChange={(e) => setEpost(e.target.value)}
                placeholder="navn@eksempel.no"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="passord">Passord</Label>
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

            {status.type === "error" ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {status.message}
              </div>
            ) : null}

            <Button
              type="submit"
              disabled={status.type === "sending" || !supabase}
              className="w-full"
            >
              {status.type === "sending" ? "Logger inn…" : "Logg inn"}
            </Button>
          </form>

          <div className="text-center text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground">
              Til forsiden
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
