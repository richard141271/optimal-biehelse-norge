"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type RegnskapPost = {
  id: string
  created_at?: string
  dato?: string
  type?: "inntekt" | "utgift" | string
  belop?: number | string
  motpart?: string
  vare?: string
  notat?: string
  bilag_path?: string | null
  bilag_url?: string | null
  kilde?: string | null
}

type State =
  | { type: "loading" }
  | { type: "error"; message: string; status?: number }
  | { type: "ready"; poster: RegnskapPost[] }

type FormState = {
  type: "utgift" | "inntekt"
  dato: string
  belop: string
  motpart: string
  vare: string
  notat: string
  bilag: File | null
  bilagPreviewUrl: string | null
  bilagTekst: string | null
}

function formatBelop(value?: number | string) {
  if (value === null || value === undefined) return ""
  const n =
    typeof value === "number"
      ? value
      : Number(String(value).replace(",", "."))
  if (!Number.isFinite(n)) return ""
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
  }).format(n)
}

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

function todayIso() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function normalizeOcrText(text: string) {
  return text.replace(/\s+/g, " ").trim()
}

function extractAmount(text: string) {
  const upper = text.toUpperCase()
  const patterns = [
    /(?:TOTAL|SUM|Å\s*BETALE|TIL\s*BETALING|BEL[ØO]P)\s*[:\-]?\s*(\d{1,3}(?:[ .]\d{3})*[,.]\d{2})/,
    /(?:KR|NOK)\s*(\d{1,3}(?:[ .]\d{3})*[,.]\d{2})/,
  ]

  for (const p of patterns) {
    const m = upper.match(p)
    if (m?.[1]) {
      return m[1].replace(" ", "").replace(".", "").replace(",", ".")
    }
  }

  const all = upper.match(/\d{1,3}(?:[ .]\d{3})*[,.]\d{2}/g) ?? []
  const candidates = all
    .map((s) => s.replace(" ", "").replace(".", "").replace(",", "."))
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => b - a)
  return candidates[0] ? String(candidates[0]) : ""
}

function extractVendor(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const blacklist = [
    "KVITTERING",
    "TOTAL",
    "SUM",
    "MVA",
    "ORG",
    "ORGNR",
    "ORG.NR",
    "KASSA",
  ]
  for (const line of lines.slice(0, 6)) {
    const up = line.toUpperCase()
    if (blacklist.some((b) => up.includes(b))) continue
    if (line.length < 3) continue
    return line
  }
  return ""
}

function extractItem(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const blacklist = [
    "KVITTERING",
    "TOTAL",
    "SUM",
    "MVA",
    "ORG",
    "ORGNR",
    "KASSE",
  ]
  for (const line of lines.slice(0, 20)) {
    const up = line.toUpperCase()
    if (blacklist.some((b) => up.includes(b))) continue
    if (/\d{1,3}(?:[ .]\d{3})*[,.]\d{2}/.test(line)) continue
    if (line.length < 4) continue
    return line
  }
  return ""
}

