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

type RegnskapLoggEntry = {
  id: string
  created_at?: string | null
  actor_epost?: string | null
  actor_role?: string | null
  action?: string | null
  entity_type?: string | null
  entity_id?: string | null
  before?: unknown
  after?: unknown
  korreksjon_notat?: string | null
  korreksjon_at?: string | null
  korreksjon_av_epost?: string | null
}

type State =
  | { type: "loading" }
  | { type: "error"; message: string; status?: number }
  | { type: "ready"; poster: RegnskapPost[] }

type LoggState =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "error"; message: string }
  | { type: "ready"; entries: RegnskapLoggEntry[] }

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

const MAX_BILAG_BYTES = 20 * 1024 * 1024

function formatBelop(value?: number | string) {
  if (value === null || value === undefined) return ""
  const n = typeof value === "number" ? value : parseMoneyInput(String(value))
  if (n === null || !Number.isFinite(n)) return ""
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

function formatDatoTid(value?: string | null) {
  if (!value) return ""
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString("nb-NO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
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

function parseMoneyInput(value: string) {
  const trimmed = value.trim().replace(/\s/g, "")
  if (!trimmed) return null
  const cleaned = trimmed.replace(/[^\d,.-]/g, "")
  if (!cleaned || cleaned === "-" || cleaned === "," || cleaned === ".") return null

  const negative = cleaned.startsWith("-")
  const unsigned = negative ? cleaned.slice(1) : cleaned
  const lastComma = unsigned.lastIndexOf(",")
  const lastDot = unsigned.lastIndexOf(".")

  let decimalSep = ""
  if (lastComma >= 0 && lastDot >= 0) {
    decimalSep = lastComma > lastDot ? "," : "."
  } else if (lastComma >= 0) {
    const decimals = unsigned.length - lastComma - 1
    decimalSep = decimals > 0 && decimals <= 2 ? "," : ""
  } else if (lastDot >= 0) {
    const decimals = unsigned.length - lastDot - 1
    decimalSep = decimals > 0 && decimals <= 2 ? "." : ""
  }

  let normalized = unsigned
  if (decimalSep) {
    const idx = decimalSep === "," ? lastComma : lastDot
    const intPart = unsigned.slice(0, idx).replace(/[.,]/g, "")
    const fracPart = unsigned.slice(idx + 1).replace(/[^\d]/g, "")
    normalized = `${intPart || "0"}.${fracPart}`
  } else {
    normalized = unsigned.replace(/[.,]/g, "")
  }

  if (!/^\d+(\.\d+)?$/.test(normalized)) return null
  const num = Number(`${negative ? "-" : ""}${normalized}`)
  return Number.isFinite(num) ? num : null
}

function formatMoneyInput(value?: number | string | null) {
  if (value === null || value === undefined || value === "") return ""
  const num = typeof value === "number" ? value : parseMoneyInput(String(value))
  if (num === null) return String(value)
  return num.toLocaleString("nb-NO", {
    minimumFractionDigits: Number.isInteger(num) ? 0 : 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  })
}

function extractAmount(text: string) {
  const upper = text.toUpperCase()
  const patterns = [
    /(?:TOTAL|SUM|Å\s*BETALE|TIL\s*BETALING|BEL[ØO]P)\s*[:\-]?\s*(?:KR|NOK)?\s*(\d[\d .]*[,.]\d{2})/,
    /(\d[\d .]*[,.]\d{2})\s*(?:KR|NOK)/,
    /(?:KR|NOK)\s*(\d[\d .]*[,.]\d{2})/,
  ]

  for (const p of patterns) {
    const m = upper.match(p)
    if (m?.[1]) {
      const parsed = parseMoneyInput(m[1])
      if (parsed !== null) return formatMoneyInput(parsed)
    }
  }

  const all = upper.match(/\d[\d .]*[,.]\d{2}/g) ?? []
  const candidates = all
    .map((s) => parseMoneyInput(s))
    .filter((n): n is number => n !== null && Number.isFinite(n) && n > 0)
    .sort((a, b) => b - a)
  return candidates[0] ? formatMoneyInput(candidates[0]) : ""
}

function extractVendor(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  const blacklist = [
    "KVITTERING",
    "SALGSKVITTERING",
    "TOTAL",
    "SUM",
    "MVA",
    "ORG",
    "ORGNR",
    "ORG.NR",
    "ORG NR",
    "KASSA",
    "KASSE",
    "TERMINAL",
    "AUT",
    "BANKAXEPT",
    "VISA",
    "MASTERCARD",
    "KORT",
    "TIL BETALING",
    "Å BETALE",
    "DATO",
    "TID",
    "KID",
    "VIPPS",
  ]

  let best: { line: string; score: number } | null = null
  for (const line of lines.slice(0, 12)) {
    const up = line.toUpperCase()
    if (blacklist.some((b) => up.includes(b))) continue
    if (line.length < 3) continue
    if (/^\d{2}[./-]\d{2}[./-]\d{2,4}/.test(line)) continue
    if (/^\d{1,2}:\d{2}/.test(line)) continue
    if (/@/.test(line)) continue

    const letters = (line.match(/[A-Za-zÆØÅæøå]/g) ?? []).length
    const digits = (line.match(/\d/g) ?? []).length
    let score = 0
    score += letters > 0 ? 6 : 0
    score -= digits > letters ? 4 : 0
    score -= /www\.|http/i.test(line) ? 4 : 0
    score -= /(vei|veien|gata|gate|st\.|adresse|postnr|postnr\.|tlf)/i.test(line) ? 2 : 0
    score += line.length >= 4 && line.length <= 32 ? 2 : 0

    if (!best || score > best.score) best = { line, score }
  }

  if (best && best.score >= 3) return best.line
  return ""
}

function extractItem(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const blacklist = [
    "KVITTERING",
    "SALGSKVITTERING",
    "TOTAL",
    "SUM",
    "MVA",
    "ORG",
    "ORGNR",
    "KASSE",
    "KASSA",
    "BANKAXEPT",
    "VISA",
    "MASTERCARD",
    "KORT",
    "TIL BETALING",
    "Å BETALE",
    "DATO",
    "TID",
    "TERMINAL",
    "AUT",
    "KID",
    "VIPPS",
  ]
  for (const line of lines.slice(0, 20)) {
    const up = line.toUpperCase()
    if (blacklist.some((b) => up.includes(b))) continue
    if (/^\d{2}[./-]\d{2}[./-]\d{2,4}/.test(line)) continue
    if (/^\d{1,2}:\d{2}/.test(line)) continue
    if (/^\d+$/.test(line)) continue
    if (/\d[\d .]*[,.]\d{2}/.test(line)) continue
    if (/^\d+\s*x\s*\d+/i.test(line)) continue
    if (line.length < 4) continue
    return line
  }
  return ""
}

type CropRect = { x: number; y: number; w: number; h: number }

async function decodeImageToCanvas(file: File, maxSide: number) {
  const url = URL.createObjectURL(file)
  try {
    const img = new globalThis.Image()
    img.src = url
    await img.decode()

    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height))
    const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale))
    const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale))
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("canvas")
    ctx.drawImage(img, 0, 0, w, h)
    return { canvas, width: w, height: h }
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function normalizeReceiptImageFile(file: File) {
  if (!String(file.type || "").startsWith("image/")) return file
  try {
    const { canvas } = await decodeImageToCanvas(file, 2200)
    const qualities = [0.9, 0.85, 0.8, 0.75]
    for (const q of qualities) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", q)
      )
      if (!blob) continue
      if (blob.size <= 3.8 * 1024 * 1024) {
        return new File([blob], `kvittering-${Date.now()}.jpg`, { type: "image/jpeg" })
      }
    }
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.7)
    )
    if (!blob) return file
    return new File([blob], `kvittering-${Date.now()}.jpg`, { type: "image/jpeg" })
  } catch {
    return file
  }
}

