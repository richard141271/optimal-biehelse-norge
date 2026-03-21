"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Prosjekt = {
  id: string
  created_at?: string
  medlemsnummer?: number | null
  navn?: string
  epost?: string
  telefon?: string | null
  tittel?: string
  sted?: string
  budsjett?: number | null
  status?: string | null
}

type State =
  | { type: "loading" }
  | { type: "error"; message: string }
  | { type: "ready"; prosjekter: Prosjekt[] }

function formatDato(value?: string) {
  if (!value) return ""
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  return new Intl.DateTimeFormat("nb-NO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
}

function formatBelop(value?: number | null) {
  if (value === null || value === undefined) return ""
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
  }).format(value)
}

export default function AdminProsjekterPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const [state, setState] = useState<State>({ type: "loading" })
  const [query, setQuery] = useState("")

  const hent = useCallback(async () => {
    const sb = supabase
    if (!sb) {
      setState({
        type: "error",
        message: "Supabase er ikke konfigurert (mangler miljøvariabler).",
      })
      return
    }
    setState({ type: "loading" })
    const { data, error } = await sb
      .from("prosjekt_soknader")
      .select(
        "id, created_at, medlemsnummer, navn, epost, telefon, tittel, sted, budsjett, status"
      )
      .order("created_at", { ascending: false })
      .limit(500)

    if (error) {
      setState({
        type: "error",
        message:
          "Kunne ikke hente prosjekter. Sjekk at tabellen finnes og at tilgang er satt opp i Supabase.",
      })
      return
    }

    setState({ type: "ready", prosjekter: (data ?? []) as Prosjekt[] })
  }, [supabase])

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
          })
          return
        }
        const data = (await res.json()) as { role?: string | null }
        const role = data.role ?? null
        if (role !== "admin" && role !== "superadmin") {
          setState({
            type: "error",
            message: "Du har ikke tilgang til admin.",
          })
          return
        }
        await hent()
      })()
    }, 0)
    return () => clearTimeout(id)
  }, [hent])

  const filtered =
    state.type === "ready"
      ? state.prosjekter.filter((p) => {
          const hay = `${p.tittel ?? ""} ${p.sted ?? ""} ${p.navn ?? ""} ${p.epost ?? ""} ${p.medlemsnummer ?? ""} ${p.status ?? ""}`
            .toLowerCase()
            .trim()
          const q = query.toLowerCase().trim()
          if (!q) return true
          return hay.includes(q)
        })
      : []

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Prosjekter</h1>
          <p className="text-muted-foreground">
            Innsendte prosjektforslag fra medlemmer.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={hent} disabled={!supabase}>
            Oppdater
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Søk på tittel, sted, navn, medlemsnummer eller status"
          className="sm:max-w-sm"
        />
        <div className="text-sm text-muted-foreground">
          {state.type === "ready" ? `${filtered.length} treff` : ""}
        </div>
      </div>

      {state.type === "loading" ? (
        <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          Laster prosjekter…
        </div>
      ) : null}

      {state.type === "error" ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">
          {state.message}
        </div>
      ) : null}

      {state.type === "ready" ? (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 text-left font-medium">
                    Dato
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-left font-medium">
                    Tittel
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-left font-medium">
                    Sted
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-left font-medium">
                    Medlemsnr.
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-left font-medium">
                    Kontakt
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-left font-medium">
                    Ønsket støtte
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-left font-medium">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="whitespace-nowrap px-4 py-3">
                      {formatDato(p.created_at)}
                    </td>
                    <td className="px-4 py-3">{p.tittel ?? ""}</td>
                    <td className="px-4 py-3">{p.sted ?? ""}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {p.medlemsnummer ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{p.navn ?? ""}</div>
                      <div className="text-muted-foreground">{p.epost ?? ""}</div>
                      {p.telefon ? (
                        <div className="text-muted-foreground">{p.telefon}</div>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {p.budsjett !== null && p.budsjett !== undefined
                        ? formatBelop(p.budsjett)
                        : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {p.status ?? "—"}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 ? (
                  <tr className="border-t">
                    <td
                      colSpan={7}
                      className="px-4 py-6 text-center text-muted-foreground"
                    >
                      Ingen treff.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  )
}
