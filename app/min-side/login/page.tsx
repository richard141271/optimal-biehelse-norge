"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
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

export default function MinSideLoginPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const [epost, setEpost] = useState("")
  const [passord, setPassord] = useState("")
  const [loading, setLoading] = useState(false)
  const [feil, setFeil] = useState<string | null>(null)
  const epostRef = useRef<HTMLInputElement | null>(null)
  const passordRef = useRef<HTMLInputElement | null>(null)

  async function sjekkAdminOgRedirect() {
    try {
      const res = await fetch("/api/admin/me", { cache: "no-store" })
      const data = (await res.json()) as {
        ok?: boolean
        feil?: string
        role?: string | null
      }
      if (res.ok && data.ok && (data.role === "admin" || data.role === "superadmin")) {
        window.location.href = "/admin"
        return
      }
      setFeil(data.feil ?? "Du har ikke tilgang til admin.")
    } catch {
      setFeil("Kunne ikke sjekke admin-tilgang.")
    }
  }

  useEffect(() => {
    const id = setTimeout(() => {
      ;(async () => {
        const sb = supabase
        if (!sb) return
        try {
          setEpost(epostRef.current?.value ?? "")
          setPassord(passordRef.current?.value ?? "")
          const { data } = await sb.auth.getSession()
          if (data.session) await sjekkAdminOgRedirect()
        } catch {}
      })()
    }, 0)
    return () => clearTimeout(id)
  }, [supabase])

  async function loggInn() {
    const sb = supabase
    if (!sb) {
      setFeil("Supabase er ikke konfigurert (mangler miljøvariabler).")
      return
    }

    const email = (epostRef.current?.value ?? epost).trim()
    const password = (passordRef.current?.value ?? passord).trim()
    if (!email) {
      setFeil("Skriv inn e-post.")
      return
    }
    if (!password) {
      setFeil("Skriv inn passord.")
      return
    }

    if (loading) return

    setFeil(null)
    setLoading(true)
    try {
      const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("timeout")), 15000)
      })

      const { data, error } = (await Promise.race([
        sb.auth.signInWithPassword({ email, password }),
        timeout,
      ])) as Awaited<ReturnType<typeof sb.auth.signInWithPassword>>

      if (error || !data?.session) {
        setFeil("Kunne ikke logge inn. Sjekk e-post og passord.")
        return
      }

      await sjekkAdminOgRedirect()
    } catch {
      setFeil("Innlogging tok for lang tid. Prøv igjen.")
    } finally {
      setLoading(false)
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
                ref={epostRef}
                value={epost}
                onChange={(e) => setEpost(e.target.value)}
                onInput={(e) => setEpost((e.target as HTMLInputElement).value)}
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
                ref={passordRef}
                value={passord}
                onChange={(e) => setPassord(e.target.value)}
                onInput={(e) => setPassord((e.target as HTMLInputElement).value)}
                placeholder="••••••••"
              />
            </div>

            {feil ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {feil}
              </div>
            ) : null}

            <Button
              type="submit"
              disabled={loading || !supabase}
              className="w-full"
            >
              {loading ? "Logger inn…" : "Logg inn"}
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
