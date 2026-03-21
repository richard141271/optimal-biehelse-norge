"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
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
  | { type: "success"; message: string }
  | { type: "error"; message: string }

export default function AdminLoginPage() {
  const router = useRouter()
  const [nextPath, setNextPath] = useState("/admin")

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search)
      const raw = (sp.get("next") || "/admin").trim()
      setNextPath(raw.startsWith("/") ? raw : "/admin")
    } catch {
      setNextPath("/admin")
    }
  }, [])

  const supabase = useMemo(() => createSupabaseBrowserClient(), [])

  const [epost, setEpost] = useState("")
  const [passord, setPassord] = useState("")
  const [status, setStatus] = useState<Status>({ type: "idle" })

  async function loggInnMedPassord() {
    if (!supabase) {
      setStatus({
        type: "error",
        message: "Supabase er ikke konfigurert (mangler miljøvariabler).",
      })
      return
    }
    const email = epost.trim()
    if (!email) {
      setStatus({ type: "error", message: "Skriv inn e-post." })
      return
    }
    if (!passord) {
      setStatus({ type: "error", message: "Skriv inn passord." })
      return
    }

    setStatus({ type: "sending" })
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: passord,
    })

    if (error) {
      setStatus({
        type: "error",
        message: "Kunne ikke logge inn. Sjekk e-post og passord.",
      })
      return
    }

    router.push(nextPath)
    router.refresh()
  }

  async function sendInnloggingslenke() {
    if (!supabase) {
      setStatus({
        type: "error",
        message: "Supabase er ikke konfigurert (mangler miljøvariabler).",
      })
      return
    }
    const email = epost.trim()
    if (!email) {
      setStatus({ type: "error", message: "Skriv inn e-post." })
      return
    }

    setStatus({ type: "sending" })
    const origin =
      typeof window === "undefined" ? "" : window.location.origin
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${origin}${nextPath}`,
      },
    })

    if (error) {
      setStatus({
        type: "error",
        message: "Kunne ikke sende innloggingslenke akkurat nå.",
      })
      return
    }

    setStatus({
      type: "success",
      message: "Sjekk e-posten din for innloggingslenke.",
    })
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle>Admin</CardTitle>
          <CardDescription>
            Logg inn for å administrere medlemsregister og regnskap.
          </CardDescription>
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
              placeholder="navn@obno.no"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="passord">Passord (valgfritt)</Label>
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

          {status.type === "success" ? (
            <div className="rounded-lg border bg-muted px-3 py-2 text-sm">
              {status.message}
            </div>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              onClick={loggInnMedPassord}
              disabled={status.type === "sending" || !supabase}
              className="w-full"
            >
              Logg inn
            </Button>
            <Button
              variant="outline"
              onClick={sendInnloggingslenke}
              disabled={status.type === "sending" || !supabase}
              className="w-full"
            >
              Send lenke
            </Button>
          </div>

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
