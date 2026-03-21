"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
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
  const router = useRouter()
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

    setStatus({ type: "sending" })
    const { error } = await sb.auth.signInWithPassword({ email, password })
    if (error) {
      setStatus({
        type: "error",
        message: "Kunne ikke logge inn. Sjekk e-post og passord.",
      })
      return
    }

    router.push(getNextPath())
    router.refresh()
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle>Min side</CardTitle>
          <CardDescription>Logg inn for å se medlemskortet ditt.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="epost">E-post</Label>
            <Input
              id="epost"
              type="email"
              autoComplete="email"
              value={epost}
              onChange={(e) => setEpost(e.target.value)}
              placeholder="navn@eksempel.no"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="passord">Passord</Label>
            <Input
              id="passord"
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
            onClick={loggInn}
            disabled={status.type === "sending" || !supabase}
            className="w-full"
          >
            {status.type === "sending" ? "Logger inn…" : "Logg inn"}
          </Button>

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

