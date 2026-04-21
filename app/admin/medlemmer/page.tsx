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
  aktiv?: boolean | null
  utmeldt_at?: string | null
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

function normalizedRole(role: string | null | undefined) {
  if (role === "superadmin") return "superadmin"
  if (role === "admin") return "admin"
  return "user"
}

function roleRank(role: string | null | undefined) {
  const r = normalizedRole(role)
  if (r === "superadmin") return 0
  if (r === "admin") return 1
  return 2
}

function safeString(v: unknown) {
  return typeof v === "string" ? v : ""
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export default function AdminMedlemmerPage() {
  const [state, setState] = useState<State>({ type: "loading" })
  const [query, setQuery] = useState("")
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null)
  const [changingId, setChangingId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Record<string, true>>({})
  const [emailSubject, setEmailSubject] = useState("OBNO – viktig info")
  const [emailBody, setEmailBody] = useState("")

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

  const settAktiv = useCallback(
    async (m: Medlem, aktiv: boolean) => {
      if (changingId) return
      if (!m.id) return
      if (
        state.type !== "ready" ||
        (state.minRolle !== "superadmin" && state.minRolle !== "admin")
      )
        return
      if (m.role === "superadmin") return

      const label = [
        m.medlemsnummer ? `#${m.medlemsnummer}` : null,
        m.navn ?? null,
        m.epost ?? null,
      ]
        .filter(Boolean)
        .join(" · ")

      if (!aktiv) {
        const ok = confirm(
          `Melde ut dette medlemmet?\n\n${label}\n\nMedlemsnummer blir bevart, og medlemmet kan aktiveres igjen senere.`
        )
        if (!ok) return
      }

      setChangingId(m.id)
      try {
        const res = await fetch("/api/admin/medlemmer", {
          method: aktiv ? "PATCH" : "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ medlemId: m.id, aktiv }),
        })
        const data = (await res.json()) as { ok?: boolean; feil?: string }
        if (!res.ok || !data.ok) {
          alert(data.feil ?? `Kunne ikke oppdatere medlem. (HTTP ${res.status})`)
          return
        }
        await hent()
      } finally {
        setChangingId(null)
      }
    },
    [changingId, hent, state]
  )

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

  const sorted = [...filtered].sort((a, b) => {
    const rr = roleRank(a.role) - roleRank(b.role)
    if (rr !== 0) return rr
    const aa = (a.aktiv === false ? 1 : 0) - (b.aktiv === false ? 1 : 0)
    if (aa !== 0) return aa
    const an = safeString(a.navn).localeCompare(safeString(b.navn), "nb-NO", { sensitivity: "base" })
    if (an !== 0) return an
    return safeString(b.created_at).localeCompare(safeString(a.created_at))
  })

  const rowKey = (m: Medlem, idx: number) => {
    if (m.id) return String(m.id)
    const e = String(m.epost ?? "").trim().toLowerCase()
    if (e) return `epost:${e}`
    return `rad:${idx}`
  }
  const visibleKeys = sorted.map((m, idx) => rowKey(m, idx))
  const visibleSelectedCount = visibleKeys.reduce((acc, k) => (selected[k] ? acc + 1 : acc), 0)

  const selectedEmails = sorted
    .map((m, idx) => ({ m, key: rowKey(m, idx) }))
    .filter((x) => selected[x.key])
    .map((x) => String(x.m.epost ?? "").trim().toLowerCase())
    .filter((e) => !!e && isValidEmail(e))
    .filter((e, i, arr) => arr.indexOf(e) === i)

  const markerAlleSynlige = useCallback(() => {
    setSelected((prev) => {
      const allSelected = visibleKeys.every((k) => prev[k])
      if (allSelected) {
        const next = { ...prev }
        for (const k of visibleKeys) delete next[k]
        return next
      }
      const next = { ...prev }
      for (const k of visibleKeys) next[k] = true
      return next
    })
  }, [visibleKeys])

  const tømValg = useCallback(() => {
    setSelected({})
  }, [])

  const markerRolle = useCallback(
    (role: "superadmin" | "admin" | "user") => {
      setSelected((prev) => {
        const next = { ...prev }
        for (let i = 0; i < sorted.length; i++) {
          const m = sorted[i]
          const key = rowKey(m, i)
          if (normalizedRole(m.role) === role) next[key] = true
        }
        return next
      })
    },
    [sorted]
  )

  const kopierEposter = useCallback(async () => {
    if (selectedEmails.length === 0) return
    const text = selectedEmails.join("; ")
    try {
      await navigator.clipboard.writeText(text)
      alert(`Kopierte ${selectedEmails.length} e-postadresser.`)
    } catch {
      prompt("Kopier e-postadresser:", text)
    }
  }, [selectedEmails])

  const åpneEpost = useCallback(() => {
    if (selectedEmails.length === 0) return
    const bcc = selectedEmails.join(",")
    const subject = emailSubject.trim() || "OBNO"
    const body = emailBody
    const url = `mailto:?bcc=${encodeURIComponent(bcc)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.location.href = url
  }, [emailBody, emailSubject, selectedEmails])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
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
          <div className="rounded-xl border bg-card p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-2">
                <div className="text-sm font-medium">Utvalg</div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={markerAlleSynlige} disabled={sorted.length === 0}>
                    {visibleSelectedCount === visibleKeys.length && visibleKeys.length > 0 ? "Fjern alle" : "Velg alle"}
                  </Button>
                  <Button variant="outline" onClick={() => void markerRolle("superadmin")} disabled={sorted.length === 0}>
                    Velg superbruker
                  </Button>
                  <Button variant="outline" onClick={() => void markerRolle("admin")} disabled={sorted.length === 0}>
                    Velg admin
                  </Button>
                  <Button variant="outline" onClick={() => void markerRolle("user")} disabled={sorted.length === 0}>
                    Velg medlemmer
                  </Button>
                  <Button variant="outline" onClick={tømValg} disabled={Object.keys(selected).length === 0}>
                    Tøm
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  Valgt: {visibleSelectedCount} av {sorted.length} (filtrerte)
                </div>
              </div>

              <div className="space-y-2 lg:max-w-xl lg:flex-1">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    placeholder="Emne"
                  />
                  <Input
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    placeholder="Melding (valgfritt)"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={åpneEpost} disabled={selectedEmails.length === 0}>
                    Send e-post ({selectedEmails.length})
                  </Button>
                  <Button variant="outline" onClick={() => void kopierEposter()} disabled={selectedEmails.length === 0}>
                    Kopier e-poster
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="hidden lg:block">
              <table className="w-full table-fixed text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="w-8 whitespace-nowrap px-2 py-2 text-left font-medium">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-foreground"
                      checked={visibleKeys.length > 0 && visibleSelectedCount === visibleKeys.length}
                      onChange={() => markerAlleSynlige()}
                      aria-label="Velg alle"
                    />
                  </th>
                  <th className="w-20 whitespace-nowrap px-2 py-2 text-left font-medium">
                    Dato
                  </th>
                  <th className="w-20 whitespace-nowrap px-2 py-2 text-left font-medium">
                    Medlemsnr.
                  </th>
                  <th className="w-28 whitespace-nowrap px-2 py-2 text-left font-medium">
                    Type
                  </th>
                  <th className="whitespace-nowrap px-2 py-2 text-left font-medium">
                    Navn
                  </th>
                  <th className="hidden whitespace-nowrap px-2 py-2 text-left font-medium xl:table-cell">
                    Adresse
                  </th>
                  <th className="whitespace-nowrap px-2 py-2 text-left font-medium">
                    E-post
                  </th>
                  <th className="w-16 whitespace-nowrap px-2 py-2 text-left font-medium">
                    Status
                  </th>
                  <th className="w-28 whitespace-nowrap px-2 py-2 text-left font-medium">
                    Rolle
                  </th>
                  <th className="hidden whitespace-nowrap px-2 py-2 text-left font-medium xl:table-cell">
                    Telefon
                  </th>
                  <th className="hidden whitespace-nowrap px-2 py-2 text-left font-medium xl:table-cell">
                    Kontingent
                  </th>
                  <th className="hidden whitespace-nowrap px-2 py-2 text-left font-medium xl:table-cell">
                    Gyldig til
                  </th>
                  <th className="w-[180px] whitespace-nowrap px-2 py-2 text-right font-medium">
                    Handling
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((m, idx) => (
                  <tr
                    key={rowKey(m, idx)}
                    className={`border-t${m.aktiv === false ? " opacity-60" : ""}`}
                  >
                    <td className="whitespace-nowrap px-2 py-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-foreground"
                        checked={!!selected[rowKey(m, idx)]}
                        onChange={() => {
                          const key = rowKey(m, idx)
                          setSelected((prev) => {
                            const next = { ...prev }
                            if (next[key]) delete next[key]
                            else next[key] = true
                            return next
                          })
                        }}
                        aria-label="Velg medlem"
                      />
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">
                      {formatDato(m.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">
                      {m.medlemsnummer ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">
                      {labelForType(m.medlemskap_type ?? null)}
                    </td>
                    <td className="px-2 py-2">
                      <div className="truncate" title={m.navn ?? ""}>
                        {m.navn ?? ""}
                      </div>
                    </td>
                    <td className="hidden px-2 py-2 xl:table-cell">
                      <div
                        className="truncate"
                        title={
                          [m.adresse ?? null, [m.postnr ?? null, m.sted ?? null].filter(Boolean).join(" ")]
                            .filter(Boolean)
                            .join(", ") || "—"
                        }
                      >
                        {[m.adresse ?? null, [m.postnr ?? null, m.sted ?? null]
                          .filter(Boolean)
                          .join(" ")]
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </div>
                    </td>
                    <td className="px-2 py-2 max-w-[200px] truncate sm:max-w-[260px]" title={m.epost ?? ""}>
                      {m.epost ?? ""}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">
                      {m.aktiv === false ? "Innaktiv" : "Aktiv"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">
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
                              m.aktiv === false ||
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
                    <td className="hidden whitespace-nowrap px-2 py-2 xl:table-cell">
                      {m.telefon ?? ""}
                    </td>
                    <td className="hidden whitespace-nowrap px-2 py-2 xl:table-cell">
                      {prisForType(m.medlemskap_type ?? null)} kr / år
                    </td>
                    <td className="hidden whitespace-nowrap px-2 py-2 xl:table-cell">
                      {m.kontingent_gyldig_til
                        ? formatDato(m.kontingent_gyldig_til)
                        : "—"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        {m.id && m.aktiv !== false ? (
                          m.kontingent_gyldig_til ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => markerKontingent(String(m.id), false)}
                              disabled={savingId === String(m.id)}
                            >
                              Marker ikke betalt
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => markerKontingent(String(m.id), true)}
                              disabled={savingId === String(m.id)}
                            >
                              Marker betalt
                            </Button>
                          )
                        ) : null}
                        {state.type === "ready" &&
                        (state.minRolle === "superadmin" || state.minRolle === "admin") &&
                        m.id &&
                        m.role !== "superadmin" ? (
                          m.aktiv === false ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void settAktiv(m, true)}
                              disabled={changingId === m.id}
                            >
                              Aktiver
                            </Button>
                          ) : (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => void settAktiv(m, false)}
                              disabled={changingId === m.id}
                            >
                              Meld ut
                            </Button>
                          )
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {sorted.length === 0 ? (
                  <tr className="border-t">
                    <td
                      colSpan={13}
                      className="px-3 py-5 text-center text-muted-foreground"
                    >
                      Ingen treff.
                    </td>
                  </tr>
                ) : null}
              </tbody>
              </table>
            </div>
            <div className="lg:hidden">
              <div className="divide-y">
                {sorted.map((m, idx) => {
                  const key = rowKey(m, idx)
                  const adresse = [m.adresse ?? null, [m.postnr ?? null, m.sted ?? null].filter(Boolean).join(" ")]
                    .filter(Boolean)
                    .join(", ")
                  return (
                    <div key={key} className={`p-4${m.aktiv === false ? " opacity-60" : ""}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-foreground"
                              checked={!!selected[key]}
                              onChange={() => {
                                setSelected((prev) => {
                                  const next = { ...prev }
                                  if (next[key]) delete next[key]
                                  else next[key] = true
                                  return next
                                })
                              }}
                              aria-label="Velg medlem"
                            />
                            <div className="truncate font-medium">{m.navn ?? "—"}</div>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            #{m.medlemsnummer ?? "—"} · {labelForType(m.medlemskap_type ?? null)} · {labelForRole(m.role ?? null)}
                          </div>
                        </div>
                        <div className="shrink-0 text-right text-xs text-muted-foreground">
                          {formatDato(m.created_at)}
                          <div className={m.aktiv === false ? "mt-1 font-medium text-destructive" : "mt-1 font-medium text-primary"}>
                            {m.aktiv === false ? "Innaktiv" : "Aktiv"}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                        <div className="rounded-lg border bg-background/70 p-3">
                          <div className="text-muted-foreground">E-post</div>
                          <div className="truncate">{m.epost ?? "—"}</div>
                        </div>
                        <div className="rounded-lg border bg-background/70 p-3">
                          <div className="text-muted-foreground">Telefon</div>
                          <div className="truncate">{m.telefon ?? "—"}</div>
                        </div>
                        <div className="rounded-lg border bg-background/70 p-3 sm:col-span-2">
                          <div className="text-muted-foreground">Adresse</div>
                          <div className="truncate">{adresse || "—"}</div>
                        </div>
                        <div className="rounded-lg border bg-background/70 p-3">
                          <div className="text-muted-foreground">Kontingent</div>
                          <div>{prisForType(m.medlemskap_type ?? null)} kr / år</div>
                        </div>
                        <div className="rounded-lg border bg-background/70 p-3">
                          <div className="text-muted-foreground">Gyldig til</div>
                          <div>{m.kontingent_gyldig_til ? formatDato(m.kontingent_gyldig_til) : "—"}</div>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {m.role !== "superadmin" ? (
                          <label className="inline-flex items-center gap-2 rounded-lg border bg-background/70 px-3 py-2 text-xs">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-foreground"
                              checked={m.role === "admin"}
                              disabled={
                                state.minRolle !== "superadmin" ||
                                m.aktiv === false ||
                                !m.id ||
                                savingRoleId === m.id
                              }
                              onChange={(e) => {
                                if (!m.id) return
                                void settAdmin(m.id, e.target.checked)
                              }}
                            />
                            <span>Admin</span>
                          </label>
                        ) : (
                          <div className="rounded-lg border bg-background/70 px-3 py-2 text-xs text-muted-foreground">
                            Superbruker
                          </div>
                        )}

                        {m.id && m.aktiv !== false ? (
                          m.kontingent_gyldig_til ? (
                            <Button
                              variant="outline"
                              onClick={() => markerKontingent(String(m.id), false)}
                              disabled={savingId === String(m.id)}
                            >
                              Marker ikke betalt
                            </Button>
                          ) : (
                            <Button
                              onClick={() => markerKontingent(String(m.id), true)}
                              disabled={savingId === String(m.id)}
                            >
                              Marker betalt
                            </Button>
                          )
                        ) : null}

                        {state.type === "ready" &&
                        (state.minRolle === "superadmin" || state.minRolle === "admin") &&
                        m.id &&
                        m.role !== "superadmin" ? (
                          m.aktiv === false ? (
                            <Button
                              variant="outline"
                              onClick={() => void settAktiv(m, true)}
                              disabled={changingId === m.id}
                            >
                              Aktiver
                            </Button>
                          ) : (
                            <Button
                              variant="destructive"
                              onClick={() => void settAktiv(m, false)}
                              disabled={changingId === m.id}
                            >
                              Meld ut
                            </Button>
                          )
                        ) : null}
                      </div>
                    </div>
                  )
                })}
                {sorted.length === 0 ? (
                  <div className="p-5 text-center text-sm text-muted-foreground">Ingen treff.</div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
