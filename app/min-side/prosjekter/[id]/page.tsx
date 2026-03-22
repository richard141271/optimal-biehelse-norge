"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"

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
  admin_svar?: string | null
  admin_svar_at?: string | null
  admin_svar_sent_at?: string | null
  vedlegg_signed_urls?: string[] | null
  hendelser?: Array<{
    id?: string
    created_at?: string
    type?: string
    message?: string | null
  }>
}

type State =
  | { type: "loading" }
  | { type: "error"; message: string; status?: number }
  | { type: "ready"; prosjekt: Prosjekt; schemaWarning: string | null }

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

export default function MinSideProsjektDetailPage() {
  const params = useParams<{ id?: string }>()
  const prosjektId = String(params?.id ?? "").trim()

  const [state, setState] = useState<State>({ type: "loading" })

  const hent = useCallback(async () => {
    setState({ type: "loading" })
    const res = await fetch(`/api/min-side/prosjekter/${encodeURIComponent(prosjektId)}?ts=${Date.now()}`, {
      cache: "no-store",
    })
    const payload = (await res.json()) as {
      ok?: boolean
      feil?: string
      prosjekt?: Prosjekt
      schemaWarning?: string | null
    }
    if (!res.ok || !payload.ok || !payload.prosjekt) {
      setState({
        type: "error",
        message: payload.feil ?? "Kunne ikke hente prosjekt.",
        status: res.status,
      })
      return
    }
    setState({
      type: "ready",
      prosjekt: payload.prosjekt,
      schemaWarning: payload.schemaWarning ?? null,
    })
  }, [prosjektId])

  useEffect(() => {
    if (!prosjektId) return
    const id = setTimeout(() => void hent(), 0)
    return () => clearTimeout(id)
  }, [hent, prosjektId])

  function lastNedPdf() {
    if (state.type !== "ready") return
    const p = state.prosjekt
    const rows = Array.isArray(p.hendelser)
      ? p.hendelser
          .slice(0, 50)
          .map((h) => {
            const dato = formatDato(h.created_at) || ""
            const type = String(h.type ?? "")
            const msg = String(h.message ?? "")
            return `<tr><td>${dato}</td><td>${type}</td><td>${msg}</td></tr>`
          })
          .join("")
      : ""

    const html = `<!doctype html>
<html lang="nb">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Prosjekt</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 24px; color: #111; }
    h1 { margin: 0 0 6px; font-size: 18px; }
    .meta { margin: 0 0 16px; color: #555; font-size: 12px; }
    .card { border: 1px solid #ddd; border-radius: 10px; padding: 10px; font-size: 12px; margin: 10px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border-bottom: 1px solid #eee; padding: 8px 6px; vertical-align: top; }
    th { text-align: left; color: #555; background: #fafafa; border-top: 1px solid #eee; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>Prosjekt: ${String(p.tittel ?? "—")}</h1>
  <p class="meta">Dato: ${formatDato(p.created_at) || "—"} · Status: ${String(p.status ?? "mottatt")}</p>
  <div class="card"><div style="color:#555">Sted</div><div style="font-weight:600">${String(p.sted ?? "—")}</div></div>
  <div class="card"><div style="color:#555">Ønsket støtte</div><div style="font-weight:600">${formatBelop(p.budsjett)}</div></div>
  <div class="card"><div style="color:#555">Beskrivelse</div><div style="white-space:pre-wrap">${String(p.beskrivelse ?? "—")}</div></div>
  <div class="card"><div style="color:#555">Svar fra OBNO</div><div style="white-space:pre-wrap">${String(p.admin_svar ?? "—")}</div></div>
  ${rows ? `<h2 style="font-size:14px;margin:18px 0 8px;">Logg</h2><table><thead><tr><th>Dato</th><th>Type</th><th>Melding</th></tr></thead><tbody>${rows}</tbody></table>` : ""}
  <script>window.print();</script>
</body>
</html>`

    const w = window.open("", "_blank", "noopener,noreferrer")
    if (!w) return
    w.document.open()
    w.document.write(html)
    w.document.close()
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="text-sm text-muted-foreground">
          <Link href="/min-side" className="hover:text-foreground">
            Tilbake til Min side
          </Link>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Prosjekt</h1>
          <Button variant="outline" onClick={lastNedPdf} disabled={state.type !== "ready"}>
            Last ned PDF
          </Button>
        </div>
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
              href={`/min-side/login?next=${encodeURIComponent(`/min-side/prosjekter/${prosjektId}`)}`}
              className="text-sm underline underline-offset-4"
            >
              Gå til innlogging
            </Link>
          ) : null}
        </div>
      ) : null}

      {state.type === "ready" ? (
        <div className="space-y-6">
          {state.schemaWarning ? (
            <div className="rounded-xl border bg-card p-4 text-sm whitespace-pre-wrap">
              {state.schemaWarning}
            </div>
          ) : null}

          <div className="rounded-2xl border bg-card p-6">
            <h2 className="text-lg font-semibold">Status</h2>
            <div className="mt-2 text-sm">
              {state.prosjekt.status ?? "mottatt"}
            </div>
          </div>

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
              <div className="flex items-start justify-between gap-4">
                <dt className="text-muted-foreground">Ønsket støtte</dt>
                <dd className="text-right">{formatBelop(state.prosjekt.budsjett)}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border bg-card p-6">
            <h2 className="text-lg font-semibold">Beskrivelse</h2>
            <div className="mt-3 whitespace-pre-wrap text-sm">
              {state.prosjekt.beskrivelse ?? "—"}
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-6">
            <h2 className="text-lg font-semibold">Svar fra OBNO</h2>
            <div className="mt-3 whitespace-pre-wrap text-sm">
              {state.prosjekt.admin_svar ? state.prosjekt.admin_svar : "Ingen svar enda."}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {state.prosjekt.admin_svar_sent_at
                ? `Sist sendt: ${formatDato(state.prosjekt.admin_svar_sent_at)}`
                : state.prosjekt.admin_svar_at
                  ? `Sist lagret: ${formatDato(state.prosjekt.admin_svar_at)}`
                  : ""}
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-6">
            <h2 className="text-lg font-semibold">Logg</h2>
            <div className="mt-4 space-y-2 text-sm">
              {Array.isArray(state.prosjekt.hendelser) && state.prosjekt.hendelser.length ? (
                state.prosjekt.hendelser.slice(0, 50).map((h, idx) => (
                  <div
                    key={h.id ?? `${idx}`}
                    className="flex flex-col gap-1 border-b pb-2 last:border-b-0 last:pb-0"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium">{h.type ?? "hendelse"}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDato(h.created_at) || "—"}
                      </div>
                    </div>
                    <div className="text-muted-foreground">{h.message ?? "—"}</div>
                  </div>
                ))
              ) : (
                <div className="text-muted-foreground">Ingen logg enda.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

