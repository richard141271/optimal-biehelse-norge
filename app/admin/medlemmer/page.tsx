"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type Medlem = {
  id?: string
  created_at?: string
  medlemsnummer?: number | null
  medlemskap_type?: string | null
  navn?: string
  adresse?: string | null
  postnr?: string | null
  sted?: string | null
  epost?: string
  telefon?: string | null
}

type State =
  | { type: "loading" }
  | { type: "error"; message: string }
  | { type: "ready"; medlemmer: Medlem[] }

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

export default function AdminMedlemmerPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const [state, setState] = useState<State>({ type: "loading" })
  const [query, setQuery] = useState("")

  const hent = useCallback(async () => {
    if (!supabase) {
      setState({
        type: "error",
        message: "Supabase er ikke konfigurert (mangler miljøvariabler).",
      })
      return
    }
    setState({ type: "loading" })
    const { data, error } = await supabase
      .from("medlemmer")
      .select(
        "id, created_at, medlemsnummer, medlemskap_type, navn, adresse, postnr, sted, epost, telefon"
      )
      .order("created_at", { ascending: false })
      .limit(1000)

    if (error) {
      setState({
        type: "error",
        message:
          "Kunne ikke hente medlemsregister. Sjekk at du er logget inn og at tilgang er satt opp i Supabase.",
      })
      return
    }

    setState({ type: "ready", medlemmer: (data ?? []) as Medlem[] })
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
      ? state.medlemmer.filter((m) => {
          const hay = `${m.navn ?? ""} ${m.epost ?? ""} ${m.telefon ?? ""}`
            .concat(
              ` ${m.adresse ?? ""} ${m.postnr ?? ""} ${m.sted ?? ""} ${m.medlemsnummer ?? ""}`
            )
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
          <h1 className="text-2xl font-semibold tracking-tight">
            Medlemsregister
          </h1>
          <p className="text-muted-foreground">
            Full oversikt over registrerte medlemmer.
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
          placeholder="Søk på navn, medlemsnummer, adresse, e-post eller telefon"
          className="sm:max-w-sm"
        />
        <div className="text-sm text-muted-foreground">
          {state.type === "ready" ? `${filtered.length} treff` : ""}
        </div>
      </div>

      {state.type === "loading" ? (
        <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          Laster medlemsregister…
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
                    Medlemsnr.
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-left font-medium">
                    Type
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-left font-medium">
                    Navn
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-left font-medium">
                    Adresse
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-left font-medium">
                    E-post
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-left font-medium">
                    Telefon
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m, idx) => (
                  <tr
                    key={m.id ?? `${m.epost ?? "rad"}-${idx}`}
                    className="border-t"
                  >
                    <td className="whitespace-nowrap px-4 py-3">
                      {formatDato(m.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {m.medlemsnummer ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {m.medlemskap_type ?? "—"}
                    </td>
                    <td className="px-4 py-3">{m.navn ?? ""}</td>
                    <td className="px-4 py-3">
                      {[m.adresse ?? null, [m.postnr ?? null, m.sted ?? null]
                        .filter(Boolean)
                        .join(" ")]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3">{m.epost ?? ""}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {m.telefon ?? ""}
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
