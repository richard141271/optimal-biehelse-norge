"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

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
  beskrivelse?: string
  status?: string | null
  vedlegg_signed_urls?: string[] | null
  admin_svar?: string | null
  admin_svar_at?: string | null
  admin_svar_sent_at?: string | null
}

type State =
  | { type: "loading" }
  | { type: "error"; message: string; status?: number }
  | { type: "ready"; prosjekt: Prosjekt }

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
  if (value === null || value === undefined) return "—"
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
  }).format(value)
}

const statusOptions = [
  { value: "mottatt", label: "mottatt" },
  { value: "under behandling", label: "under behandling" },
  { value: "godkjent", label: "godkjent" },
  { value: "avslått", label: "avslått" },
]

export default function AdminProsjektDetailPage() {
  const params = useParams<{ id?: string }>()
  const prosjektId = String(params?.id ?? "").trim()

  const [state, setState] = useState<State>({ type: "loading" })
  const [status, setStatus] = useState<string>("mottatt")
  const [svar, setSvar] = useState("")
  const [savingStatus, setSavingStatus] = useState(false)
  const [sendingSvar, setSendingSvar] = useState(false)
  const [info, setInfo] = useState<string | null>(null)

  const selectClassName = useMemo(
    () =>
      "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80",
    []
  )

  const hent = useCallback(async () => {
    setState({ type: "loading" })
    setInfo(null)
    const res = await fetch(`/api/admin/prosjekter/${encodeURIComponent(prosjektId)}?ts=${Date.now()}`, {
      cache: "no-store",
    })
    const payload = (await res.json()) as { ok?: boolean; feil?: string; prosjekt?: Prosjekt }
    if (!res.ok || !payload.ok || !payload.prosjekt) {
      setState({
        type: "error",
        message: payload.feil ?? "Kunne ikke hente prosjekt.",
        status: res.status,
      })
      return
    }
    setState({ type: "ready", prosjekt: payload.prosjekt })
    setStatus(String(payload.prosjekt.status ?? "mottatt"))
    setSvar(String(payload.prosjekt.admin_svar ?? ""))
  }, [prosjektId])

  useEffect(() => {
    if (!prosjektId) return
    const id = setTimeout(() => void hent(), 0)
    return () => clearTimeout(id)
  }, [hent, prosjektId])

  async function apneVedlegg(url: string) {
    window.open(url, "_blank", "noopener,noreferrer")
  }

  async function endreStatus() {
    if (state.type !== "ready" || savingStatus) return
    setSavingStatus(true)
    setInfo(null)
    try {
      const res = await fetch(`/api/admin/prosjekter/${encodeURIComponent(prosjektId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      const data = (await res.json()) as { ok?: boolean; feil?: string }
      if (!res.ok || !data.ok) {
        setInfo(data.feil ?? "Kunne ikke oppdatere status.")
        return
      }
      setInfo("Status oppdatert.")
      await hent()
    } finally {
      setSavingStatus(false)
    }
  }

  async function sendSvar() {
    if (state.type !== "ready" || sendingSvar) return
    const tekst = svar.trim()
    if (!tekst) {
      setInfo("Skriv et svar før du sender.")
      return
    }
    setSendingSvar(true)
    setInfo(null)
    try {
      const res = await fetch(`/api/admin/prosjekter/${encodeURIComponent(prosjektId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ svar: tekst, send: true }),
      })
      const data = (await res.json()) as { ok?: boolean; feil?: string }
      if (!res.ok || !data.ok) {
        setInfo(data.feil ?? "Kunne ikke sende svar.")
        return
      }
      setInfo("Svar sendt.")
      await hent()
    } finally {
      setSendingSvar(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="text-sm text-muted-foreground">
          <Link href="/admin/prosjekter" className="hover:text-foreground">
            Tilbake til prosjekter
          </Link>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Prosjekt</h1>
      </div>

      {state.type === "loading" ? (
        <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          Laster prosjekt…
        </div>
      ) : null}

      {state.type === "error" ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">
            {state.message}
          </div>
          {state.status === 401 ? (
            <Link
              href={`/min-side/login?next=${encodeURIComponent(`/admin/prosjekter/${prosjektId}`)}`}
              className="text-sm underline underline-offset-4"
            >
              Gå til innlogging
            </Link>
          ) : null}
        </div>
      ) : null}

      {state.type === "ready" ? (
        <div className="space-y-6">
          {info ? (
            <div className="rounded-xl border bg-card p-4 text-sm">{info}</div>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border bg-card p-6">
              <h2 className="text-lg font-semibold">Detaljer</h2>
              <dl className="mt-4 grid gap-3 text-sm">
                <div className="flex items-start justify-between gap-4 border-b pb-3">
                  <dt className="text-muted-foreground">Dato</dt>
                  <dd className="text-right">{formatDato(state.prosjekt.created_at) || "—"}</dd>
                </div>
                <div className="flex items-start justify-between gap-4 border-b pb-3">
                  <dt className="text-muted-foreground">Tittel</dt>
                  <dd className="text-right">{state.prosjekt.tittel ?? "—"}</dd>
                </div>
                <div className="flex items-start justify-between gap-4 border-b pb-3">
                  <dt className="text-muted-foreground">Sted</dt>
                  <dd className="text-right">{state.prosjekt.sted ?? "—"}</dd>
                </div>
                <div className="flex items-start justify-between gap-4 border-b pb-3">
                  <dt className="text-muted-foreground">Ønsket støtte</dt>
                  <dd className="text-right">{formatBelop(state.prosjekt.budsjett)}</dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="text-right">{state.prosjekt.status ?? "mottatt"}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-2xl border bg-card p-6">
              <h2 className="text-lg font-semibold">Kontaktinfo</h2>
              <dl className="mt-4 grid gap-3 text-sm">
                <div className="flex items-start justify-between gap-4 border-b pb-3">
                  <dt className="text-muted-foreground">Navn</dt>
                  <dd className="text-right">{state.prosjekt.navn ?? "—"}</dd>
                </div>
                <div className="flex items-start justify-between gap-4 border-b pb-3">
                  <dt className="text-muted-foreground">E-post</dt>
                  <dd className="text-right">{state.prosjekt.epost ?? "—"}</dd>
                </div>
                <div className="flex items-start justify-between gap-4 border-b pb-3">
                  <dt className="text-muted-foreground">Telefon</dt>
                  <dd className="text-right">{state.prosjekt.telefon ?? "—"}</dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-muted-foreground">Medlemsnr.</dt>
                  <dd className="text-right">{state.prosjekt.medlemsnummer ?? "—"}</dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-6">
            <h2 className="text-lg font-semibold">Beskrivelse</h2>
            <div className="mt-3 whitespace-pre-wrap text-sm">
              {state.prosjekt.beskrivelse ?? "—"}
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-6">
            <h2 className="text-lg font-semibold">Vedlegg</h2>
            <div className="mt-3">
              {Array.isArray(state.prosjekt.vedlegg_signed_urls) &&
              state.prosjekt.vedlegg_signed_urls.length ? (
                <div className="flex flex-wrap gap-2">
                  {state.prosjekt.vedlegg_signed_urls.slice(0, 12).map((url, idx) => (
                    <Button
                      key={`${state.prosjekt.id}-vedlegg-${idx}`}
                      variant="outline"
                      onClick={() => apneVedlegg(url)}
                      className="h-8 px-3 text-sm"
                    >
                      Vedlegg {idx + 1}
                    </Button>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Ingen vedlegg.</div>
              )}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border bg-card p-6">
              <h2 className="text-lg font-semibold">Endre status</h2>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className={selectClassName}
                >
                  {statusOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <Button onClick={endreStatus} disabled={savingStatus}>
                  {savingStatus ? "Lagrer…" : "Endre status"}
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border bg-card p-6">
              <h2 className="text-lg font-semibold">Svar til søker</h2>
              <div className="mt-4 space-y-3">
                <Textarea
                  value={svar}
                  onChange={(e) => setSvar(e.target.value)}
                  placeholder="Skriv svar til søker…"
                />
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-muted-foreground">
                    {state.prosjekt.admin_svar_sent_at
                      ? `Sist sendt: ${formatDato(state.prosjekt.admin_svar_sent_at)}`
                      : state.prosjekt.admin_svar_at
                        ? `Sist lagret: ${formatDato(state.prosjekt.admin_svar_at)}`
                        : ""}
                  </div>
                  <Button onClick={sendSvar} disabled={sendingSvar}>
                    {sendingSvar ? "Sender…" : "Send svar"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