export default function AdminRegnskapPage() {
  const [state, setState] = useState<State>({ type: "loading" })
  const [saving, setSaving] = useState(false)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState<FormState>({
    type: "utgift",
    dato: todayIso(),
    belop: "",
    motpart: "",
    vare: "",
    notat: "",
    bilag: null,
    bilagPreviewUrl: null,
    bilagTekst: null,
  })

  const hent = useCallback(async () => {
    setState({ type: "loading" })
    const res = await fetch("/api/regnskap", { cache: "no-store" })
    const payload = (await res.json()) as {
      ok?: boolean
      feil?: string
      poster?: RegnskapPost[]
    }

    if (!res.ok || !payload.ok) {
      setState({
        type: "error",
        message: payload.feil ?? "Kunne ikke hente regnskap.",
        status: res.status,
      })
      return
    }

    setState({ type: "ready", poster: payload.poster ?? [] })
  }, [])

  useEffect(() => {
    const id = setTimeout(() => {
      void hent()
    }, 0)
    return () => clearTimeout(id)
  }, [hent])

  useEffect(() => {
    return () => {
      if (form.bilagPreviewUrl) URL.revokeObjectURL(form.bilagPreviewUrl)
    }
  }, [form.bilagPreviewUrl])

  async function velgBilag(file: File | null) {
    setForm((prev) => {
      if (prev.bilagPreviewUrl) URL.revokeObjectURL(prev.bilagPreviewUrl)
      return {
        ...prev,
        bilag: file,
        bilagPreviewUrl: file ? URL.createObjectURL(file) : null,
        bilagTekst: null,
      }
    })
  }

  async function analyserBilag() {
    if (!form.bilag) return
    setOcrLoading(true)
    try {
      type TesseractModule = {
        recognize: (
          image: File | Blob,
          lang: string
        ) => Promise<{ data?: { text?: string } }>
      }

      const { recognize } = (await import(
        "tesseract.js"
      )) as unknown as TesseractModule

      const result = await recognize(form.bilag, "eng")
      const rawText = String(result?.data?.text ?? "")
      const normalized = normalizeOcrText(rawText)
      const belop = extractAmount(rawText)
      const motpart = extractVendor(rawText)
      const vare = extractItem(rawText)

      setForm((prev) => ({
        ...prev,
        belop: prev.belop || belop,
        motpart: prev.motpart || motpart,
        vare: prev.vare || vare,
        bilagTekst: normalized || null,
      }))
    } finally {
      setOcrLoading(false)
    }
  }

  async function apneBilag(url: string) {
    window.open(url, "_blank", "noopener,noreferrer")
  }

  async function lagre() {
    if (saving) return
    const belop = form.belop.trim().replace(",", ".")
    const belopTall = belop ? Number(belop) : NaN
    if (!Number.isFinite(belopTall)) {
      alert("Skriv inn et gyldig beløp.")
      return
    }
    if (form.bilag && form.bilag.size > 4 * 1024 * 1024) {
      alert("Bilag er for stort. Maks 4 MB.")
      return
    }

    setSaving(true)
    try {
      const fd = new FormData()
      fd.set("type", form.type)
      fd.set("dato", form.dato)
      fd.set("belop", String(belopTall))
      fd.set("motpart", form.motpart)
      fd.set("vare", form.vare)
      fd.set("notat", form.notat)
      if (form.bilagTekst) fd.set("bilagTekst", form.bilagTekst)
      if (form.bilag) fd.set("bilag", form.bilag)

      const res = await fetch("/api/regnskap", { method: "POST", body: fd })
      let payload: { ok?: boolean; feil?: string } | null = null
      try {
        payload = (await res.json()) as { ok?: boolean; feil?: string }
      } catch {
        payload = null
      }
      if (!res.ok || !payload?.ok) {
        const msg = payload?.feil?.trim()
        alert(msg || `Kunne ikke lagre regnskapspost. (HTTP ${res.status})`)
        return
      }

      setShowNew(false)
      setForm({
        type: "utgift",
        dato: todayIso(),
        belop: "",
        motpart: "",
        vare: "",
        notat: "",
        bilag: null,
        bilagPreviewUrl: null,
        bilagTekst: null,
      })
      await hent()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Regnskap</h1>
          <p className="text-muted-foreground">
            Inntekter, utgifter og bilag.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={hent}>
            Oppdater
          </Button>
          <Button onClick={() => setShowNew((v) => !v)}>
            {showNew ? "Lukk" : "Ny post"}
          </Button>
        </div>
      </div>

      {showNew ? (
        <div className="rounded-xl border bg-card p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Type</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={form.type === "utgift" ? "default" : "outline"}
                  onClick={() => setForm((p) => ({ ...p, type: "utgift" }))}
                >
                  Utgift
                </Button>
                <Button
                  type="button"
                  variant={form.type === "inntekt" ? "default" : "outline"}
                  onClick={() => setForm((p) => ({ ...p, type: "inntekt" }))}
                >
                  Inntekt
                </Button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="dato">Dato</Label>
                <Input
                  id="dato"
                  type="date"
                  value={form.dato}
                  onChange={(e) => setForm((p) => ({ ...p, dato: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="belop">Beløp (NOK)</Label>
                <Input
                  id="belop"
                  inputMode="decimal"
                  value={form.belop}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, belop: e.target.value }))
                  }
                  placeholder="0,00"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="motpart">Butikk / firma</Label>
              <Input
                id="motpart"
                value={form.motpart}
                onChange={(e) =>
                  setForm((p) => ({ ...p, motpart: e.target.value }))
                }
                placeholder="F.eks. Biltema, Coop, Posten"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="vare">Vare / tjeneste</Label>
              <Input
                id="vare"
                value={form.vare}
                onChange={(e) => setForm((p) => ({ ...p, vare: e.target.value }))}
                placeholder="F.eks. fôr, utstyr, leie"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="notat">Notat</Label>
              <Textarea
                id="notat"
                value={form.notat}
                onChange={(e) =>
                  setForm((p) => ({ ...p, notat: e.target.value }))
                }
                placeholder="Hva gjelder posten?"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Bilag (foto)</Label>
              <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
                <Input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => velgBilag(e.target.files?.[0] ?? null)}
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!form.bilag || ocrLoading}
                    onClick={analyserBilag}
                  >
                    {ocrLoading ? "Analyserer…" : "Analyser bilag"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => velgBilag(null)}
                  >
                    Fjern
                  </Button>
                </div>
              </div>
              {form.bilagPreviewUrl ? (
                <div className="overflow-hidden rounded-xl border bg-muted/30">
                  <Image
                    src={form.bilagPreviewUrl}
                    alt="Forhåndsvisning av bilag"
                    className="h-auto w-full"
                    width={1200}
                    height={800}
                    unoptimized
                  />
                </div>
              ) : null}
              {form.bilagTekst ? (
                <div className="rounded-xl border bg-muted/30 p-3 text-sm text-muted-foreground">
                  OCR-forslag er fylt inn der det var mulig.
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-5 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowNew(false)
                velgBilag(null)
              }}
            >
              Avbryt
            </Button>
            <Button onClick={lagre} disabled={saving}>
              {saving ? "Lagrer…" : "Lagre post"}
            </Button>
          </div>
        </div>
      ) : null}

      {state.type === "loading" ? (
        <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          Laster regnskap…
        </div>
      ) : null}

      {state.type === "error" ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">
            {state.message}
          </div>
          {state.status === 401 ? (
            <Link
              href={`/min-side/login?next=${encodeURIComponent("/admin/regnskap")}`}
              className="text-sm underline underline-offset-4"
            >
              Gå til innlogging
            </Link>
          ) : null}
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
                    Type
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-left font-medium">
                    Beløp
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-left font-medium">
                    Butikk / firma
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-left font-medium">
                    Vare
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 text-left font-medium">
                    Bilag
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.poster.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="whitespace-nowrap px-4 py-3">
                      {formatDato(p.dato ?? p.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {p.type ?? ""}
                      {p.kilde ? (
                        <span className="ml-2 rounded-md border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {p.kilde}
                        </span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {formatBelop(p.belop)}
                    </td>
                    <td className="px-4 py-3">{p.motpart ?? ""}</td>
                    <td className="px-4 py-3">{p.vare ?? ""}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {p.bilag_url ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => apneBilag(p.bilag_url as string)}
                        >
                          Åpne
                        </Button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {state.poster.length === 0 ? (
                  <tr className="border-t">
                    <td
                      colSpan={6}
                      className="px-4 py-6 text-center text-muted-foreground"
                    >
                      Ingen poster enda.
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