function isPdfFile(file: File) {
  const t = String(file.type || "").toLowerCase()
  const n = String(file.name || "").toLowerCase()
  return t.includes("pdf") || n.endsWith(".pdf")
}

function isTextLikeFile(file: File) {
  const t = String(file.type || "").toLowerCase()
  return t.startsWith("text/") || t.includes("xml") || t.includes("json") || t.includes("csv")
}

async function ocrRawText(image: File | Blob) {
  type TesseractModule = {
    recognize: (img: File | Blob, lang: string) => Promise<{ data?: { text?: string } }>
  }
  const { recognize } = (await import("tesseract.js")) as unknown as TesseractModule
  const result = await recognize(image, "eng")
  return String(result?.data?.text ?? "")
}

type PdfTextContent = { items?: unknown[] }
type PdfViewport = { width: number; height: number }
type PdfPage = {
  getTextContent: () => Promise<PdfTextContent>
  getViewport: (opts: { scale: number }) => PdfViewport
  render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }) => { promise: Promise<unknown> }
}
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage> }
type PdfJs = { getDocument: (src: { data: ArrayBuffer; disableWorker: boolean }) => { promise: Promise<PdfDoc> } }

async function extractTextFromPdf(file: File) {
  const buf = await file.arrayBuffer()
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJs
  const pdf = await pdfjs.getDocument({ data: buf, disableWorker: true }).promise
  const maxPages = Math.min(Number(pdf?.numPages ?? 0) || 0, 2)
  const parts: string[] = []
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const items = Array.isArray(content?.items) ? content.items : []
    const line = items
      .map((it) => {
        const str = (it as { str?: unknown } | null)?.str
        return typeof str === "string" ? str : ""
      })
      .filter(Boolean)
      .join(" ")
    if (line) parts.push(line)
  }
  return parts.join("\n")
}

