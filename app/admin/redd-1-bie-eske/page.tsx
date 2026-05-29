"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Boks = {
  box_code: string
  internal_id?: string | null
  place_type?: string | null
  place_name?: string | null
  capacity?: number | null
  active?: boolean | null
  installed_at?: string | null
  installed_status?: string | null
}

type Hendelse = {
  id: string
  created_at?: string | null
  box_code?: string | null
  kind?: string | null
  status?: string | null
  glasses_left?: number | null
  place_type?: string | null
  place_name?: string | null
  filled_now?: boolean | null
  filled_added?: number | null
  lat?: number | null
  lng?: number | null
  image1_path?: string | null
  image2_path?: string | null
  image3_path?: string | null
  actor_epost?: string | null
}

type ApiState =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "ready"; role: string; boxes: Boks[]; recent: Hendelse[]; needsFill: Array<{ box_code: string; latest: Hendelse }>; totals: { totalBoxes: number; activeBoxes: number; needsFill: number } }
  | { type: "error"; message: string }

type Mode = "home" | "runde" | "utsetting"

const placeTypes = [
  "Bakeri",
  "Blomsterbutikk",
  "Kafé",
  "Kiosk",
  "Frisør",
  "Restaurant",
  "Gårdsbutikk",
  "Butikk",
  "Annet",
] as const

const rundeStatuses = [
  "Full",
  "Halvfull",
  "Nesten tom",
  "Tom",
  "Må fylles",
  "QR fungerer ikke",
  "Skadet",
] as const

const utsettingStatuses = ["Full og klar", "Mangler varer", "QR mangler", "Midlertidig plassering"] as const

