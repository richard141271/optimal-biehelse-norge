"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

type State =
  | { type: "loading" }
  | { type: "error"; message: string; status?: number }
  | { type: "ready"; role: "admin" | "superadmin" }

export default function AdminHomePage() {
  const [state, setState] = useState<State>({ type: "loading" })

  useEffect(() => {
    const id = setTimeout(() => {
      ;(async () => {
        const res = await fetch("/api/admin/me", { cache: "no-store" })
        if (!res.ok) {
          setState({
            type: "error",
            message:
              res.status === 401
                ? "Du er ikke innlogget."
                : "Kunne ikke sjekke tilgang.",
            status: res.status,
          })
          return
        }
        const data = (await res.json()) as { email?: string; role?: string | null }
        const role = data.role ?? null
        if (role !== "admin" && role !== "superadmin") {
          setState({
            type: "error",
            message: "Du er innlogget, men har ikke tilgang til admin.",
          })
          return
        }
        setState({ type: "ready", role })
      })()
    }, 0)
    return () => clearTimeout(id)
  }, [])

  if (state.type === "loading") {
    return (
      <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
        Laster…
      </div>
    )
  }

  if (state.type === "error") {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">
          {state.message}
        </div>
        {state.status === 401 ? (
          <Link href="/admin/login" className="text-sm underline underline-offset-4">
            Gå til innlogging
          </Link>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Oversikt</h1>
        <p className="text-muted-foreground">
          Administrer medlemsregister, prosjekter og regnskap.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/admin/medlemmer"
          className="rounded-xl border bg-card p-5 hover:bg-muted/40"
        >
          <div className="text-sm font-medium">Medlemsregister</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Søk, filtrer og få oversikt over registreringer.
          </div>
        </Link>
        <Link
          href="/admin/prosjekter"
          className="rounded-xl border bg-card p-5 hover:bg-muted/40"
        >
          <div className="text-sm font-medium">Prosjekter</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Se innsendte prosjektforslag fra medlemmer.
          </div>
        </Link>
        <Link
          href="/admin/regnskap"
          className="rounded-xl border bg-card p-5 hover:bg-muted/40"
        >
          <div className="text-sm font-medium">Regnskap</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Registrer inntekter/utgifter og legg ved bilag.
          </div>
        </Link>
        {state.role === "superadmin" ? (
          <Link
            href="/admin/tilgang"
            className="rounded-xl border bg-card p-5 hover:bg-muted/40"
          >
            <div className="text-sm font-medium">Tilgang</div>
            <div className="mt-1 text-sm text-muted-foreground">
              Gi og fjern admin-rettigheter.
            </div>
          </Link>
        ) : null}
      </div>
    </div>
  )
}