async function renderPdfFirstPageToJpeg(file: File) {
  const buf = await file.arrayBuffer()
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJs
  const pdf = await pdfjs.getDocument({ data: buf, disableWorker: true }).promise
  const page = await pdf.getPage(1)
  const viewport0 = page.getViewport({ scale: 1 })
  const maxSide = 1600
  const scale = Math.min(2, maxSide / Math.max(viewport0.width, viewport0.height))
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(viewport.width))
  canvas.height = Math.max(1, Math.round(viewport.height))
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  await page.render({ canvasContext: ctx, viewport }).promise
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85))
  if (!blob) return null
  return new File([blob], `bilag-${Date.now()}.jpg`, { type: "image/jpeg" })
}

async function extractRawTextFromBilagFile(file: File) {
  if (isPdfFile(file)) {
    try {
      const text = await extractTextFromPdf(file)
      if (text.trim().length >= 20) return text
    } catch {}
    try {
      const img = await renderPdfFirstPageToJpeg(file)
      if (!img) return ""
      return await ocrRawText(img)
    } catch {
      return ""
    }
  }

  if (String(file.type || "").startsWith("image/")) {
    return await ocrRawText(file)
  }

  if (isTextLikeFile(file)) {
    try {
      return await file.text()
    } catch {
      return ""
    }
  }

  return ""
}

function autoCropRectFromCanvas(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  const w = canvas.width
  const h = canvas.height
  const img = ctx.getImageData(0, 0, w, h)
  const data = img.data
  const step = w * h > 2_000_000 ? 4 : 2
  let minX = w
  let minY = h
  let maxX = 0
  let maxY = 0
  let found = false

  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4
      const a = data[i + 3]
      if (a < 10) continue
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
      if (lum > 245) continue
      found = true
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }

  if (!found) return null
  const margin = Math.round(Math.min(w, h) * 0.02)
  const x = Math.max(0, minX - margin)
  const y = Math.max(0, minY - margin)
  const ww = Math.min(w - x, maxX - minX + margin * 2)
  const hh = Math.min(h - y, maxY - minY + margin * 2)
  if (ww < w * 0.3 || hh < h * 0.3) return null
  return { x, y, w: ww, h: hh } satisfies CropRect
}

