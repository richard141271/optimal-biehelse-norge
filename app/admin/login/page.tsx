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
  | { type: "error"; message: string }
  | { type: "info"; message: string }

function supabaseErrorMessage(message: string | undefined) {
  const m = (message ?? "").toLowerCase()
  if (!m) return "Noe gikk galt."
  if (m.includes("invalid login credentials")) return "Feil e-post eller passord."
  if (m.includes("signup requires a valid password"))
    return "Passordet er ikke gyldig (minst 8 tegn)."
  return message ?? "Noe gikk galt."
}

export default function AdminLoginPage() {
  const router = useRouter()
  function getNextPath() {
    try {
      const sp = new URLSearchParams(window.location.search)
      const raw = (sp.get("next") || "/admin").trim()
      return raw.startsWith("/") ? raw : "/admin"
    } catch {
      return "/admin"
    }
  }

  const supabase = useMemo(() => createSupabaseBrowserClient(), [])

  const [epost, setEpost] = useState("")
  const [passord, setPassord] = useState("")
  const [status, setStatus] = useState<Status>({ type: "idle" })
  const [innloggetEpost, setInnloggetEpost] = useState<string | null>(null)

  useEffect(() => {
    const id = setTimeout(() => {
      ;(async () => {
        try {
          const sp = new URLSearchParams(window.location.search)
          const feil = (sp.get("feil") ?? "").trim()
          if (feil === "ingen-tilgang") {
            setStatus({
              type: "info",
              message:
                "Du er innlogget, men har ikke admin-tilgang. Be en superbruker gi deg rolle i Admin → Tilgang.",
            })
          }
          const res = await fetch("/api/admin/me", { cache: "no-store" })
          const data = (await res.json()) as {
            ok?: boolean
            role?: string | null
            email?: string | null
          }
          const role = data.role ?? null
          const email = (data.email ?? "").trim()
          if (res.ok && data.ok && email) {
            setInnloggetEpost(email)
          } else {
            setInnloggetEpost(null)
          }
          if (res.ok && data.ok && (role === "admin" || role === "superadmin")) {
            router.replace(getNextPath())
            router.refresh()
          }
        } catch {}
      })()
    }, 0)
    return () => clearTimeout(id)
  }, [router])

  async function provBootstrap() {
    setStatus({ type: "sending" })
    try {
      const res = await fetch("/api/admin/bootstrap", { method: "POST" })
      const data = (await res.json()) as { ok?: boolean; feil?: string }
      if (res.ok && data.ok) {
        router.replace(getNextPath())
        router.refresh()
        return
      }
      setStatus({
        type: "error",
        message:
          data.feil ??
          "Du har ikke admin-tilgang. Be en superbruker gi deg rolle i Admin → Tilgang.",
      })
    } catch {
      setStatus({ type: "error", message: "Kunne ikke sette opp admin-tilgang." })
    }
  }

  async function loggInn() {
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

    const password = passord.trim()
    if (!password) {
      setStatus({ type: "error", message: "Skriv inn passord." })
      return
    }

    setStatus({ type: "sending" })
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setStatus({
        type: "error",
        message: supabaseErrorMessage(error.message),
      })
      return
    }

    try {
      const res = await fetch("/api/admin/me", { cache: "no-store" })
      const data = (await res.json()) as {
        ok?: boolean
        role?: string | null
        email?: string | null
      }
      const role = data.role ?? null
      const loggedInEmail = (data.email ?? "").trim()
      setInnloggetEpost(loggedInEmail || null)
      if (res.ok && data.ok && (role === "admin" || role === "superadmin")) {
        router.push(getNextPath())
        router.refresh()
        return
      }
    } catch {}

    await provBootstrap()
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle>Admin</CardTitle>
          <CardDescription>
            Logg inn med samme e-post og passord som på Min side.
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

          {status.type === "error" || status.type === "info" ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {status.message}
            </div>
          ) : null}

          <div className="grid gap-2">
            <Button
              onClick={loggInn}
              disabled={status.type === "sending" || !supabase}
              className="w-full"
            >
              Logg inn
            </Button>
            {innloggetEpost ? (
              <>
                <Button
                  variant="outline"
                  onClick={provBootstrap}
                  disabled={status.type === "sending"}
                  className="w-full"
                >
                  Gjør meg til superbruker
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (!supabase) return
                    await supabase.auth.signOut()
                    setInnloggetEpost(null)
                    setStatus({ type: "idle" })
                    router.refresh()
                  }}
                  disabled={status.type === "sending" || !supabase}
                  className="w-full"
                >
                  Logg ut
                </Button>
              </>
            ) : null}
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
