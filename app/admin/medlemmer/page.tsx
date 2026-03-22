"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
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
  kontingent_betalt_at?: string | null
  kontingent_gyldig_til?: string | null
  role?: string | null
}

type State =
  | { type: "loading" }
  | { type: "error"; message: string; status?: number }
  | { type: "ready"; medlemmer: Medlem[]; count: number | null; minRolle: string | null }

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

function prisForType(type: string | null | undefined) {
  if (type === "stotte") return 300
  if (type === "bedrift") return 1000
  return 100
}

function labelForType(type: string | null | undefined) {
  if (type === "stotte") return "Støttemedlem"
  if (type === "bedrift") return "Bedriftsmedlem"
  return "Medlem"
}

function labelForRole(role: string | null | undefined) {
  if (role === "superadmin") return "Superbruker"
  if (role === "admin") return "Admin"
  return "—"
}

export default function AdminMedlemmerPage() {
  const [state, setState] = useState<State>({ type: "loading" })
  const [query, setQuery] = useState("")
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null)
  const [purging, setPurging] = useState(false)

  const hent = useCallback(async () => {
    setState({ type: "loading" })
    try {
      const res = await fetch(`/api/admin/medlemmer?ts=${Date.now()}`, {
        cache: "no-store",
      })
      const data = (await res.json()) as {
        ok?: boolean
        feil?: string
        medlemmer?: Medlem[]
        count?: number | null
        minRolle?: string | null
      }
      if (!res.ok || !data.ok) {
        setState({
          type: "error",
          message: data.feil ?? "Kunne ikke hente medlemsregister.",
          status: res.status,
        })
        return
      }
      setState({
        type: "ready",
        medlemmer: data.medlemmer ?? [],
        count: typeof data.count === "number" ? data.count : null,
        minRolle: data.minRolle ?? null,
      })
    } catch {
      setState({
        type: "error",
        message:
          "Kunne ikke hente medlemsregister. Sjekk nett og prøv igjen.",
      })
      return
    }
  }, [])

  const markerKontingent = useCallback(
    async (medlemId: string, betalt: boolean) => {
      if (savingId) return
      setSavingId(medlemId)
      try {
        const res = await fetch("/api/admin/medlemmer/betaling", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ medlemId, betalt }),
        })
        const data = (await res.json()) as { feil?: string }
        if (!res.ok) {
          alert(data.feil ?? "Kunne ikke oppdatere kontingent.")
          return
        }
        await hent()
      } finally {
        setSavingId(null)
      }
    },
    [hent, savingId]
  )

  const settAdmin = useCallback(
    async (medlemId: string, enabled: boolean) => {
      if (savingRoleId) return
      setSavingRoleId(medlemId)
      try {
        const res = await fetch("/api/admin/medlemmer", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ medlemId, role: enabled ? "admin" : "user" }),
        })
        const data = (await res.json()) as { feil?: string }
        if (!res.ok) {
          alert(data.feil ?? "Kunne ikke oppdatere tilgang.")
          return
        }
        await hent()
      } finally {
        setSavingRoleId(null)
      }
    },
    [hent, savingRoleId]
  )

  const slettAndreMedlemmer = useCallback(async () => {
    if (purging) return
    const ok = window.confirm(
      "Dette sletter ALLE andre medlemmer og brukerkontoer (test/feilregistreringer). Kun superbruker blir stående. Fortsette?"
    )
    if (!ok) return
    setPurging(true)
    try {
      const res = await fetch("/api/admin/medlemmer", { method: "DELETE" })
      const data = (await res.json()) as { ok?: boolean; feil?: string; slettet?: number }
      if (!res.ok || !data.ok) {
        alert(data.feil ?? "Kunne ikke slette medlemmer.")
        return
      }
      await hent()
      alert(`Slettet ${Number(data.slettet ?? 0)} medlemmer.`)
    } finally {
      setPurging(false)
    }
  }, [hent, purging])

  useEffect(() => {
    const id = setTimeout(() => {
      void hent()
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
          <Button variant="outline" onClick={hent}>
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
          {state.type === "ready"
            ? state.count === 0 || (state.medlemmer.length === 0 && !query.trim())
              ? "0 medlemmer"
              : `${filtered.length} treff`
            : ""}
        </div>
      </div>

      {state.type === "loading" ? (
        <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          Laster medlemsregister…
        </div>
      ) : null}

      {state.type === "error" ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">
            {state.message}
          </div>
          {state.status === 401 ? (
            <Link
              href={`/min-side/login?next=${encodeURIComponent("/admin/medlemmer")}`}
              className="text-sm underline underline-offset-4"
            >
              Gå til innlogging
            </Link>
          ) : null}
        </div>
      ) : null}

      {state.type === "ready" ? (
        <div className="space-y-3">
          {state.count === 0 ? (
            <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
              Medlemsregisteret er tomt.
            </div>
          ) : null}
          {state.minRolle === "superadmin" ? (
            <div className="rounded-xl border bg-card p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-medium">Verktøy</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Rydd testdata og start medlemsnummer på nytt fra 1000.
                  </div>
                </div>
                <Button
                  variant="destructive"
                  onClick={slettAndreMedlemmer}
                  disabled={purging}
                >
                  {purging ? "Sletter…" : "Slett alle andre medlemmer"}
                </Button>
              </div>
            </div>
          ) : null}
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="overflow-auto">
              <table className="w-full min-w-[1400px] text-sm">
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
                    Rolle
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-left font-medium">
                    Telefon
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-left font-medium">
                    Kontingent
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-left font-medium">
                    Gyldig til
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-medium">
                    Handling
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
                      {labelForType(m.medlemskap_type ?? null)}
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
                      {m.role === "superadmin" ? (
                        labelForRole(m.role ?? null)
                      ) : (
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-foreground"
                            checked={m.role === "admin"}
                            disabled={
                              state.minRolle !== "superadmin" ||
                              !m.id ||
                              savingRoleId === m.id
                            }
                            onChange={(e) => {
                              if (!m.id) return
                              void settAdmin(m.id, e.target.checked)
                            }}
                          />
                          <span>{labelForRole(m.role ?? null)}</span>
                        </label>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {m.telefon ?? ""}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {prisForType(m.medlemskap_type ?? null)} kr / år
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {m.kontingent_gyldig_til
                        ? formatDato(m.kontingent_gyldig_til)
                        : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {m.id ? (
                          m.kontingent_gyldig_til ? (
                            <Button
                              variant="outline"
                              onClick={() => markerKontingent(m.id as string, false)}
                              disabled={savingId === m.id}
                            >
                              Marker ikke betalt
                            </Button>
                          ) : (
                            <Button
                              onClick={() => markerKontingent(m.id as string, true)}
                              disabled={savingId === m.id}
                            >
                              Marker betalt
                            </Button>
                          )
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 ? (
                  <tr className="border-t">
                    <td
                      colSpan={11}
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
        </div>
      ) : null}
    </div>
  )
}