function formatWhen(iso?: string | null) {
  const s = String(iso ?? "").trim()
  if (!s) return ""
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString("no-NO", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
}

function clampInt(v: number, min: number, max: number) {
  if (!Number.isFinite(v)) return min
  return Math.min(max, Math.max(min, Math.trunc(v)))
}

function splitSchemaMessage(message: string) {
  const parts = String(message ?? "").split("\n\n")
  if (parts.length < 2) return { intro: String(message ?? ""), sql: "" }
  return { intro: parts[0], sql: parts.slice(1).join("\n\n") }
}

export default function Redd1BieEskeAdminPage() {
  const router = useRouter()
  const [api, setApi] = useState<ApiState>({ type: "idle" })
  const [mode, setMode] = useState<Mode>("home")
  const [busy, setBusy] = useState(false)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [copiedSql, setCopiedSql] = useState(false)

  const [boxCode, setBoxCode] = useState("")
  const [internalId, setInternalId] = useState("")
  const [status, setStatus] = useState("")
  const [glassesLeft, setGlassesLeft] = useState(7)
  const [placeType, setPlaceType] = useState<(typeof placeTypes)[number] | "">("")
  const [placeName, setPlaceName] = useState("")
  const [comment, setComment] = useState("")
  const [filledNow, setFilledNow] = useState(false)
  const [filledAdded, setFilledAdded] = useState(0)
  const [capacity, setCapacity] = useState(15)
  const [images, setImages] = useState<File[]>([])
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null)
  const [gpsStatus, setGpsStatus] = useState<"idle" | "loading" | "ok" | "fail">("idle")
  const [mapOpen, setMapOpen] = useState(false)
  const [placeQuery, setPlaceQuery] = useState("")
  const [placeResults, setPlaceResults] = useState<Array<{ name: string; lat: number; lng: number }>>([])
  const [placeBusy, setPlaceBusy] = useState(false)
  const [placeError, setPlaceError] = useState<string | null>(null)
  const [manualLat, setManualLat] = useState("")
  const [manualLng, setManualLng] = useState("")

  const codeRef = useRef<HTMLInputElement | null>(null)

  const resetForm = useCallback(() => {
    setBoxCode("")
    setInternalId("")
    setStatus("")
    setGlassesLeft(7)
    setPlaceType("")
    setPlaceName("")
    setComment("")
    setFilledNow(false)
    setFilledAdded(0)
    setCapacity(15)
    setImages([])
    setGps(null)
    setGpsStatus("idle")
    setMapOpen(false)
    setPlaceQuery("")
    setPlaceResults([])
    setPlaceError(null)
    setManualLat("")
    setManualLng("")
  }, [])

  const fetchOverview = useCallback(async () => {
    setApi({ type: "loading" })
    try {
      const res = await fetch("/api/admin/bie-eske", { cache: "no-store" })
      const json = (await res.json()) as { ok?: boolean; feil?: string } & Record<string, unknown>
      if (!res.ok || !json.ok) {
        setApi({ type: "error", message: String(json.feil ?? "Kunne ikke hente oversikt.") })
        return
      }
      setApi({
        type: "ready",
        role: String(json.role ?? ""),
        boxes: (json.boxes as Boks[]) ?? [],
        recent: (json.recent as Hendelse[]) ?? [],
        needsFill: (json.needsFill as Array<{ box_code: string; latest: Hendelse }>) ?? [],
        totals: (json.totals as { totalBoxes: number; activeBoxes: number; needsFill: number }) ?? { totalBoxes: 0, activeBoxes: 0, needsFill: 0 },
      })
    } catch {
      setApi({ type: "error", message: "Kunne ikke hente oversikt." })
    }
  }, [])

  useEffect(() => {
    setTimeout(() => {
      fetchOverview()
    }, 0)
  }, [fetchOverview])

  const requestGps = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setGpsStatus("fail")
      return
    }
    setGpsStatus("loading")
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setGps(next)
        setManualLat(String(next.lat))
        setManualLng(String(next.lng))
        setGpsStatus("ok")
      },
      () => {
        setGps(null)
        setManualLat("")
        setManualLng("")
        setGpsStatus("fail")
      },
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 60_000 }
    )
  }, [])

  useEffect(() => {
    if (mode === "runde" || mode === "utsetting") {
      setTimeout(() => {
        requestGps()
      }, 0)
      setTimeout(() => codeRef.current?.focus(), 0)
    }
  }, [mode, requestGps])

  const handleStartRunde = useCallback(
    (prefill?: { boxCode?: string }) => {
      resetForm()
      setMode("runde")
      setStatus("")
      setPlaceType("")
      setGlassesLeft(7)
      if (prefill?.boxCode) setBoxCode(prefill.boxCode)
    },
    [resetForm]
  )

  const handleStartUtsetting = useCallback(() => {
    resetForm()
    setMode("utsetting")
    setStatus("Full og klar")
    setPlaceType("")
    setCapacity(15)
    setGlassesLeft(15)
  }, [resetForm])

  const title = mode === "runde" ? "➕ Registrer ny runde" : mode === "utsetting" ? "➕ Sett ut ny bie-eske" : "🐝 Redd 1 Bie-Eske"

  const statusOptions = useMemo(() => (mode === "utsetting" ? utsettingStatuses : rundeStatuses), [mode])

  const previewUrls = useMemo(() => {
    const urls = images.map((f) => URL.createObjectURL(f))
    return urls
  }, [images])

  useEffect(() => {
    return () => {
      for (const url of previewUrls) URL.revokeObjectURL(url)
    }
  }, [previewUrls])

  const onPickImages = useCallback((files: FileList | null) => {
    if (!files) return
    const arr = Array.from(files).filter((f) => f.size > 0).slice(0, 3)
    setImages(arr)
  }, [])

  const onSearchPlace = useCallback(async () => {
    const q = placeQuery.trim()
    if (q.length < 3) {
      setPlaceError("Skriv minst 3 tegn.")
      setPlaceResults([])
      return
    }
    setPlaceBusy(true)
    setPlaceError(null)
    try {
      const res = await fetch(`/api/admin/bie-eske?action=searchPlace&q=${encodeURIComponent(q)}`, {
        cache: "no-store",
      })
      const json = (await res.json()) as { ok?: boolean; feil?: string; results?: Array<{ name: string; lat: number; lng: number }> }
      if (!res.ok || !json.ok) {
        setPlaceBusy(false)
        setPlaceResults([])
        setPlaceError(String(json.feil ?? "Kunne ikke søke i kart."))
        return
      }
      setPlaceBusy(false)
      setPlaceResults(Array.isArray(json.results) ? json.results : [])
    } catch {
      setPlaceBusy(false)
      setPlaceResults([])
      setPlaceError("Kunne ikke søke i kart.")
    }
  }, [placeQuery])

  const applyManualCoords = useCallback((nextLat: string, nextLng: string) => {
    const lat = Number(nextLat.replace(",", "."))
    const lng = Number(nextLng.replace(",", "."))
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return
    const next = { lat, lng }
    setGps(next)
    setGpsStatus("ok")
  }, [])

  const onSave = useCallback(async () => {
    if (busy) return
    if (!boxCode.trim()) {
      setOkMsg("Mangler boksnummer.")
      return
    }
    if (!status.trim()) {
      setOkMsg("Velg status.")
      return
    }
    if (!placeType) {
      setOkMsg("Velg type sted.")
      return
    }

    setBusy(true)
    setOkMsg(null)
    try {
      const fd = new FormData()
      fd.set("kind", mode === "utsetting" ? "utsetting" : "runde")
      fd.set("boxCode", boxCode.trim())
      if (internalId.trim()) fd.set("internalId", internalId.trim())
      fd.set("status", status.trim())
      fd.set("placeType", placeType)
      if (placeName.trim()) fd.set("placeName", placeName.trim())
      if (comment.trim()) fd.set("comment", comment.trim())
      fd.set("glassesLeft", String(clampInt(glassesLeft, 0, clampInt(capacity, 1, 50))))
      fd.set("capacity", String(clampInt(capacity, 1, 50)))
      fd.set("filledNow", filledNow ? "true" : "false")
      if (filledNow) fd.set("filledAdded", String(clampInt(filledAdded, 0, 200)))
      if (gps) {
        fd.set("lat", String(gps.lat))
        fd.set("lng", String(gps.lng))
      }
      for (const f of images) fd.append("images", f)

      const res = await fetch("/api/admin/bie-eske", { method: "POST", body: fd })
      const json = (await res.json()) as { ok?: boolean; feil?: string }
      if (!res.ok || !json.ok) {
        setOkMsg(String(json.feil ?? "Kunne ikke lagre."))
        setBusy(false)
        return
      }

      setBusy(false)
      setOkMsg(null)
      setMode("home")
      setTimeout(() => setOkMsg(null), 0)
      setOkMsg("✅ Lagret.")
      await fetchOverview()
      setTimeout(() => setOkMsg(null), 1600)
      resetForm()
    } catch {
      setBusy(false)
      setOkMsg("Kunne ikke lagre.")
    }
  }, [boxCode, busy, capacity, comment, fetchOverview, filledAdded, filledNow, glassesLeft, gps, images, internalId, mode, placeName, placeType, resetForm, status])

  return (
    <div className="min-h-[calc(100vh-64px)] bg-slate-950 text-slate-50">
      <div className="mx-auto w-full max-w-2xl px-4 py-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">{title}</div>
            <div className="mt-1 text-xs text-slate-300">
              Rask registrering ute i felt · én-hånds · MVP
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              className="h-10 rounded-full bg-white/10 text-white hover:bg-white/15"
              onClick={() => router.push("/admin")}
            >
              Til admin
            </Button>
          </div>
        </div>

        {okMsg ? (
          <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-50">
            {okMsg}
          </div>
        ) : null}

        {api.type === "error" ? (
          <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {(() => {
              const { intro, sql } = splitSchemaMessage(api.message)
              const showCopy = Boolean(sql.trim())
              return (
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm font-semibold">{intro}</div>
                    {showCopy ? (
                      <button
                        type="button"
                        className="shrink-0 rounded-full border border-rose-200/20 bg-white/10 px-3 py-1 text-xs text-rose-50 hover:bg-white/15"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(sql.trim())
                            setCopiedSql(true)
                            setTimeout(() => setCopiedSql(false), 1200)
                          } catch {
                            setCopiedSql(false)
                          }
                        }}
                      >
                        {copiedSql ? "Kopiert" : "Kopier SQL"}
                      </button>
                    ) : null}
                  </div>
                  {showCopy ? (
                    <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-white/10 bg-black/20 p-3 text-xs text-rose-50/90">
                      {sql.trim()}
                    </pre>
                  ) : (
                    <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-rose-50/90">
                      {api.message}
                    </pre>
                  )}
                </div>
              )
            })()}
          </div>
        ) : null}

        {mode === "home" ? (
          <div className="mt-6 space-y-4">
            {api.type === "ready" ? (
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                  <div className="text-[11px] text-slate-300">Totalt</div>
                  <div className="mt-1 text-xl font-semibold">{api.totals.totalBoxes}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                  <div className="text-[11px] text-slate-300">Aktive</div>
                  <div className="mt-1 text-xl font-semibold">{api.totals.activeBoxes}</div>
                </div>
                <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-3 py-3">
                  <div className="text-[11px] text-amber-100/80">Må fylles</div>
                  <div className="mt-1 text-xl font-semibold text-amber-50">{api.totals.needsFill}</div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-slate-200">
                {api.type === "loading" ? "Laster…" : "Klar."}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => handleStartRunde()}
                className="flex w-full items-center justify-between rounded-3xl border border-amber-300/40 bg-gradient-to-b from-amber-200/15 to-amber-200/5 px-5 py-5 text-left"
              >
                <div>
                  <div className="text-base font-semibold">➕ Registrer ny runde</div>
                  <div className="mt-1 text-xs text-amber-100/80">Status · glass · bilde · GPS</div>
                </div>
                <div className="text-xl text-amber-100">🐝</div>
              </button>
              <button
                type="button"
                onClick={handleStartUtsetting}
                className="flex w-full items-center justify-between rounded-3xl border border-white/10 bg-white/5 px-5 py-5 text-left hover:bg-white/10"
              >
                <div>
                  <div className="text-base font-semibold">➕ Sett ut ny bie-eske</div>
                  <div className="mt-1 text-xs text-slate-300">Dokumentasjon ved utsetting</div>
                </div>
                <div className="text-xl text-slate-200">🤝</div>
              </button>
            </div>

            {api.type === "ready" && api.needsFill.length ? (
              <div className="rounded-3xl border border-amber-400/30 bg-amber-400/10 p-4">
                <div className="text-sm font-semibold text-amber-50">Må fylles</div>
                <div className="mt-3 grid grid-cols-1 gap-2">
                  {api.needsFill.slice(0, 8).map((x) => (
                    <button
                      key={x.box_code}
                      type="button"
                      onClick={() => handleStartRunde({ boxCode: x.box_code })}
                      className="flex items-center justify-between rounded-2xl border border-amber-200/20 bg-black/10 px-4 py-3 text-left hover:bg-black/20"
                    >
                      <div>
                        <div className="text-sm font-semibold">{x.box_code}</div>
                        <div className="mt-0.5 text-xs text-amber-100/80">
                          {String(x.latest?.place_name ?? x.latest?.place_type ?? "").trim() || "Ukjent sted"}
                        </div>
                      </div>
                      <div className="text-xs text-amber-100/70">{formatWhen(x.latest?.created_at)}</div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {api.type === "ready" && api.recent.length ? (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold">Sist registrert</div>
                <div className="mt-3 grid grid-cols-1 gap-2">
                  {api.recent.slice(0, 10).map((e) => (
                    <div key={e.id} className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold">{String(e.box_code ?? "")}</div>
                        <div className="text-xs text-slate-300">{formatWhen(e.created_at)}</div>
                      </div>
                      <div className="mt-1 text-xs text-slate-300">
                        {String(e.kind ?? "").toLowerCase() === "utsetting" ? "🤝 Utsetting" : "🐝 Runde"} ·{" "}
                        {String(e.status ?? "").trim() || "Ukjent"} ·{" "}
                        {typeof e.glasses_left === "number" ? `${e.glasses_left} igjen` : "ukjent antall"}
                      </div>
                      {e.place_name ? (
                        <div className="mt-1 text-xs text-slate-400">{e.place_name}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold">{mode === "utsetting" ? "🤝 Utsetting" : "🐝 Runde"}</div>
              <Button
                variant="secondary"
                className="h-10 rounded-full bg-white/10 text-white hover:bg-white/15"
                onClick={() => {
                  setMode("home")
                  resetForm()
                }}
                disabled={busy}
              >
                Tilbake
              </Button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-slate-200">Boksnummer / navn</Label>
                  <Input
                    ref={(el) => {
                      codeRef.current = el
                    }}
                    value={boxCode}
                    onChange={(e) => setBoxCode(e.target.value)}
                    placeholder="F.eks. 12 / Tistasenteret"
                    className="mt-2 h-12 rounded-2xl border-white/10 bg-black/20 text-white placeholder:text-slate-500"
                    inputMode="text"
                  />
                </div>
                <div>
                  <Label className="text-slate-200">Intern-ID (valgfri)</Label>
                  <Input
                    value={internalId}
                    onChange={(e) => setInternalId(e.target.value)}
                    placeholder="Valgfritt"
                    className="mt-2 h-12 rounded-2xl border-white/10 bg-black/20 text-white placeholder:text-slate-500"
                    inputMode="text"
                  />
                </div>
              </div>

              <div>
                <Label className="text-slate-200">Status</Label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {statusOptions.map((s) => {
                    const active = status === s
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setStatus(s)}
                        className={
                          "h-12 rounded-2xl border px-4 text-left text-sm font-semibold transition " +
                          (active
                            ? "border-amber-300/50 bg-amber-200/15 text-amber-50"
                            : "border-white/10 bg-black/10 text-slate-100 hover:bg-black/20")
                        }
                      >
                        {s}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-slate-200">Antall glass igjen</Label>
                  <div className="mt-2 rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
                    <div className="text-sm font-semibold">
                      {clampInt(glassesLeft, 0, clampInt(capacity, 1, 50))} av {clampInt(capacity, 1, 50)} igjen
                    </div>
                    <input
                      className="mt-3 w-full"
                      type="range"
                      min={0}
                      max={clampInt(capacity, 1, 50)}
                      value={clampInt(glassesLeft, 0, clampInt(capacity, 1, 50))}
                      onChange={(e) => setGlassesLeft(Number(e.target.value))}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-slate-200">Kapasitet (glass)</Label>
                  <Input
                    value={String(capacity)}
                    onChange={(e) => setCapacity(clampInt(Number(e.target.value), 1, 50))}
                    className="mt-2 h-12 rounded-2xl border-white/10 bg-black/20 text-white"
                    inputMode="numeric"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-slate-200">Type sted</Label>
                  <select
                    value={placeType}
                    onChange={(e) => setPlaceType(e.target.value as (typeof placeTypes)[number])}
                    className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-3 text-white"
                  >
                    <option value="" disabled>
                      Velg…
                    </option>
                    {placeTypes.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-slate-200">Butikknavn (valgfritt)</Label>
                  <Input
                    value={placeName}
                    onChange={(e) => setPlaceName(e.target.value)}
                    placeholder="F.eks. Tistasenteret Bakeri"
                    className="mt-2 h-12 rounded-2xl border-white/10 bg-black/20 text-white placeholder:text-slate-500"
                    inputMode="text"
                  />
                </div>
              </div>

              <div>
                <Label className="text-slate-200">Bilder (valgfritt)</Label>
                <div className="mt-2 rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    onChange={(e) => onPickImages(e.target.files)}
                    className="block w-full text-sm text-slate-200 file:mr-4 file:rounded-xl file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-white/15"
                  />
                  {previewUrls.length ? (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {previewUrls.map((url) => (
                        <div key={url} className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                          <img src={url} alt="" className="h-20 w-full object-cover" />
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              <div>
                <Label className="text-slate-200">GPS</Label>
                <div className="mt-2 rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-slate-200">
                      {gpsStatus === "loading"
                        ? "Henter GPS…"
                        : gpsStatus === "ok" && gps
                          ? `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}`
                          : gpsStatus === "fail"
                            ? "Kunne ikke hente GPS"
                            : "Ikke hentet"}
                    </div>
                    <div className="flex items-center gap-2">
                      {gps ? (
                        <a
                          href={`https://www.openstreetmap.org/?mlat=${encodeURIComponent(
                            String(gps.lat)
                          )}&mlon=${encodeURIComponent(String(gps.lng))}#map=18/${encodeURIComponent(
                            String(gps.lat)
                          )}/${encodeURIComponent(String(gps.lng))}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="h-10 rounded-full border border-white/10 bg-white/5 px-3 text-sm font-semibold text-white hover:bg-white/10 inline-flex items-center"
                        >
                          Åpne kart
                        </a>
                      ) : null}
                      <Button
                        variant="secondary"
                        className="h-10 rounded-full bg-white/10 text-white hover:bg-white/15"
                        onClick={requestGps}
                        disabled={gpsStatus === "loading" || busy}
                      >
                        GPS
                      </Button>
                      <Button
                        variant="secondary"
                        className="h-10 rounded-full bg-white/10 text-white hover:bg-white/15"
                        onClick={() => setMapOpen((v) => !v)}
                        disabled={busy}
                      >
                        🌍 Kart
                      </Button>
                    </div>
                  </div>

                  {mapOpen ? (
                    <div className="mt-3 space-y-3">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                        <Input
                          value={placeQuery}
                          onChange={(e) => setPlaceQuery(e.target.value)}
                          placeholder="Søk sted (f.eks. Tistasenteret, Halden)"
                          className="h-12 rounded-2xl border-white/10 bg-black/20 text-white placeholder:text-slate-500"
                        />
                        <Button
                          className="h-12 rounded-2xl bg-white/10 text-white hover:bg-white/15"
                          variant="secondary"
                          onClick={onSearchPlace}
                          disabled={placeBusy || busy}
                        >
                          {placeBusy ? "Søker…" : "Søk"}
                        </Button>
                      </div>

                      {placeError ? <div className="text-sm text-rose-200">{placeError}</div> : null}

                      {placeResults.length ? (
                        <div className="grid grid-cols-1 gap-2">
                          {placeResults.map((r) => (
                            <button
                              key={`${r.lat}:${r.lng}:${r.name}`}
                              type="button"
                              className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-left hover:bg-black/20"
                              onClick={() => {
                                const next = { lat: r.lat, lng: r.lng }
                                setGps(next)
                                setManualLat(String(next.lat))
                                setManualLng(String(next.lng))
                                setGpsStatus("ok")
                              }}
                            >
                              <div className="text-sm font-semibold text-slate-50">{r.name}</div>
                              <div className="mt-0.5 text-xs text-slate-300">
                                {r.lat.toFixed(5)}, {r.lng.toFixed(5)}
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : null}

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div>
                          <Label className="text-slate-200">Lat</Label>
                          <Input
                            value={manualLat}
                            onChange={(e) => {
                              const v = e.target.value
                              setManualLat(v)
                              applyManualCoords(v, manualLng)
                            }}
                            placeholder="59.12"
                            className="mt-2 h-12 rounded-2xl border-white/10 bg-black/20 text-white placeholder:text-slate-500"
                            inputMode="decimal"
                          />
                        </div>
                        <div>
                          <Label className="text-slate-200">Lng</Label>
                          <Input
                            value={manualLng}
                            onChange={(e) => {
                              const v = e.target.value
                              setManualLng(v)
                              applyManualCoords(manualLat, v)
                            }}
                            placeholder="11.38"
                            className="mt-2 h-12 rounded-2xl border-white/10 bg-black/20 text-white placeholder:text-slate-500"
                            inputMode="decimal"
                          />
                        </div>
                      </div>
                      <div className="text-xs text-slate-300">
                        Bruk kart-søk hvis GPS ikke treffer riktig. Du kan også skrive inn koordinater manuelt.
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div>
                <Label className="text-slate-200">Kommentar (valgfri)</Label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="F.eks. Selger veldig bra…"
                  className="mt-2 h-28 w-full resize-none rounded-2xl border border-white/10 bg-black/20 px-3 py-3 text-white placeholder:text-slate-500"
                />
              </div>

              {mode === "runde" ? (
                <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-100">Påfylling</div>
                    <label className="flex items-center gap-2 text-sm text-slate-200">
                      <input
                        type="checkbox"
                        checked={filledNow}
                        onChange={(e) => setFilledNow(e.target.checked)}
                        className="h-5 w-5"
                      />
                      Påfylt nå
                    </label>
                  </div>
                  {filledNow ? (
                    <div className="mt-3">
                      <Label className="text-slate-200">Antall glass fylt på</Label>
                      <Input
                        value={String(filledAdded)}
                        onChange={(e) => setFilledAdded(clampInt(Number(e.target.value), 0, 200))}
                        className="mt-2 h-12 rounded-2xl border-white/10 bg-black/20 text-white"
                        inputMode="numeric"
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}

              <Button
                onClick={onSave}
                disabled={busy}
                className="h-14 w-full rounded-3xl bg-emerald-500 text-base font-semibold text-emerald-950 hover:bg-emerald-400"
              >
                {busy ? "Lagrer…" : mode === "utsetting" ? "🐝 Registrer utsetting" : "🐝 Lagre registrering"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