async function cropCanvasToJpegFile(canvas: HTMLCanvasElement, rect: CropRect) {
  const out = document.createElement("canvas")
  out.width = Math.max(1, Math.round(rect.w))
  out.height = Math.max(1, Math.round(rect.h))
  const ctx = out.getContext("2d")
  if (!ctx) throw new Error("canvas")
  ctx.drawImage(canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, out.width, out.height)
  const qualities = [0.9, 0.85, 0.8, 0.75, 0.7]
  for (const q of qualities) {
    const blob = await new Promise<Blob | null>((resolve) => out.toBlob((b) => resolve(b), "image/jpeg", q))
    if (!blob) continue
    if (blob.size <= 3.8 * 1024 * 1024) {
      return new File([blob], `kvittering-${Date.now()}.jpg`, { type: "image/jpeg" })
    }
  }
  const blob = await new Promise<Blob | null>((resolve) => out.toBlob((b) => resolve(b), "image/jpeg", 0.65))
  if (!blob) throw new Error("blob")
  return new File([blob], `kvittering-${Date.now()}.jpg`, { type: "image/jpeg" })
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
  const [utleggMedlemQuery, setUtleggMedlemQuery] = useState("")
  const [utleggDirty, setUtleggDirty] = useState<{ belop: boolean; motpart: boolean; vare: boolean }>({
    belop: false,
    motpart: false,
    vare: false,
  })
  const [utleggFileInputKey, setUtleggFileInputKey] = useState(0)
  const [utleggEditId, setUtleggEditId] = useState<string | null>(null)
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
  const [showLogg, setShowLogg] = useState(false)
  const [loggState, setLoggState] = useState<LoggState>({ type: "idle" })
  const [loggSavingId, setLoggSavingId] = useState<string | null>(null)

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

  const hentLogg = useCallback(async () => {
    setLoggState({ type: "loading" })
    try {
      const res = await fetch(`/api/admin/regnskap-logg?ts=${Date.now()}`, { cache: "no-store" })
      const data = (await res.json()) as { ok?: boolean; feil?: string; logg?: RegnskapLoggEntry[] }
      if (!res.ok || !data.ok) {
        setLoggState({ type: "error", message: data.feil ?? "Kunne ikke hente regnskapslogg." })
        return
      }
      setLoggState({ type: "ready", entries: data.logg ?? [] })
    } catch {
      setLoggState({ type: "error", message: "Kunne ikke hente regnskapslogg. Sjekk nett og prøv igjen." })
    }
  }, [])

  const korrigerLogg = useCallback(
    async (entry: RegnskapLoggEntry) => {
      if (minRolle !== "superadmin") return
      if (loggSavingId) return
      const next = prompt("Korreksjon/notat (kun superbruker):", entry.korreksjon_notat ?? "")
      if (next === null) return
      setLoggSavingId(entry.id)
      try {
        const res = await fetch("/api/admin/regnskap-logg", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: entry.id, notat: next.trim() || null }),
        })
        const data = (await res.json()) as { ok?: boolean; feil?: string }
        if (!res.ok || !data.ok) {
          alert(data.feil ?? "Kunne ikke oppdatere logg.")
          return
        }
        await hentLogg()
      } finally {
        setLoggSavingId(null)
      }
    },
    [hentLogg, loggSavingId, minRolle]
  )

  const slettLoggEntry = useCallback(
    async (entry: RegnskapLoggEntry) => {
      if (minRolle !== "superadmin") return
      if (loggSavingId) return
      const hvem = String(entry.actor_epost ?? "").trim()
      const hva = String(entry.action ?? "").trim()
      const tid = formatDatoTid(entry.created_at)
      const label = [hva || null, hvem || null, tid || null].filter(Boolean).join(" · ")
      const ok = confirm(`Slette denne loggposten?\n\n${label || "Loggpost"}\n\nHandlingen er uomgjørlig.`)
      if (!ok) return

      setLoggSavingId(entry.id)
      try {
        const res = await fetch("/api/admin/regnskap-logg", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: entry.id }),
        })
        const data = (await res.json()) as { ok?: boolean; feil?: string }
        if (!res.ok || !data.ok) {
          alert(data.feil ?? "Kunne ikke slette logg.")
          return
        }
        await hentLogg()
      } finally {
        setLoggSavingId(null)
      }
    },
    [hentLogg, loggSavingId, minRolle]
  )

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
    const kanEndreKonto = minRolle === "admin" || minRolle === "superadmin" || minRolle === "kasserer"
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
    const kanEndreKonto = minRolle === "admin" || minRolle === "superadmin" || minRolle === "kasserer"
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
      const bel = typeof p.belop === "number" ? p.belop : parseMoneyInput(String(p.belop ?? ""))
      if (bel === null || !Number.isFinite(bel)) continue
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
    const bel = typeof p.belop === "number" ? p.belop : parseMoneyInput(String(p.belop ?? ""))
    return bel !== null && Number.isFinite(bel) ? sum + bel : sum
  }, 0)

  const utleggMedlemmerFiltrert = utleggMedlemmer
    .filter((m) => {
      const q = utleggMedlemQuery.trim().toLowerCase()
      if (!q) return true
      const hay = [
        String(m.navn ?? ""),
        String(m.epost ?? ""),
        m.medlemsnummer == null ? "" : String(m.medlemsnummer),
      ]
        .join(" ")
        .toLowerCase()
      return hay.includes(q)
    })
    .slice(0, 200)

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
      belop: formatMoneyInput(p.belop),
      motpart: String(p.motpart ?? ""),
      vare: String(p.vare ?? ""),
      notat: String(p.notat ?? ""),
      bilag: null,
      bilagPreviewUrl: null,
      bilagTekst: null,
    })
  }

  function isUtleggPost(p: RegnskapPost) {
    return Boolean(
      String(p.utlegg_medlem_id ?? "").trim() ||
        String(p.utlegg_status ?? "").trim() ||
        String(p.utlegg_medlem_navn ?? "").trim() ||
        String(p.utlegg_medlem_epost ?? "").trim()
    )
  }

  async function apneUtleggRedigering(p: RegnskapPost) {
    if (minRolle !== "superadmin") return
    await hentUtleggMedlemmer()
    const datoSource = String(p.dato ?? p.created_at ?? todayIso())
    const dato = datoSource.includes("T") ? datoSource.slice(0, 10) : datoSource
    setShowUtlegg(true)
    setUtleggTab("ny")
    setUtleggEditId(p.id)
    setUtleggDirty({ belop: false, motpart: false, vare: false })
    setUtleggMedlemQuery(String(p.utlegg_medlem_navn ?? p.utlegg_medlem_epost ?? ""))
    setUtleggForm((prev) => {
      if (prev.bilagPreviewUrl) URL.revokeObjectURL(prev.bilagPreviewUrl)
      return {
        medlemId: String(p.utlegg_medlem_id ?? ""),
        dato: dato || todayIso(),
        belop: formatMoneyInput(p.belop),
        motpart: String(p.motpart ?? ""),
        vare: String(p.vare ?? ""),
        notat: String(p.notat ?? ""),
        bilag: null,
        bilagPreviewUrl: null,
        bilagTekst: null,
      }
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
    if (!file) {
      setForm((prev) => {
        if (prev.bilagPreviewUrl) URL.revokeObjectURL(prev.bilagPreviewUrl)
        return {
          ...prev,
          bilag: null,
          bilagPreviewUrl: null,
          bilagTekst: null,
        }
      })
      return null
    }

    if (String(file.type || "").startsWith("video/")) {
      alert("Velg et bilag (ikke video).")
      return null
    }

    if (!String(file.type || "").startsWith("image/")) {
      setForm((prev) => {
        if (prev.bilagPreviewUrl) URL.revokeObjectURL(prev.bilagPreviewUrl)
        return {
          ...prev,
          bilag: file,
          bilagPreviewUrl: URL.createObjectURL(file),
          bilagTekst: null,
        }
      })
      return file
    }

    const normalized = await normalizeReceiptImageFile(file)
    try {
      const { canvas } = await decodeImageToCanvas(normalized, 2200)
      const autoRect = autoCropRectFromCanvas(canvas)
      const cropped = autoRect ? await cropCanvasToJpegFile(canvas, autoRect) : normalized
      setForm((prev) => {
        if (prev.bilagPreviewUrl) URL.revokeObjectURL(prev.bilagPreviewUrl)
        return {
          ...prev,
          bilag: cropped,
          bilagPreviewUrl: URL.createObjectURL(cropped),
          bilagTekst: null,
        }
      })
      return cropped
    } catch {
      setForm((prev) => {
        if (prev.bilagPreviewUrl) URL.revokeObjectURL(prev.bilagPreviewUrl)
        return {
          ...prev,
          bilag: normalized,
          bilagPreviewUrl: URL.createObjectURL(normalized),
          bilagTekst: null,
        }
      })
      return normalized
    }
  }

  async function analyserBilagFile(file: File) {
    setOcrLoading(true)
    try {
      const rawText = await extractRawTextFromBilagFile(file)
      const normalized = normalizeOcrText(rawText)
      const belop = extractAmount(rawText)
      const motpart = extractVendor(rawText)
      const vare = extractItem(rawText)

      setForm((prev) => ({ ...prev, bilagTekst: normalized || null }))
      const forslag = [
        belop ? `Belop: ${belop}` : null,
        motpart ? `Butikk/firma: ${motpart}` : null,
        vare ? `Vare/tjeneste: ${vare}` : null,
      ].filter(Boolean)
      if (!forslag.length) {
        alert("Fant ingen sikre forslag i bilaget.")
        return
      }
      const ok = window.confirm(
        `Fant disse forslagene:\n\n${forslag.join("\n")}\n\nVil du fylle dem inn i feltene?`
      )
      if (!ok) return
      setForm((prev) => ({
        ...prev,
        belop: belop || prev.belop,
        motpart: motpart || prev.motpart,
        vare: vare || prev.vare,
      }))
    } finally {
      setOcrLoading(false)
    }
  }

  async function analyserBilag() {
    if (!form.bilag) return
    await analyserBilagFile(form.bilag)
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

  function resetUtleggState() {
    setUtleggMedlemQuery("")
    setUtleggTab("ny")
    setUtleggEditId(null)
    setUtleggDirty({ belop: false, motpart: false, vare: false })
    setUtleggFileInputKey((k) => k + 1)
    setUtleggForm((prev) => {
      if (prev.bilagPreviewUrl) URL.revokeObjectURL(prev.bilagPreviewUrl)
      return {
        medlemId: "",
        dato: todayIso(),
        belop: "",
        motpart: "",
        vare: "",
        notat: "",
        bilag: null,
        bilagPreviewUrl: null,
        bilagTekst: null,
      }
    })
  }

  function lukkUtleggModal() {
    resetUtleggState()
    setShowUtlegg(false)
  }

  async function velgUtleggBilag(file: File | null) {
    if (!file) {
      setUtleggDirty({ belop: false, motpart: false, vare: false })
      setUtleggFileInputKey((k) => k + 1)
      setUtleggForm((prev) => {
        if (prev.bilagPreviewUrl) URL.revokeObjectURL(prev.bilagPreviewUrl)
        return {
          ...prev,
          belop: "",
          motpart: "",
          vare: "",
          bilag: null,
          bilagPreviewUrl: null,
          bilagTekst: null,
        }
      })
      return
    }

    if (String(file.type || "").startsWith("video/")) {
      alert("Velg et bilde av kvitteringen (ikke video).")
      return
    }

    setUtleggDirty({ belop: false, motpart: false, vare: false })

    if (!String(file.type || "").startsWith("image/")) {
      setUtleggForm((prev) => {
        if (prev.bilagPreviewUrl) URL.revokeObjectURL(prev.bilagPreviewUrl)
        return {
          ...prev,
          belop: "",
          motpart: "",
          vare: "",
          bilag: file,
          bilagPreviewUrl: URL.createObjectURL(file),
          bilagTekst: null,
        }
      })
      return
    }

    const normalized = await normalizeReceiptImageFile(file)
    try {
      const { canvas } = await decodeImageToCanvas(normalized, 2200)
      const autoRect = autoCropRectFromCanvas(canvas)
      const cropped = autoRect ? await cropCanvasToJpegFile(canvas, autoRect) : normalized

      setUtleggForm((prev) => {
        if (prev.bilagPreviewUrl) URL.revokeObjectURL(prev.bilagPreviewUrl)
        return {
          ...prev,
          belop: "",
          motpart: "",
          vare: "",
          bilag: cropped,
          bilagPreviewUrl: URL.createObjectURL(cropped),
          bilagTekst: null,
        }
      })

    } catch {
      setUtleggForm((prev) => {
        if (prev.bilagPreviewUrl) URL.revokeObjectURL(prev.bilagPreviewUrl)
        return {
          ...prev,
          belop: "",
          motpart: "",
          vare: "",
          bilag: normalized,
          bilagPreviewUrl: URL.createObjectURL(normalized),
          bilagTekst: null,
        }
      })
    }
  }

  async function analyserUtleggFile(
    file: File,
    dirty: { belop: boolean; motpart: boolean; vare: boolean }
  ) {
    setUtleggOcrLoading(true)
    try {
      const rawText = await extractRawTextFromBilagFile(file)
      const normalized = normalizeOcrText(rawText)
      const belop = extractAmount(rawText)
      const motpart = extractVendor(rawText)
      const vare = extractItem(rawText)

      setUtleggForm((prev) => ({ ...prev, bilagTekst: normalized || null }))
      const forslag = [
        belop && !dirty.belop ? `Belop: ${belop}` : null,
        motpart && !dirty.motpart ? `Butikk/firma: ${motpart}` : null,
        vare && !dirty.vare ? `Vare/tjeneste: ${vare}` : null,
      ].filter(Boolean)
      if (!forslag.length) {
        alert("Fant ingen sikre forslag i bilaget.")
        return
      }
      const ok = window.confirm(
        `Fant disse forslagene:\n\n${forslag.join("\n")}\n\nVil du fylle dem inn i feltene?`
      )
      if (!ok) return
      setUtleggForm((prev) => ({
        ...prev,
        belop: !dirty.belop && belop ? belop : prev.belop,
        motpart: !dirty.motpart && motpart ? motpart : prev.motpart,
        vare: !dirty.vare && vare ? vare : prev.vare,
      }))
    } finally {
      setUtleggOcrLoading(false)
    }
  }

  async function analyserUtleggBilag() {
    if (!utleggForm.bilag) return
    await analyserUtleggFile(utleggForm.bilag, utleggDirty)
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

    const belopTall = parseMoneyInput(utleggForm.belop)
    if (belopTall === null) {
      alert("Skriv inn et gyldig beløp.")
      return
    }
    if (utleggForm.bilag && utleggForm.bilag.size > MAX_BILAG_BYTES) {
      alert("Bilag er for stort. Maks 20 MB.")
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
      if (utleggEditId) fd.set("id", utleggEditId)

      const res = await fetch("/api/regnskap", { method: utleggEditId ? "PATCH" : "POST", body: fd })
      const data = (await res.json()) as { ok?: boolean; feil?: string }
      if (!res.ok || !data.ok) {
        alert(data.feil ?? `Kunne ikke lagre utlegg. (HTTP ${res.status})`)
        return
      }

      setUtleggDirty({ belop: false, motpart: false, vare: false })
      setUtleggEditId(null)
      setUtleggFileInputKey((k) => k + 1)
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
    const belopTall = parseMoneyInput(form.belop)
    if (belopTall === null) {
      alert("Skriv inn et gyldig beløp.")
      return
    }
    if (form.bilag && form.bilag.size > MAX_BILAG_BYTES) {
      alert("Bilag er for stort. Maks 20 MB.")
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
              resetUtleggState()
              setShowUtlegg(true)
              setUtleggTab("ny")
              void hentUtleggMedlemmer()
            }}
          >
            Utlegg
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setShowLogg(true)
              void hentLogg()
            }}
          >
            Logg
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
              disabled={
                (minRolle !== "admin" && minRolle !== "superadmin" && minRolle !== "kasserer") ||
                savingInnstillinger
              }
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
                <Label>Bilag (fil)</Label>
                <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
                  <Input
                    type="file"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null
                      void (async () => {
                        await velgBilag(f)
                      })()
                    }}
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
                {form.bilagPreviewUrl && form.bilag ? (
                  <div className="overflow-hidden rounded-xl border bg-muted/30">
                    {String(form.bilag.type || "").startsWith("image/") ? (
                      <Image
                        src={form.bilagPreviewUrl}
                        alt="Forhåndsvisning av bilag"
                        className="h-auto w-full"
                        width={1200}
                        height={800}
                        unoptimized
                      />
                    ) : (
                      <div className="p-4 text-sm">
                        <a
                          href={form.bilagPreviewUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium underline underline-offset-4"
                        >
                          Åpne bilag
                        </a>
                        <div className="mt-2 text-xs text-muted-foreground">
                          {form.bilag.name || "Bilag"}
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
                {form.bilagTekst ? (
                  <div className="rounded-xl border bg-muted/30 p-3 text-sm text-muted-foreground">
                    Forslag er lest fra bilaget, men fylles bare inn etter bekreftelse.
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
                      {!isUtleggPost(p) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => apneRedigering(p)}
                        >
                          Åpne/rediger
                        </Button>
                      ) : minRolle === "superadmin" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void apneUtleggRedigering(p)}
                        >
                          Åpne/rediger utlegg
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Kun superbruker</span>
                      )}
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
          className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4"
          onClick={() => lukkUtleggModal()}
        >
          <div
            className="mx-auto my-4 w-full max-w-4xl max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border bg-card p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">{utleggEditId ? "Rediger utlegg" : "Utlegg"}</div>
                <div className="text-sm text-muted-foreground">
                  Knytt en utgift til et medlem, og hold oversikt over det som er skyldig.
                </div>
              </div>
              <Button variant="outline" onClick={() => lukkUtleggModal()}>
                Lukk
              </Button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                variant={utleggTab === "ny" ? "default" : "outline"}
                onClick={() => {
                  resetUtleggState()
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
                    <Input
                      value={utleggMedlemQuery}
                      onChange={(e) => setUtleggMedlemQuery(e.target.value)}
                      placeholder="Søk (navn, e-post, medlemsnr.)"
                      className="h-10"
                    />
                    <select
                      value={utleggForm.medlemId}
                      onChange={(e) => setUtleggForm((p) => ({ ...p, medlemId: e.target.value }))}
                      className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                    >
                      <option value="">Velg medlem…</option>
                      {utleggMedlemmerFiltrert.map((m) => (
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
                      onChange={(e) => {
                        setUtleggDirty((d) => ({ ...d, belop: true }))
                        setUtleggForm((p) => ({ ...p, belop: e.target.value }))
                      }}
                      placeholder="0,00"
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Butikk / firma</Label>
                    <Input
                      value={utleggForm.motpart}
                      onChange={(e) => {
                        setUtleggDirty((d) => ({ ...d, motpart: true }))
                        setUtleggForm((p) => ({ ...p, motpart: e.target.value }))
                      }}
                      placeholder="F.eks. Biltema, Coop, Posten"
                      className="h-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Vare / tjeneste</Label>
                  <Input
                    value={utleggForm.vare}
                    onChange={(e) => {
                      setUtleggDirty((d) => ({ ...d, vare: true }))
                      setUtleggForm((p) => ({ ...p, vare: e.target.value }))
                    }}
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
                  <Label>Kvittering (fil)</Label>
                  <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-start">
                    <Input
                      key={utleggFileInputKey}
                      type="file"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null
                        void (async () => {
                          await velgUtleggBilag(f)
                        })()
                      }}
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
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!utleggForm.bilag || utleggSaving}
                      onClick={() => void velgUtleggBilag(null)}
                    >
                      Bytt bilde
                    </Button>
                  </div>
                  {utleggForm.bilagPreviewUrl && utleggForm.bilag ? (
                    <div className="mt-3 overflow-hidden rounded-xl border bg-background">
                      {String(utleggForm.bilag.type || "").startsWith("image/") ? (
                        <Image
                          src={utleggForm.bilagPreviewUrl}
                          alt="Forhåndsvisning av kvittering"
                          width={1200}
                          height={1200}
                          className="h-auto w-full"
                          unoptimized
                        />
                      ) : (
                        <div className="p-4 text-sm">
                          <a
                            href={utleggForm.bilagPreviewUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium underline underline-offset-4"
                          >
                            Åpne bilag
                          </a>
                          <div className="mt-2 text-xs text-muted-foreground">
                            {utleggForm.bilag.name || "Bilag"}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}
                  {utleggForm.bilagTekst ? (
                    <div className="rounded-xl border bg-muted/30 p-3 text-sm text-muted-foreground">
                      Forslag er lest fra bilaget, men fylles bare inn etter bekreftelse.
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="outline" onClick={() => lukkUtleggModal()} disabled={utleggSaving}>
                    Avbryt
                  </Button>
                  <Button onClick={() => void lagreUtlegg()} disabled={utleggSaving}>
                    {utleggSaving ? "Lagrer…" : utleggEditId ? "Oppdater utlegg" : "Lagre utlegg"}
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
                              {minRolle === "superadmin" ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="mr-2"
                                  disabled={utleggSaving}
                                  onClick={() => void apneUtleggRedigering(p)}
                                >
                                  Åpne/rediger
                                </Button>
                              ) : null}
                              <Button
                                size="sm"
                                className="bg-emerald-600 text-white hover:bg-emerald-600/90"
                                disabled={utleggSaving}
                                onClick={() => void markerUtleggUtbetalt(p, true)}
                              >
                                Marker utbetalt
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

      {showLogg ? (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4"
          onClick={() => setShowLogg(false)}
        >
          <div
            className="mx-auto my-4 w-full max-w-5xl max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border bg-card p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">Regnskapslogg</div>
                <div className="text-sm text-muted-foreground">
                  Hvem gjorde hva, og når.
                </div>
              </div>
              <Button variant="outline" onClick={() => setShowLogg(false)}>
                Lukk
              </Button>
            </div>

            {loggState.type === "loading" ? (
              <div className="mt-4 rounded-xl border bg-background p-4 text-sm text-muted-foreground">
                Laster logg…
              </div>
            ) : null}

            {loggState.type === "error" ? (
              <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive whitespace-pre-wrap">
                {loggState.message}
              </div>
            ) : null}

            {loggState.type === "ready" ? (
              loggState.entries.length ? (
                <div className="mt-4 overflow-hidden rounded-xl border bg-background">
                  <div className="overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-muted/30 text-left text-muted-foreground">
                        <tr>
                          <th className="whitespace-nowrap px-4 py-3 font-medium">Tid</th>
                          <th className="whitespace-nowrap px-4 py-3 font-medium">Hvem</th>
                          <th className="whitespace-nowrap px-4 py-3 font-medium">Handling</th>
                          <th className="px-4 py-3 font-medium">Detalj</th>
                          <th className="whitespace-nowrap px-4 py-3 font-medium">Korreksjon</th>
                          <th className="whitespace-nowrap px-4 py-3 font-medium text-right"> </th>
                        </tr>
                      </thead>
                      <tbody>
                        {loggState.entries.map((l) => {
                          const base = (l.after ?? l.before) as Record<string, unknown> | null
                          const actionLabel =
                            l.action === "poster:create"
                              ? "Ny post"
                              : l.action === "poster:update"
                                ? "Oppdatert post"
                                : l.action === "poster:delete"
                                  ? "Slettet post"
                                  : l.action === "innstillinger:update"
                                    ? "Innstillinger"
                                    : String(l.action ?? "—")

                          let detalj = "—"
                          if (l.entity_type === "regnskap_poster" && base) {
                            const belop = base.belop as number | string | undefined
                            const motpart = String(base.motpart ?? "").trim()
                            const vare = String(base.vare ?? "").trim()
                            const type = String(base.type ?? "").trim()
                            detalj = [
                              type || null,
                              belop != null && String(belop).trim() ? formatBelop(belop) : null,
                              vare || null,
                              motpart || null,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "—"
                          } else if (l.entity_type === "regnskap_innstillinger" && base) {
                            const kontonummer = String(base.kontonummer ?? "").trim()
                            const saldo = base.saldo as number | string | null | undefined
                            detalj = [
                              kontonummer ? `Konto: ${kontonummer}` : null,
                              saldo != null && String(saldo).trim() ? `Saldo: ${String(saldo)}` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "—"
                          }

                          const korr = String(l.korreksjon_notat ?? "").trim()
                          const korrInfo =
                            korr && (l.korreksjon_av_epost || l.korreksjon_at)
                              ? `${korr}${l.korreksjon_av_epost ? ` · ${l.korreksjon_av_epost}` : ""}${l.korreksjon_at ? ` · ${formatDatoTid(l.korreksjon_at)}` : ""}`
                              : korr || "—"

                          return (
                            <tr key={l.id} className="border-b">
                              <td className="whitespace-nowrap px-4 py-3">
                                {formatDatoTid(l.created_at) || "—"}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3">
                                {String(l.actor_epost ?? "").trim() || "—"}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3">{actionLabel}</td>
                              <td className="px-4 py-3">{detalj}</td>
                              <td className="px-4 py-3">{korrInfo}</td>
                              <td className="whitespace-nowrap px-4 py-3 text-right">
                                {minRolle === "superadmin" ? (
                                  <div className="flex justify-end gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={loggSavingId === l.id}
                                      onClick={() => void korrigerLogg(l)}
                                    >
                                      Korriger
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      disabled={loggSavingId === l.id}
                                      onClick={() => void slettLoggEntry(l)}
                                    >
                                      Slett
                                    </Button>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-xl border bg-background p-4 text-sm text-muted-foreground">
                  Ingen loggposter ennå.
                </div>
              )
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
