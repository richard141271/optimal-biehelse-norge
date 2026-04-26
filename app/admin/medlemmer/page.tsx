"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type Medlem = {
  id?: string
  created_at?: string
  user_id?: string | null
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

function formatDatoKort(value?: string) {
  if (!value) return { top: "", bottom: "" }
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return { top: "", bottom: "" }
  const top = new Intl.DateTimeFormat("nb-NO", { day: "2-digit", month: "2-digit" }).format(d)
  const bottom = new Intl.DateTimeFormat("nb-NO", { year: "numeric" }).format(d)
  return { top, bottom }
}

function telefonVisning(value?: string | null) {
  const t = String(value ?? "").trim()
  if (!t) return ""
  if (t.startsWith("+47")) return t.slice(3).trim()
  if (t.startsWith("0047")) return t.slice(4).trim()
  return t
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
  const [openMember, setOpenMember] = useState<Medlem | null>(null)
  const [editNavn, setEditNavn] = useState("")
  const [editEpost, setEditEpost] = useState("")
  const [editTelefon, setEditTelefon] = useState("")
  const [editAdresse, setEditAdresse] = useState("")
  const [editPostnr, setEditPostnr] = useState("")
  const [editSted, setEditSted] = useState("")
  const [editMedlemsnummer, setEditMedlemsnummer] = useState("")
  const [editType, setEditType] = useState("")
  const [editAuthEmail, setEditAuthEmail] = useState("")
  const [editAuthPassword, setEditAuthPassword] = useState("")
  const [savingMember, setSavingMember] = useState(false)

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

  useEffect(() => {
    if (!openMember) return
    setEditNavn(String(openMember.navn ?? ""))
    setEditEpost(String(openMember.epost ?? ""))
    setEditTelefon(String(openMember.telefon ?? ""))
    setEditAdresse(String(openMember.adresse ?? ""))
    setEditPostnr(String(openMember.postnr ?? ""))
    setEditSted(String(openMember.sted ?? ""))
    setEditMedlemsnummer(openMember.medlemsnummer == null ? "" : String(openMember.medlemsnummer))
    setEditType(String(openMember.medlemskap_type ?? ""))
    setEditAuthEmail(String(openMember.epost ?? ""))
    setEditAuthPassword("")
  }, [openMember])

  const lagreMedlem = useCallback(async () => {
    if (!openMember?.id) return
    if (savingMember) return
    setSavingMember(true)
    try {
      const isSuper = state.type === "ready" && state.minRolle === "superadmin"
      const payload: Record<string, unknown> = {
        medlemId: String(openMember.id),
        navn: editNavn,
        epost: editEpost,
        telefon: editTelefon,
        adresse: editAdresse,
        postnr: editPostnr,
        sted: editSted,
        medlemsnummer: editMedlemsnummer,
        medlemskap_type: editType,
      }
      if (isSuper && openMember.user_id) {
        payload.authEmail = editAuthEmail
        if (editAuthPassword.trim()) payload.authPassword = editAuthPassword
      }
      const res = await fetch("/api/admin/medlemmer", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = (await res.json()) as { ok?: boolean; feil?: string }
      if (!res.ok || !data.ok) {
        alert(data.feil ?? "Kunne ikke lagre medlem.")
        return
      }
      await hent()
      setOpenMember(null)
    } catch {
      alert("Kunne ikke lagre medlem. Sjekk nett og prøv igjen.")
    } finally {
      setSavingMember(false)
    }
  }, [
    editAdresse,
    editAuthEmail,
    editAuthPassword,
    editEpost,
    editMedlemsnummer,
    editNavn,
    editPostnr,
    editSted,
    editTelefon,
    editType,
    hent,
    openMember,
    savingMember,
    state,
  ])

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
                  <th className="w-14 whitespace-nowrap px-2 py-2 text-left font-medium">
                    Dato
                  </th>
                  <th className="w-[72px] whitespace-nowrap px-2 py-2 text-left font-medium">
                    Medlemsnr.
                  </th>
                  <th className="w-24 whitespace-nowrap px-2 py-2 text-left font-medium">
                    Type
                  </th>
                  <th className="whitespace-nowrap px-2 py-2 text-left font-medium">
                    Navn
                  </th>
                  <th className="whitespace-nowrap px-2 py-2 text-left font-medium">
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
                  <th className="w-[88px] whitespace-nowrap px-2 py-2 text-left font-medium">
                    Telefon
                  </th>
                  <th className="w-[76px] whitespace-nowrap px-2 py-2 text-left font-medium">
                    Kontingent
                  </th>
                  <th className="w-16 whitespace-nowrap px-2 py-2 text-left font-medium">
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
                    className={`cursor-pointer border-t hover:bg-muted/20${m.aktiv === false ? " opacity-60" : ""}`}
                    onClick={() => setOpenMember(m)}
                  >
                    <td className="whitespace-nowrap px-2 py-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-foreground"
                        checked={!!selected[rowKey(m, idx)]}
                        onClick={(e) => e.stopPropagation()}
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
                      {(() => {
                        const v = formatDatoKort(m.created_at)
                        return (
                          <div className="leading-tight">
                            <div>{v.top || "—"}</div>
                            <div className="text-muted-foreground">{v.bottom || ""}</div>
                          </div>
                        )
                      })()}
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
                    <td className="px-2 py-2">
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
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              if (!m.id) return
                              void settAdmin(m.id, e.target.checked)
                            }}
                          />
                          <span>{labelForRole(m.role ?? null)}</span>
                        </label>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">
                      {telefonVisning(m.telefon ?? null)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">
                      {prisForType(m.medlemskap_type ?? null)} kr/år
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">
                      {(() => {
                        const v = formatDatoKort(m.kontingent_gyldig_til ?? "")
                        if (!v.top) return "—"
                        return (
                          <div className="leading-tight">
                            <div>{v.top}</div>
                            <div className="text-muted-foreground">{v.bottom}</div>
                          </div>
                        )
                      })()}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        {m.id && m.aktiv !== false ? (
                          m.kontingent_gyldig_til ? (
                            <Button
                              size="sm"
                              className="bg-emerald-600 text-white hover:bg-emerald-600/90"
                              onClick={(e) => {
                                e.stopPropagation()
                                markerKontingent(String(m.id), false).catch(() => {})
                              }}
                              disabled={savingId === String(m.id)}
                            >
                              Betalt
                            </Button>
                          ) : (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                markerKontingent(String(m.id), true).catch(() => {})
                              }}
                              disabled={savingId === String(m.id)}
                            >
                              Ubetalt
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
                              onClick={(e) => {
                                e.stopPropagation()
                                void settAktiv(m, true)
                              }}
                              disabled={changingId === m.id}
                            >
                              Aktiver
                            </Button>
                          ) : (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                void settAktiv(m, false)
                              }}
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
                    <div
                      key={key}
                      className={`cursor-pointer p-4 hover:bg-muted/20${m.aktiv === false ? " opacity-60" : ""}`}
                      onClick={() => setOpenMember(m)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-foreground"
                              checked={!!selected[key]}
                              onClick={(e) => e.stopPropagation()}
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
                          <div className="truncate">{telefonVisning(m.telefon ?? null) || "—"}</div>
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
                              onClick={(e) => e.stopPropagation()}
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
                              className="bg-emerald-600 text-white hover:bg-emerald-600/90"
                              onClick={(e) => {
                                e.stopPropagation()
                                markerKontingent(String(m.id), false).catch(() => {})
                              }}
                              disabled={savingId === String(m.id)}
                            >
                              Betalt
                            </Button>
                          ) : (
                            <Button
                              variant="destructive"
                              onClick={(e) => {
                                e.stopPropagation()
                                markerKontingent(String(m.id), true).catch(() => {})
                              }}
                              disabled={savingId === String(m.id)}
                            >
                              Ubetalt
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
                              onClick={(e) => {
                                e.stopPropagation()
                                void settAktiv(m, true)
                              }}
                              disabled={changingId === m.id}
                            >
                              Aktiver
                            </Button>
                          ) : (
                            <Button
                              variant="destructive"
                              onClick={(e) => {
                                e.stopPropagation()
                                void settAktiv(m, false)
                              }}
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

      {state.type === "ready" && openMember ? (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4"
          onClick={() => setOpenMember(null)}
        >
          <div
            className="mx-auto my-4 w-full max-w-2xl max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border bg-card p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">Medlem</div>
                <div className="text-sm text-muted-foreground">
                  #{openMember.medlemsnummer ?? "—"} · {labelForType(openMember.medlemskap_type ?? null)}
                </div>
              </div>
              <Button variant="outline" onClick={() => setOpenMember(null)}>
                Lukk
              </Button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Navn</div>
                <Input value={editNavn} onChange={(e) => setEditNavn(e.target.value)} />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Medlemsnr.</div>
                <Input value={editMedlemsnummer} onChange={(e) => setEditMedlemsnummer(e.target.value)} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <div className="text-xs text-muted-foreground">E-post</div>
                <Input value={editEpost} onChange={(e) => setEditEpost(e.target.value)} />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Telefon</div>
                <Input value={editTelefon} onChange={(e) => setEditTelefon(e.target.value)} />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Type</div>
                <Input value={editType} onChange={(e) => setEditType(e.target.value)} placeholder="medlem / stotte / bedrift" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <div className="text-xs text-muted-foreground">Adresse</div>
                <Input value={editAdresse} onChange={(e) => setEditAdresse(e.target.value)} />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Postnr</div>
                <Input value={editPostnr} onChange={(e) => setEditPostnr(e.target.value)} />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Sted</div>
                <Input value={editSted} onChange={(e) => setEditSted(e.target.value)} />
              </div>
            </div>

            {state.minRolle === "superadmin" ? (
              <div className="mt-5 rounded-xl border bg-muted/30 p-4">
                <div className="text-sm font-medium">Innlogging</div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1 sm:col-span-2">
                    <div className="text-xs text-muted-foreground">E-post (innlogging)</div>
                    <Input
                      value={editAuthEmail}
                      onChange={(e) => setEditAuthEmail(e.target.value)}
                      disabled={!openMember.user_id}
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <div className="text-xs text-muted-foreground">Nytt passord</div>
                    <Input
                      value={editAuthPassword}
                      onChange={(e) => setEditAuthPassword(e.target.value)}
                      placeholder="Minst 8 tegn"
                      disabled={!openMember.user_id}
                    />
                  </div>
                  {!openMember.user_id ? (
                    <div className="text-xs text-muted-foreground sm:col-span-2">
                      Medlemmet er ikke koblet til en innloggingsbruker (user_id mangler).
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => setOpenMember(null)} disabled={savingMember}>
                Avbryt
              </Button>
              <Button onClick={() => void lagreMedlem()} disabled={savingMember}>
                Lagre
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
