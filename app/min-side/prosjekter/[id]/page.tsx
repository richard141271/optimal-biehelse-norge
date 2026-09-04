"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

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
  vedlegg?: Array<{ path?: string; url?: string }> | null
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
  const [vedleggFiles, setVedleggFiles] = useState<File[]>([])
  const [vedleggInputKey, setVedleggInputKey] = useState(0)
  const [vedleggKommentar, setVedleggKommentar] = useState("")
  const [sletterPath, setSletterPath] = useState<string | null>(null)
  const [vedleggStatus, setVedleggStatus] = useState<
    | { type: "idle" }
    | { type: "uploading"; uploaded: number; total: number }
    | { type: "success"; message: string }
    | { type: "error"; message: string }
  >({ type: "idle" })
  const [kommentarStatus, setKommentarStatus] = useState<
    | { type: "idle" }
    | { type: "saving" }
    | { type: "success"; message: string }
    | { type: "error"; message: string }
  >({ type: "idle" })

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

    try {
      const blob = new Blob([html], { type: "text/html;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const w = window.open(url, "_blank", "noopener,noreferrer")
      if (w) {
        setTimeout(() => {
          try {
            URL.revokeObjectURL(url)
          } catch {}
        }, 10000)
        return
      }
    } catch {}

    try {
      const a = document.createElement("a")
      const blob = new Blob([html], { type: "text/html;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      a.href = url
      const navn = (p.tittel ?? "prosjekt")
        .replace(/[^\p{L}\p{N}\s_-]+/gu, "-")
        .replace(/\s+/g, "-")
        .slice(0, 60)
      a.download = `${navn || "prosjekt"}.html`
      document.body.appendChild(a)
      a.click()
      setTimeout(() => {
        a.remove()
        try {
          URL.revokeObjectURL(url)
        } catch {}
      }, 10000)
    } catch {}
  }

  async function lagreKommentar() {
    const kommentar = vedleggKommentar.trim()
    if (!kommentar) {
      setKommentarStatus({ type: "error", message: "Skriv en kommentar først." })
      return
    }
    if (kommentarStatus.type === "saving" || vedleggStatus.type === "uploading") return

    setKommentarStatus({ type: "saving" })
    try {
      const res = await fetch(
        `/api/min-side/prosjekter/${encodeURIComponent(prosjektId)}/kommentar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kommentar }),
        }
      )
      const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; feil?: string }
      if (!res.ok || !payload.ok) {
        setKommentarStatus({
          type: "error",
          message: payload.feil ?? "Kunne ikke lagre kommentaren. Prøv igjen.",
        })
        return
      }
      setVedleggKommentar("")
      setKommentarStatus({ type: "success", message: "Kommentaren din er lagret." })
      await hent()
    } catch {
      setKommentarStatus({ type: "error", message: "Kunne ikke lagre kommentaren. Prøv igjen." })
    }
  }

  async function lastOppVedlegg(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!vedleggFiles.length) {
      setVedleggStatus({ type: "error", message: "Velg minst én fil." })
      return
    }
    const supabase = createSupabaseBrowserClient()
    if (!supabase) {
      setVedleggStatus({ type: "error", message: "Supabase er ikke konfigurert." })
      return
    }
    const total = vedleggFiles.length
    setVedleggStatus({ type: "uploading", uploaded: 0, total })
    try {
      const kommentar = vedleggKommentar.trim()
      for (let i = 0; i < vedleggFiles.length; i++) {
        const file = vedleggFiles[i]
        const name = String(file.name ?? "").trim() || "vedlegg"
        const type = String(file.type ?? "").trim()

        const tokenRes = await fetch(
          `/api/min-side/prosjekter/${encodeURIComponent(prosjektId)}/upload-token`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name, type, size: file.size }),
          }
        )
        const tokenPayload = (await tokenRes.json().catch(() => null)) as
          | { ok?: boolean; feil?: string; path?: string; token?: string }
          | null
        if (!tokenRes.ok || !tokenPayload?.ok || !tokenPayload.path || !tokenPayload.token) {
          setVedleggStatus({
            type: "error",
            message: tokenPayload?.feil ?? "Kunne ikke starte opplasting.",
          })
          return
        }

        const signedPath = String(tokenPayload.path)
        const signedToken = String(tokenPayload.token)
        const uploadRes = await supabase.storage
          .from("prosjekt-vedlegg")
          .uploadToSignedUrl(signedPath, signedToken, file, {
            contentType: type || undefined,
          })
        if (uploadRes.error) {
          setVedleggStatus({
            type: "error",
            message: `Kunne ikke laste opp ${name}: ${uploadRes.error.message}`,
          })
          return
        }

        const registerRes = await fetch(
          `/api/min-side/prosjekter/${encodeURIComponent(prosjektId)}/register-vedlegg`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              items: [{ path: signedPath, name, type, size: file.size }],
              kommentar: i === 0 ? kommentar : "",
              totalCount: i === 0 ? total : undefined,
              skipLog: i !== 0,
            }),
          }
        )
        const registerPayload = (await registerRes.json().catch(() => null)) as
          | { ok?: boolean; feil?: string }
          | null
        if (!registerRes.ok || !registerPayload?.ok) {
          setVedleggStatus({
            type: "error",
            message: registerPayload?.feil ?? "Kunne ikke lagre vedlegg på prosjektet.",
          })
          return
        }

        setVedleggStatus({ type: "uploading", uploaded: i + 1, total })
      }
      setVedleggFiles([])
      setVedleggInputKey((k) => k + 1)
      setVedleggKommentar("")
      setVedleggStatus({ type: "success", message: "Vedlegg lastet opp." })
      await hent()
    } catch {
      setVedleggStatus({ type: "error", message: "Kunne ikke laste opp vedlegg." })
    }
  }

  async function slettVedlegg(path: string) {
    const safePath = String(path ?? "").trim()
    if (!safePath) return
    const confirmed = window.confirm("Vil du slette dette vedlegget?")
    if (!confirmed) return
    setSletterPath(safePath)
    setVedleggStatus({ type: "idle" })
    try {
      const res = await fetch(
        `/api/min-side/prosjekter/${encodeURIComponent(prosjektId)}?path=${encodeURIComponent(safePath)}`,
        {
          method: "DELETE",
        }
      )
      const payload = (await res.json()) as { ok?: boolean; feil?: string }
      if (!res.ok || !payload.ok) {
        setVedleggStatus({
          type: "error",
          message: payload.feil ?? "Kunne ikke slette vedlegg.",
        })
        return
      }
      setVedleggStatus({ type: "success", message: "Vedlegg slettet." })
      await hent()
    } catch {
      setVedleggStatus({ type: "error", message: "Kunne ikke slette vedlegg." })
    } finally {
      setSletterPath(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-4 sm:px-6">
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
            <h2 className="text-lg font-semibold">Vedlegg</h2>
            <div className="mt-2 text-sm text-muted-foreground">
              Last opp flere bilder, filer, kvitteringer eller fakturaer underveis i prosjektet.
            </div>

            {Array.isArray(state.prosjekt.vedlegg) && state.prosjekt.vedlegg.length ? (
              <div className="mt-4 grid gap-2 text-sm">
                {state.prosjekt.vedlegg.map((item, idx) => {
                  const path = String(item.path ?? "")
                  const url = String(item.url ?? "")
                  const name = path.split("/").pop() || `Vedlegg ${idx + 1}`
                  if (!url) return null
                  return (
                    <div
                      key={`${path}-${idx}`}
                      className="flex flex-col gap-2 rounded-lg border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="min-w-0 truncate underline underline-offset-4 hover:text-foreground"
                      >
                        {name}
                      </a>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void slettVedlegg(path)}
                        disabled={sletterPath === path || vedleggStatus.type === "uploading"}
                      >
                        {sletterPath === path ? "Sletter…" : "Slett"}
                      </Button>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="mt-4 text-sm text-muted-foreground">Ingen vedlegg lastet opp enda.</div>
            )}

            <form className="mt-5 space-y-4" onSubmit={lastOppVedlegg}>
              <div className="space-y-2">
                <Label htmlFor="prosjekt_kommentar">Kommentar (valgfri)</Label>
                <Textarea
                  id="prosjekt_kommentar"
                  value={vedleggKommentar}
                  onChange={(e) => {
                    setVedleggKommentar(e.target.value)
                    if (kommentarStatus.type !== "idle") setKommentarStatus({ type: "idle" })
                    if (vedleggStatus.type === "error") setVedleggStatus({ type: "idle" })
                  }}
                  placeholder="F.eks. her kommer bilder av fremdrift, eller kvitteringer/fakturaer som er betalt."
                  className="min-h-24"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void lagreKommentar()}
                    disabled={kommentarStatus.type === "saving" || vedleggStatus.type === "uploading"}
                  >
                    {kommentarStatus.type === "saving" ? "Lagrer kommentar…" : "Lagre kommentar"}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="prosjekt_vedlegg">Velg filer</Label>
                <Input
                  key={vedleggInputKey}
                  id="prosjekt_vedlegg"
                  type="file"
                  multiple
                  onChange={(e) => {
                    setVedleggFiles(Array.from(e.target.files ?? []))
                    if (vedleggStatus.type === "error") setVedleggStatus({ type: "idle" })
                  }}
                />
                {vedleggFiles.length ? (
                  <div className="text-sm text-muted-foreground">
                    {vedleggFiles.length} fil(er) valgt
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="submit" disabled={vedleggStatus.type === "uploading" || kommentarStatus.type === "saving"}>
                  {vedleggStatus.type === "uploading"
                    ? `Laster opp… (${vedleggStatus.uploaded}/${vedleggStatus.total})`
                    : "Last opp vedlegg"}
                </Button>
              </div>
              {kommentarStatus.type === "success" ? (
                <div className="text-sm text-emerald-700">{kommentarStatus.message}</div>
              ) : null}
              {kommentarStatus.type === "error" ? (
                <div className="text-sm text-destructive">{kommentarStatus.message}</div>
              ) : null}
              {vedleggStatus.type === "success" ? (
                <div className="text-sm text-emerald-700">{vedleggStatus.message}</div>
              ) : null}
              {vedleggStatus.type === "error" ? (
                <div className="text-sm text-destructive">{vedleggStatus.message}</div>
              ) : null}
            </form>
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
