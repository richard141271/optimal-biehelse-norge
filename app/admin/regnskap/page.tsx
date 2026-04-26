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
  utlegg_medlem_id?: string | null
  utlegg_medlem_navn?: string | null
  utlegg_medlem_epost?: string | null
  utlegg_status?: string | null
  utlegg_utbetalt_at?: string | null
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

type UtleggMedlem = {
  id?: string
  medlemsnummer?: number | null
  medlemskap_type?: string | null
  navn?: string | null
  epost?: string | null
  aktiv?: boolean | null
  kontingent_gyldig_til?: string | null
}

type UtleggFormState = {
  medlemId: string
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

function isAktivKontingent(gyldigTil?: string | null) {
  if (!gyldigTil) return false
  const d = new Date(gyldigTil)
  if (Number.isNaN(d.getTime())) return false
  return d.getTime() > Date.now()
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

type InntektMal = {
  id: string
  label: string
  vare: string
  belop?: string
}

const builtinInntekter: InntektMal[] = [
  { id: "medlemsavgift", label: "Medlemsavgift (100)", vare: "Medlemsavgift", belop: "100" },
  { id: "stotte", label: "Støttemedlem (300)", vare: "Støttemedlem", belop: "300" },
  { id: "bedrift", label: "Bedriftsmedlem (1000)", vare: "Bedriftsmedlem", belop: "1000" },
  { id: "sponsor", label: "Sponsor", vare: "Sponsor" },
  { id: "stotte2", label: "Støtte", vare: "Støtte" },
  { id: "loddsalg", label: "Loddsalg", vare: "Loddsalg" },
  { id: "salg", label: "Vare/tjeneste", vare: "Vare/tjeneste" },
  { id: "donasjon", label: "Donasjon", vare: "Donasjon" },
]

function normalizeId(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
}

export default function AdminRegnskapPage() {
  const [state, setState] = useState<State>({ type: "loading" })
  const [saving, setSaving] = useState(false)
  const [savingInnstillinger, setSavingInnstillinger] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [minRolle, setMinRolle] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [newMode, setNewMode] = useState<null | "utgift" | "inntekt">(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [motpartOptions, setMotpartOptions] = useState<string[]>([])
  const [inntektMaler, setInntektMaler] = useState<InntektMal[]>([])
  const [kontoNr, setKontoNr] = useState("")
  const [saldo, setSaldo] = useState("")
  const [innstillingerLagret, setInnstillingerLagret] = useState<{
    kontonummer: string
    saldo: string
  } | null>(null)
  const [innstillingerFeil, setInnstillingerFeil] = useState<string | null>(null)
  const [filterQuery, setFilterQuery] = useState("")
  const [filterType, setFilterType] = useState<"alle" | "inntekt" | "utgift">(
    "alle"
  )
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
  const [showUtlegg, setShowUtlegg] = useState(false)
  const [utleggTab, setUtleggTab] = useState<"ny" | "skyldig">("ny")
  const [utleggMedlemmer, setUtleggMedlemmer] = useState<UtleggMedlem[]>([])
  const [utleggMedlemmerFeil, setUtleggMedlemmerFeil] = useState<string | null>(null)
  const [utleggSaving, setUtleggSaving] = useState(false)
  const [utleggOcrLoading, setUtleggOcrLoading] = useState(false)
  const [utleggForm, setUtleggForm] = useState<UtleggFormState>({
    medlemId: "",
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
      innstillinger?: { kontonummer?: string | null; saldo?: number | string | null }
      innstillingerFeil?: string
    }

    if (!res.ok || !payload.ok) {
      setState({
        type: "error",
        message: payload.feil ?? "Kunne ikke hente regnskap.",
        status: res.status,
      })
      setInnstillingerFeil(null)
      return
    }

    setState({ type: "ready", poster: payload.poster ?? [] })
    const kontonummer = String(payload.innstillinger?.kontonummer ?? "")
    const saldoValue = payload.innstillinger?.saldo ?? ""
    const saldoText = saldoValue === null || saldoValue === undefined ? "" : String(saldoValue)
    setKontoNr(kontonummer)
    setSaldo(saldoText)
    setInnstillingerLagret({ kontonummer, saldo: saldoText })
    setInnstillingerFeil(payload.innstillingerFeil ? String(payload.innstillingerFeil) : null)
  }, [])

  useEffect(() => {
    try {
      const m = localStorage.getItem("obno.regnskap.inntektMaler")
      if (m) {
        const parsed = JSON.parse(m) as InntektMal[]
        if (Array.isArray(parsed)) setInntektMaler(parsed)
      }
    } catch {}
  }, [])

  const lagreInnstillinger = useCallback(async () => {
    const kanEndreKonto = minRolle === "admin" || minRolle === "superadmin"
    const kanEndreSaldo = minRolle === "superadmin"
    if (!kanEndreKonto && !kanEndreSaldo) return
    if (!innstillingerLagret) return
    if (savingInnstillinger) return

    const kontonummerChanged = innstillingerLagret.kontonummer !== kontoNr
    const saldoChanged = innstillingerLagret.saldo !== saldo
    const payload: { kontonummer?: string; saldo?: string } = {}
    if (kanEndreKonto && kontonummerChanged) payload.kontonummer = kontoNr
    if (kanEndreSaldo && saldoChanged) payload.saldo = saldo
    if (Object.keys(payload).length === 0) return

    setSavingInnstillinger(true)
    try {
      const res = await fetch("/api/regnskap", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = (await res.json()) as {
        ok?: boolean
        feil?: string
        innstillinger?: { kontonummer?: string | null; saldo?: number | string | null }
      }
      if (!res.ok || !data.ok) {
        alert(data.feil ?? "Kunne ikke lagre innstillinger.")
        return
      }
      const kontonummer = String(data.innstillinger?.kontonummer ?? kontoNr ?? "")
      const saldoValue = data.innstillinger?.saldo ?? saldo
      const saldoText = saldoValue === null || saldoValue === undefined ? "" : String(saldoValue)
      setKontoNr(kontonummer)
      setSaldo(saldoText)
      setInnstillingerLagret({ kontonummer, saldo: saldoText })
    } catch {
      alert("Kunne ikke lagre innstillinger. Sjekk nett og prøv igjen.")
    } finally {
      setSavingInnstillinger(false)
    }
  }, [innstillingerLagret, kontoNr, minRolle, saldo, savingInnstillinger])

  useEffect(() => {
    if (!innstillingerLagret) return
    const kanEndreKonto = minRolle === "admin" || minRolle === "superadmin"
    if (!kanEndreKonto) return
    if (innstillingerLagret.kontonummer === kontoNr) return
    if (savingInnstillinger) return
    const id = setTimeout(() => {
      void lagreInnstillinger()
    }, 800)
    return () => clearTimeout(id)
  }, [kontoNr, innstillingerLagret, lagreInnstillinger, minRolle, savingInnstillinger])

  useEffect(() => {
    if (!innstillingerLagret) return
    const kanEndreSaldo = minRolle === "superadmin"
    if (!kanEndreSaldo) return
    if (innstillingerLagret.saldo === saldo) return
    if (savingInnstillinger) return
    const id = setTimeout(() => {
      void lagreInnstillinger()
    }, 800)
    return () => clearTimeout(id)
  }, [innstillingerLagret, lagreInnstillinger, minRolle, saldo, savingInnstillinger])

  useEffect(() => {
    let active = true
    fetch(`/api/admin/me?ts=${Date.now()}`, { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json()) as { ok?: boolean; role?: string | null }
        if (!active) return
        setMinRolle(data.ok ? (data.role ?? null) : null)
      })
      .catch(() => {
        if (!active) return
        setMinRolle(null)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const id = setTimeout(() => {
      void hent()
    }, 0)
    return () => clearTimeout(id)
  }, [hent])

  useEffect(() => {
    if (state.type !== "ready") return
    const fraPoster = Array.from(
      new Set(
        state.poster
          .map((p) => String(p.motpart ?? "").trim())
          .filter(Boolean)
          .slice(0, 500)
      )
    )

    const id = setTimeout(() => {
      ;(async () => {
        try {
          const res = await fetch(`/api/admin/medlemmer?ts=${Date.now()}`, { cache: "no-store" })
          const data = (await res.json()) as { ok?: boolean; medlemmer?: Array<{ navn?: string | null }> }
          const fraMedlemmer = Array.isArray(data.medlemmer)
            ? Array.from(
                new Set(
                  data.medlemmer
                    .map((m) => String(m.navn ?? "").trim())
                    .filter(Boolean)
                )
              )
            : []
          setMotpartOptions(Array.from(new Set([...fraMedlemmer, ...fraPoster])).slice(0, 800))
        } catch {
          setMotpartOptions(fraPoster)
        }
      })()
    }, 0)

    return () => clearTimeout(id)
  }, [state])

  useEffect(() => {
    return () => {
      if (form.bilagPreviewUrl) URL.revokeObjectURL(form.bilagPreviewUrl)
    }
  }, [form.bilagPreviewUrl])

  function sumInntekterUtgifter(poster: RegnskapPost[]) {
    let inn = 0
    let ut = 0
    for (const p of poster) {
      const bel = typeof p.belop === "number" ? p.belop : Number(String(p.belop ?? "").replace(",", "."))
      if (!Number.isFinite(bel)) continue
      if (p.type === "inntekt") inn += bel
      if (p.type === "utgift") ut += bel
    }
    return { inn, ut, resultat: inn - ut }
  }

  const filtrertePoster =
    state.type === "ready"
      ? state.poster.filter((p) => {
          if (filterType !== "alle" && p.type !== filterType) return false
          const q = filterQuery.trim().toLowerCase()
          if (!q) return true
          const dato = formatDato(p.dato ?? p.created_at) || ""
          const hay = [
            String(p.type ?? ""),
            String(p.belop ?? ""),
            String(p.motpart ?? ""),
            String(p.vare ?? ""),
            String(p.notat ?? ""),
            dato,
          ]
            .join(" ")
            .toLowerCase()
          return hay.includes(q)
        })
      : []

  const skyldigeUtlegg =
    state.type === "ready"
      ? state.poster.filter((p) => String(p.utlegg_status ?? "").toLowerCase() === "skyldig")
      : []

  const skyldigSum = skyldigeUtlegg.reduce((sum, p) => {
    const bel = typeof p.belop === "number" ? p.belop : Number(String(p.belop ?? "").replace(",", "."))
    return Number.isFinite(bel) ? sum + bel : sum
  }, 0)

  function resetFilter() {
    setFilterQuery("")
    setFilterType("alle")
  }

  function apneBudsjett() {
    alert("Budsjett kommer. Foreløpig er dette kun en plassholder i toppmenyen.")
  }

  function apneLokallag() {
    alert("Lokallagsrapporter kommer. Foreløpig er dette kun en plassholder i toppmenyen.")
  }

  function lastNedPdf() {
    if (state.type !== "ready") return
    const { inn, ut, resultat } = sumInntekterUtgifter(state.poster)
    const rows = state.poster
      .map((p) => {
        const dato = formatDato(p.dato ?? p.created_at) || ""
        const type = String(p.type ?? "")
        const belop = formatBelop(p.belop) || ""
        const motpart = String(p.motpart ?? "")
        const vare = String(p.vare ?? "")
        return `<tr><td>${dato}</td><td>${type}</td><td style="text-align:right;">${belop}</td><td>${motpart}</td><td>${vare}</td></tr>`
      })
      .join("")

    const html = `<!doctype html>
<html lang="nb">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Regnskap</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 24px; color: #111; }
    h1 { margin: 0 0 6px; font-size: 18px; }
    .meta { margin: 0 0 16px; color: #555; font-size: 12px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin: 12px 0 16px; }
    .card { border: 1px solid #ddd; border-radius: 10px; padding: 10px; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border-bottom: 1px solid #eee; padding: 8px 6px; vertical-align: top; }
    th { text-align: left; color: #555; background: #fafafa; border-top: 1px solid #eee; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>Regnskap</h1>
  <p class="meta">Oppdatert: ${formatDato(new Date().toISOString())}</p>
  <div class="grid">
    <div class="card"><div style="color:#555">Kontonummer</div><div style="font-weight:600">${kontoNr || "—"}</div></div>
    <div class="card"><div style="color:#555">Saldo</div><div style="font-weight:600">${saldo || "—"}</div></div>
    <div class="card"><div style="color:#555">Resultat</div><div style="font-weight:600">${new Intl.NumberFormat("nb-NO", { style: "currency", currency: "NOK" }).format(resultat)}</div></div>
    <div class="card"><div style="color:#555">Sum inntekter</div><div style="font-weight:600">${new Intl.NumberFormat("nb-NO", { style: "currency", currency: "NOK" }).format(inn)}</div></div>
    <div class="card"><div style="color:#555">Sum utgifter</div><div style="font-weight:600">${new Intl.NumberFormat("nb-NO", { style: "currency", currency: "NOK" }).format(ut)}</div></div>
    <div class="card"><div style="color:#555">Antall poster</div><div style="font-weight:600">${state.poster.length}</div></div>
  </div>
  <table>
    <thead>
      <tr><th>Dato</th><th>Type</th><th style="text-align:right;">Beløp</th><th>Butikk / firma</th><th>Vare / tjeneste</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <script>window.print();</script>
</body>
</html>`

    const w = window.open("", "_blank", "noopener,noreferrer")
    if (!w) return
    w.document.open()
    w.document.write(html)
    w.document.close()
  }

  function velgMode(mode: "utgift" | "inntekt") {
    setEditId(null)
    setNewMode(mode)
    setForm((p) => ({ ...p, type: mode }))
  }

  function apneRedigering(p: RegnskapPost) {
    const type = p.type === "inntekt" ? "inntekt" : "utgift"
    const datoSource = String(p.dato ?? p.created_at ?? todayIso())
    const dato = datoSource.includes("T") ? datoSource.slice(0, 10) : datoSource
    setEditId(p.id)
    setShowNew(true)
    setNewMode(type)
    setForm({
      type,
      dato: dato || todayIso(),
      belop: p.belop === null || p.belop === undefined ? "" : String(p.belop),
      motpart: String(p.motpart ?? ""),
      vare: String(p.vare ?? ""),
      notat: String(p.notat ?? ""),
      bilag: null,
      bilagPreviewUrl: null,
      bilagTekst: null,
    })
  }

  function applyInntektMal(mal: InntektMal) {
    setForm((p) => ({
      ...p,
      type: "inntekt",
      vare: p.vare || mal.vare,
      belop: p.belop || (mal.belop ?? ""),
    }))
    setNewMode("inntekt")
  }

  function lagreSomInntektMal() {
    const vare = form.vare.trim()
    const belop = form.belop.trim()
    if (!vare) {
      alert("Skriv inn vare / tjeneste før du lagrer mal.")
      return
    }
    const id = `custom-${normalizeId(vare)}-${normalizeId(belop || "x")}`
    const label = belop ? `${vare} (${belop})` : vare
    const next: InntektMal[] = [
      { id, label, vare, belop: belop || undefined },
      ...inntektMaler.filter((m) => m.id !== id),
    ].slice(0, 20)
    setInntektMaler(next)
    try {
      localStorage.setItem("obno.regnskap.inntektMaler", JSON.stringify(next))
    } catch {}
  }

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

  const hentUtleggMedlemmer = useCallback(async () => {
    setUtleggMedlemmerFeil(null)
    try {
      const res = await fetch(`/api/admin/medlemmer?ts=${Date.now()}`, { cache: "no-store" })
      const data = (await res.json()) as { ok?: boolean; feil?: string; medlemmer?: UtleggMedlem[] }
      if (!res.ok || !data.ok) {
        setUtleggMedlemmerFeil(data.feil ?? "Kunne ikke hente medlemmer.")
        return
      }
      const alle = (data.medlemmer ?? []) as UtleggMedlem[]
      const betalt = alle.filter((m) => m.aktiv !== false && isAktivKontingent(m.kontingent_gyldig_til ?? null))
      betalt.sort((a, b) => String(a.navn ?? "").localeCompare(String(b.navn ?? ""), "nb-NO", { sensitivity: "base" }))
      setUtleggMedlemmer(betalt)
    } catch {
      setUtleggMedlemmerFeil("Kunne ikke hente medlemmer.")
    }
  }, [])

  async function velgUtleggBilag(file: File | null) {
    setUtleggForm((prev) => {
      if (prev.bilagPreviewUrl) URL.revokeObjectURL(prev.bilagPreviewUrl)
      return {
        ...prev,
        bilag: file,
        bilagPreviewUrl: file ? URL.createObjectURL(file) : null,
        bilagTekst: null,
      }
    })
  }

  async function analyserUtleggBilag() {
    if (!utleggForm.bilag) return
    setUtleggOcrLoading(true)
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

      const result = await recognize(utleggForm.bilag, "eng")
      const rawText = String(result?.data?.text ?? "")
      const normalized = normalizeOcrText(rawText)
      const belop = extractAmount(rawText)
      const motpart = extractVendor(rawText)
      const vare = extractItem(rawText)

      setUtleggForm((prev) => ({
        ...prev,
        belop: prev.belop || belop,
        motpart: prev.motpart || motpart,
        vare: prev.vare || vare,
        bilagTekst: normalized || null,
      }))
    } finally {
      setUtleggOcrLoading(false)
    }
  }

  async function lagreUtlegg() {
    if (utleggSaving) return
    if (!utleggForm.medlemId) {
      alert("Velg et medlem.")
      return
    }
    const medlem = utleggMedlemmer.find((m) => String(m.id ?? "") === utleggForm.medlemId) ?? null
    if (!medlem?.id) {
      alert("Velg et medlem.")
      return
    }
    if (!isAktivKontingent(medlem.kontingent_gyldig_til ?? null)) {
      alert("Medlemmet må ha betalt kontingent (aktivt medlemskap).")
      return
    }

    const belop = utleggForm.belop.trim().replace(",", ".")
    const belopTall = belop ? Number(belop) : NaN
    if (!Number.isFinite(belopTall)) {
      alert("Skriv inn et gyldig beløp.")
      return
    }
    if (utleggForm.bilag && utleggForm.bilag.size > 4 * 1024 * 1024) {
      alert("Bilag er for stort. Maks 4 MB.")
      return
    }

    setUtleggSaving(true)
    try {
      const fd = new FormData()
      fd.set("type", "utgift")
      fd.set("dato", utleggForm.dato)
      fd.set("belop", String(belopTall))
      fd.set("motpart", utleggForm.motpart)
      fd.set("vare", utleggForm.vare)
      fd.set("notat", utleggForm.notat)
      if (utleggForm.bilagTekst) fd.set("bilagTekst", utleggForm.bilagTekst)
      if (utleggForm.bilag) fd.set("bilag", utleggForm.bilag)

      fd.set("utleggMedlemId", String(medlem.id))
      fd.set("utleggMedlemNavn", String(medlem.navn ?? ""))
      fd.set("utleggMedlemEpost", String(medlem.epost ?? ""))
      fd.set("utleggStatus", "skyldig")

      const res = await fetch("/api/regnskap", { method: "POST", body: fd })
      const data = (await res.json()) as { ok?: boolean; feil?: string }
      if (!res.ok || !data.ok) {
        alert(data.feil ?? `Kunne ikke lagre utlegg. (HTTP ${res.status})`)
        return
      }

      setUtleggForm({
        medlemId: "",
        dato: todayIso(),
        belop: "",
        motpart: "",
        vare: "",
        notat: "",
        bilag: null,
        bilagPreviewUrl: null,
        bilagTekst: null,
      })
      setUtleggTab("skyldig")
      await hent()
    } finally {
      setUtleggSaving(false)
    }
  }

  async function markerUtleggUtbetalt(post: RegnskapPost, utbetalt: boolean) {
    const id = String(post.id ?? "").trim()
    if (!id) return
    if (utleggSaving) return
    setUtleggSaving(true)
    try {
      const fd = new FormData()
      fd.set("id", id)
      fd.set("utleggStatus", utbetalt ? "utbetalt" : "skyldig")
      fd.set("utleggUtbetaltAt", utbetalt ? new Date().toISOString() : "")
      const res = await fetch("/api/regnskap", { method: "PATCH", body: fd })
      const data = (await res.json()) as { ok?: boolean; feil?: string }
      if (!res.ok || !data.ok) {
        alert(data.feil ?? `Kunne ikke oppdatere utlegg. (HTTP ${res.status})`)
        return
      }
      await hent()
    } finally {
      setUtleggSaving(false)
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

      if (editId) fd.set("id", editId)

      const res = await fetch("/api/regnskap", {
        method: editId ? "PATCH" : "POST",
        body: fd,
      })
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
      setNewMode(null)
      setEditId(null)
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

  async function slettPost(p: RegnskapPost) {
    if (deletingId) return
    const id = String(p.id ?? "").trim()
    if (!id) return

    const label = [
      formatDato(p.dato ?? p.created_at),
      p.type ?? "",
      formatBelop(p.belop),
      p.motpart ?? "",
      p.vare ?? "",
    ]
      .filter(Boolean)
      .join(" · ")

    const ok = confirm(
      `Slette denne posten?\n\n${label}\n\nHandlingen er uomgjørlig.`
    )
    if (!ok) return

    setDeletingId(id)
    try {
      const res = await fetch("/api/regnskap", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      const data = (await res.json()) as { ok?: boolean; feil?: string }
      if (!res.ok || !data.ok) {
        alert(data.feil ?? `Kunne ikke slette posten. (HTTP ${res.status})`)
        return
      }
      await hent()
    } finally {
      setDeletingId(null)
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
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
            <Input
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Søk i regnskap (beløp, motpart, vare, notat…)"
              className="h-10"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={filterType === "alle" ? "default" : "outline"}
                onClick={() => setFilterType("alle")}
              >
                Alle
              </Button>
              <Button
                type="button"
                size="sm"
                variant={filterType === "inntekt" ? "default" : "outline"}
                onClick={() => setFilterType("inntekt")}
              >
                Inntekter
              </Button>
              <Button
                type="button"
                size="sm"
                variant={filterType === "utgift" ? "default" : "outline"}
                onClick={() => setFilterType("utgift")}
              >
                Utgifter
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={resetFilter}
                disabled={!filterQuery.trim() && filterType === "alle"}
              >
                Tøm
              </Button>
            </div>
          </div>
          {state.type === "ready" ? (
            <div className="mt-1 text-sm text-muted-foreground">
              Viser {filtrertePoster.length} av {state.poster.length}
            </div>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setShowUtlegg(true)
              setUtleggTab("ny")
              void hentUtleggMedlemmer()
            }}
          >
            Utlegg
          </Button>
          <Button variant="outline" onClick={hent}>
            Oppdater
          </Button>
          <Button variant="outline" onClick={lastNedPdf} disabled={state.type !== "ready"}>
            Last ned PDF
          </Button>
          <Button
            variant="outline"
            onClick={apneBudsjett}
          >
            Lag budsjett
          </Button>
          <Button
            variant="outline"
            onClick={apneLokallag}
          >
            Lokallag
          </Button>
          <Button
            onClick={() => {
              if (showNew) {
                setShowNew(false)
                setNewMode(null)
                setEditId(null)
                void velgBilag(null)
                return
              }
              setShowNew(true)
            }}
          >
            {showNew ? "Lukk" : "Ny post"}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="kontonr">Kontonummer</Label>
            <Input
              id="kontonr"
              value={kontoNr}
              onChange={(e) => {
                setKontoNr(e.target.value)
              }}
              onBlur={() => void lagreInnstillinger()}
              placeholder="Kontonummer til foreningen"
              className="h-10"
              disabled={(minRolle !== "admin" && minRolle !== "superadmin") || savingInnstillinger}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="saldo">Saldo</Label>
            <Input
              id="saldo"
              inputMode="decimal"
              value={saldo}
              onChange={(e) => {
                setSaldo(e.target.value)
              }}
              onBlur={() => void lagreInnstillinger()}
              placeholder="0,00"
              className="h-10"
              disabled={minRolle !== "superadmin" || savingInnstillinger}
            />
          </div>
        </div>
        {state.type === "ready" ? (
          <div className="mt-3 text-sm text-muted-foreground">
            Sum inntekter:{" "}
            <span className="text-foreground">
              {formatBelop(sumInntekterUtgifter(state.poster).inn)}
            </span>{" "}
            · Sum utgifter:{" "}
            <span className="text-foreground">
              {formatBelop(sumInntekterUtgifter(state.poster).ut)}
            </span>{" "}
            · Resultat:{" "}
            <span className="text-foreground">
              {formatBelop(sumInntekterUtgifter(state.poster).resultat)}
            </span>
          </div>
        ) : null}
      </div>

      {innstillingerFeil ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive whitespace-pre-wrap">
          {innstillingerFeil}
        </div>
      ) : null}

      {showNew ? (
        <div className="rounded-xl border bg-card p-5">
          {newMode == null ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Button
                type="button"
                className="h-14 text-base"
                onClick={() => velgMode("utgift")}
              >
                Utgift
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-14 text-base"
                onClick={() => velgMode("inntekt")}
              >
                Inntekt
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                {editId ? "Rediger post" : "Ny post"}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={form.type === "utgift" ? "default" : "outline"}
                  onClick={() => {
                    setForm((p) => ({ ...p, type: "utgift" }))
                    setNewMode("utgift")
                  }}
                >
                  Utgift
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={form.type === "inntekt" ? "default" : "outline"}
                  onClick={() => {
                    setForm((p) => ({ ...p, type: "inntekt" }))
                    setNewMode("inntekt")
                  }}
                >
                  Inntekt
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="dato">Dato</Label>
                  <Input
                    id="dato"
                    type="date"
                    value={form.dato}
                    onChange={(e) => setForm((p) => ({ ...p, dato: e.target.value }))}
                    className="h-10"
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
                    className="h-10"
                  />
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="motpart">Butikk / firma</Label>
                  <Input
                    id="motpart"
                    value={form.motpart}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, motpart: e.target.value }))
                    }
                    placeholder="F.eks. Biltema, Coop, Posten"
                    list="motpart-options"
                    className="h-10"
                  />
                  <datalist id="motpart-options">
                    {motpartOptions.map((v) => (
                      <option key={v} value={v} />
                    ))}
                  </datalist>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vare">Vare / tjeneste</Label>
                  {form.type === "inntekt" ? (
                    <div className="flex flex-wrap gap-2">
                      {[...builtinInntekter, ...inntektMaler].slice(0, 20).map((m) => (
                        <Button
                          key={m.id}
                          type="button"
                          variant="outline"
                          className="h-8 px-3 text-sm"
                          onClick={() => applyInntektMal(m)}
                        >
                          {m.label}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                  <Input
                    id="vare"
                    value={form.vare}
                    onChange={(e) => setForm((p) => ({ ...p, vare: e.target.value }))}
                    placeholder="F.eks. fôr, utstyr, leie"
                    className="h-10"
                  />
                  {form.type === "inntekt" ? (
                    <div className="flex justify-end">
                      <Button type="button" variant="outline" onClick={lagreSomInntektMal}>
                        Lagre som mal
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notat">Notat</Label>
                <Textarea
                  id="notat"
                  value={form.notat}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, notat: e.target.value }))
                  }
                  placeholder="Hva gjelder posten?"
                  className="min-h-28"
                />
              </div>

              <div className="space-y-2">
                <Label>Bilag (foto)</Label>
                <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
                  <Input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => velgBilag(e.target.files?.[0] ?? null)}
                    className="h-10"
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
          )}

          <div className="mt-5 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowNew(false)
                setNewMode(null)
                setEditId(null)
                velgBilag(null)
              }}
            >
              Avbryt
            </Button>
            <Button onClick={lagre} disabled={saving}>
              {saving ? "Lagrer…" : editId ? "Oppdater post" : "Lagre post"}
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
                  <th className="whitespace-nowrap px-4 py-3 text-right font-medium">
                    Handling
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtrertePoster.map((p) => (
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
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => apneRedigering(p)}
                      >
                        Åpne/rediger
                      </Button>
                      {minRolle === "superadmin" ? (
                        <Button
                          size="sm"
                          variant="destructive"
                          className="ml-2"
                          disabled={deletingId === p.id}
                          onClick={() => void slettPost(p)}
                        >
                          Slett
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {filtrertePoster.length === 0 ? (
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

      {showUtlegg ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowUtlegg(false)}
        >
          <div
            className="w-full max-w-4xl rounded-2xl border bg-card p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">Utlegg</div>
                <div className="text-sm text-muted-foreground">
                  Knytt en utgift til et medlem, og hold oversikt over det som er skyldig.
                </div>
              </div>
              <Button variant="outline" onClick={() => setShowUtlegg(false)}>
                Lukk
              </Button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                variant={utleggTab === "ny" ? "default" : "outline"}
                onClick={() => {
                  setUtleggTab("ny")
                  void hentUtleggMedlemmer()
                }}
              >
                Nytt utlegg
              </Button>
              <Button
                type="button"
                variant={utleggTab === "skyldig" ? "default" : "outline"}
                onClick={() => setUtleggTab("skyldig")}
              >
                Skyldig ({skyldigeUtlegg.length})
              </Button>
            </div>

            {utleggMedlemmerFeil ? (
              <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive whitespace-pre-wrap">
                {utleggMedlemmerFeil}
              </div>
            ) : null}

            {utleggTab === "ny" ? (
              <div className="mt-5 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Medlem (betalt kontingent)</Label>
                    <select
                      value={utleggForm.medlemId}
                      onChange={(e) => setUtleggForm((p) => ({ ...p, medlemId: e.target.value }))}
                      className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                    >
                      <option value="">Velg medlem…</option>
                      {utleggMedlemmer.map((m) => (
                        <option key={String(m.id ?? "")} value={String(m.id ?? "")}>
                          {String(m.navn ?? "").trim() || "Ukjent"}{m.medlemsnummer ? ` (#${m.medlemsnummer})` : ""}{m.epost ? ` · ${m.epost}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Dato</Label>
                    <Input
                      type="date"
                      value={utleggForm.dato}
                      onChange={(e) => setUtleggForm((p) => ({ ...p, dato: e.target.value }))}
                      className="h-10"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Beløp (NOK)</Label>
                    <Input
                      inputMode="decimal"
                      value={utleggForm.belop}
                      onChange={(e) => setUtleggForm((p) => ({ ...p, belop: e.target.value }))}
                      placeholder="0,00"
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Butikk / firma</Label>
                    <Input
                      value={utleggForm.motpart}
                      onChange={(e) => setUtleggForm((p) => ({ ...p, motpart: e.target.value }))}
                      placeholder="F.eks. Biltema, Coop, Posten"
                      className="h-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Vare / tjeneste</Label>
                  <Input
                    value={utleggForm.vare}
                    onChange={(e) => setUtleggForm((p) => ({ ...p, vare: e.target.value }))}
                    placeholder="F.eks. utstyr, fôr, kjøring"
                    className="h-10"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Notat</Label>
                  <Textarea
                    value={utleggForm.notat}
                    onChange={(e) => setUtleggForm((p) => ({ ...p, notat: e.target.value }))}
                    placeholder="Kort forklaring"
                    className="min-h-24"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Kvittering (foto)</Label>
                  <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
                    <Input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => void velgUtleggBilag(e.target.files?.[0] ?? null)}
                      className="h-10"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!utleggForm.bilag || utleggOcrLoading}
                      onClick={() => void analyserUtleggBilag()}
                    >
                      {utleggOcrLoading ? "Analyserer…" : "Les kvittering"}
                    </Button>
                  </div>
                  {utleggForm.bilagPreviewUrl ? (
                    <div className="mt-3 overflow-hidden rounded-xl border bg-background">
                      <Image
                        src={utleggForm.bilagPreviewUrl}
                        alt="Forhåndsvisning av kvittering"
                        width={1200}
                        height={1200}
                        className="h-auto w-full"
                        unoptimized
                      />
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowUtlegg(false)} disabled={utleggSaving}>
                    Avbryt
                  </Button>
                  <Button onClick={() => void lagreUtlegg()} disabled={utleggSaving}>
                    {utleggSaving ? "Lagrer…" : "Lagre utlegg"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                <div className="rounded-xl border bg-background p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-muted-foreground">Sum skyldig</div>
                    <div className="font-semibold">{formatBelop(skyldigSum)}</div>
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border bg-background">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-muted/30 text-left text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium">Dato</th>
                        <th className="px-4 py-3 font-medium">Medlem</th>
                        <th className="px-4 py-3 font-medium">Hva</th>
                        <th className="px-4 py-3 font-medium">Beløp</th>
                        <th className="px-4 py-3 font-medium">Bilag</th>
                        <th className="px-4 py-3 font-medium text-right">Handling</th>
                      </tr>
                    </thead>
                    <tbody>
                      {skyldigeUtlegg.length === 0 ? (
                        <tr className="border-b">
                          <td className="px-4 py-6 text-muted-foreground" colSpan={6}>
                            Ingen skyldige utlegg.
                          </td>
                        </tr>
                      ) : (
                        skyldigeUtlegg.map((p) => (
                          <tr key={p.id} className="border-b">
                            <td className="whitespace-nowrap px-4 py-3">{formatDato(p.dato ?? p.created_at)}</td>
                            <td className="px-4 py-3">
                              {String(p.utlegg_medlem_navn ?? "").trim() ||
                                String(p.utlegg_medlem_epost ?? "").trim() ||
                                "—"}
                            </td>
                            <td className="px-4 py-3">
                              {[String(p.vare ?? "").trim(), String(p.motpart ?? "").trim()].filter(Boolean).join(" · ") || "—"}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3">{formatBelop(p.belop)}</td>
                            <td className="whitespace-nowrap px-4 py-3">
                              {p.bilag_url ? (
                                <Button size="sm" variant="outline" onClick={() => apneBilag(p.bilag_url as string)}>
                                  Åpne
                                </Button>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-right">
                              <Button
                                size="sm"
                                className="bg-emerald-600 text-white hover:bg-emerald-600/90"
                                disabled={utleggSaving}
                                onClick={() => void markerUtleggUtbetalt(p, true)}
                              >
                                Marker utbetalt
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
