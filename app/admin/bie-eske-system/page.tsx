"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Lager = {
  id: string
  kind?: string | null
  name?: string | null
  person_name?: string | null
  dedupe_key?: string | null
  location_type?: string | null
  address?: string | null
  lat?: number | null
  lng?: number | null
  responsible_lager_id?: string | null
  updated_at?: string | null
  active?: boolean | null
  balances?: Record<string, number> | null
}

type MedlemPersonlager = {
  id: string
  userId?: string | null
  navn?: string | null
  epost?: string | null
  role?: string | null
  lagerId: string
  balances?: Record<string, number> | null
}

type LocationDetails = {
  location: Lager | null
  balances: Record<string, number>
  events: Array<{
    id: string
    created_at?: string | null
    type?: string | null
    glasses_left?: number | null
    filled_added?: number | null
    comment?: string | null
    image1_path?: string | null
    image2_path?: string | null
    image3_path?: string | null
    actor_epost?: string | null
  }>
  signed: Record<string, string>
}

type ApiState =
  | { type: "idle" }
  | { type: "loading" }
  | {
      type: "ready"
      role: string
      lagre: Lager[]
      locations: Lager[]
      members: MedlemPersonlager[]
      totals: { totalLagere: number; totalLokasjoner: number }
    }
  | { type: "error"; message: string }

function splitSchemaMessage(message: string) {
  const parts = String(message ?? "").split("\n\n")
  if (parts.length < 2) return { intro: String(message ?? ""), sql: "" }
  return { intro: parts[0], sql: parts.slice(1).join("\n\n") }
}

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

export default function BieEskeSystemPage() {
  const router = useRouter()
  const [api, setApi] = useState<ApiState>({ type: "idle" })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [copiedSql, setCopiedSql] = useState(false)

  const [adjustLagerId, setAdjustLagerId] = useState("")
  const [adjustItem, setAdjustItem] = useState<"bie_eske" | "glass">("bie_eske")
  const [adjustQty, setAdjustQty] = useState(0)
  const [adjustNote, setAdjustNote] = useState("")

  const [transferFrom, setTransferFrom] = useState("")
  const [transferTo, setTransferTo] = useState("")
  const [transferItem, setTransferItem] = useState<"bie_eske" | "glass">("glass")
  const [transferQty, setTransferQty] = useState(1)
  const [transferNote, setTransferNote] = useState("")

  const [deployFromPerson, setDeployFromPerson] = useState("")
  const [deployLocationName, setDeployLocationName] = useState("")
  const [deployLocationType, setDeployLocationType] = useState("")
  const [deployAddress, setDeployAddress] = useState("")
  const [deployBoxes, setDeployBoxes] = useState(1)
  const [deployGlasses, setDeployGlasses] = useState(15)
  const [deployComment, setDeployComment] = useState("")
  const [deployImages, setDeployImages] = useState<File[]>([])
  const lastAutoDeployGlasses = useRef(15)

  const [selectedLocationId, setSelectedLocationId] = useState<string>("")
  const [locationDetails, setLocationDetails] = useState<LocationDetails | null>(null)
  const [controlGlassesLeft, setControlGlassesLeft] = useState(0)
  const [controlFilledAdded, setControlFilledAdded] = useState(0)
  const [controlFromLagerId, setControlFromLagerId] = useState("")
  const [controlComment, setControlComment] = useState("")
  const [controlImages, setControlImages] = useState<File[]>([])

  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null)
  const [gpsStatus, setGpsStatus] = useState<"idle" | "loading" | "ok" | "fail">("idle")

  const locationOpenRef = useRef<string>("")

  const fetchOverview = useCallback(async () => {
    setApi({ type: "loading" })
    try {
      const res = await fetch("/api/admin/bie-eske-system", { cache: "no-store" })
      const json = (await res.json()) as { ok?: boolean; feil?: string } & Record<string, unknown>
      if (!res.ok || !json.ok) {
        setApi({ type: "error", message: String(json.feil ?? "Kunne ikke hente oversikt.") })
        return
      }
      setApi({
        type: "ready",
        role: String(json.role ?? ""),
        lagre: (json.lagre as Lager[]) ?? [],
        locations: (json.locations as Lager[]) ?? [],
        members: (json.members as MedlemPersonlager[]) ?? [],
        totals: (json.totals as { totalLagere: number; totalLokasjoner: number }) ?? { totalLagere: 0, totalLokasjoner: 0 },
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

  useEffect(() => {
    const auto = clampInt(deployBoxes, 1, 1000) * 15
    if (deployGlasses === lastAutoDeployGlasses.current) {
      setTimeout(() => setDeployGlasses(auto), 0)
    }
    lastAutoDeployGlasses.current = auto
  }, [deployBoxes, deployGlasses])

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
        setGpsStatus("ok")
      },
      () => {
        setGps(null)
        setGpsStatus("fail")
      },
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 60_000 }
    )
  }, [])

  const pickImages = useCallback((files: FileList | null, setter: (v: File[]) => void) => {
    if (!files) return
    const arr = Array.from(files).filter((f) => f.size > 0).slice(0, 3)
    setter(arr)
  }, [])

  const warehouses = useMemo(() => {
    if (api.type !== "ready") return { main: [] as Lager[], people: [] as Lager[], locations: [] as Lager[] }
    const main = api.lagre.filter((l) => String(l.kind ?? "") === "main")
    const people = api.lagre.filter((l) => String(l.kind ?? "") === "person")
    const locations = api.lagre.filter((l) => String(l.kind ?? "") === "location")
    return { main, people, locations }
  }, [api])

  const defaultMainId = useMemo(() => warehouses.main[0]?.id ?? "", [warehouses.main])

  useEffect(() => {
    if (!adjustLagerId && defaultMainId) {
      setTimeout(() => setAdjustLagerId(defaultMainId), 0)
    }
    if (!transferFrom && defaultMainId) {
      setTimeout(() => setTransferFrom(defaultMainId), 0)
    }
  }, [adjustLagerId, defaultMainId, transferFrom])

  const openLocation = useCallback(async (id: string) => {
    const nextId = String(id ?? "").trim()
    if (!nextId || busy) return
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/admin/bie-eske-system?action=getLocation&id=${encodeURIComponent(nextId)}`, { cache: "no-store" })
      const json = (await res.json()) as { ok?: boolean; feil?: string } & LocationDetails
      if (!res.ok || !json.ok) {
        setBusy(false)
        setMsg(String(json.feil ?? "Kunne ikke åpne lokasjon."))
        return
      }
      setSelectedLocationId(nextId)
      setLocationDetails({ location: json.location ?? null, balances: json.balances ?? {}, events: json.events ?? [], signed: json.signed ?? {} })
      locationOpenRef.current = nextId
      const currentGlass = Number((json.balances ?? {})["glass"] ?? 0)
      setControlGlassesLeft(Number.isFinite(currentGlass) ? Math.max(0, Math.trunc(currentGlass)) : 0)
      setControlFilledAdded(0)
      setControlComment("")
      setControlImages([])
      const responsible = String((json.location as Lager | null)?.responsible_lager_id ?? "").trim()
      setControlFromLagerId(responsible)
      setBusy(false)
      setTimeout(() => requestGps(), 0)
    } catch {
      setBusy(false)
      setMsg("Kunne ikke åpne lokasjon.")
    }
  }, [busy, requestGps])

  const postForm = useCallback(async (fd: FormData) => {
    const res = await fetch("/api/admin/bie-eske-system", { method: "POST", body: fd })
    const json = (await res.json()) as { ok?: boolean; feil?: string } & Record<string, unknown>
    if (!res.ok || !json.ok) return { ok: false as const, feil: String(json.feil ?? "Kunne ikke lagre.") }
    return { ok: true as const, json }
  }, [])

  const onCreateMain = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setMsg(null)
    const fd = new FormData()
    fd.set("action", "createMain")
    const out = await postForm(fd)
    setBusy(false)
    if (!out.ok) {
      setMsg(out.feil)
      return
    }
    setMsg("✅ Hovedlager klart.")
    await fetchOverview()
    setTimeout(() => setMsg(null), 1400)
  }, [busy, fetchOverview, postForm])

  const onAdjust = useCallback(async () => {
    if (busy) return
    if (!adjustLagerId) {
      setMsg("Velg lager.")
      return
    }
    const qty = clampInt(adjustQty, 0, 1_000_000)
    setBusy(true)
    setMsg(null)
    const fd = new FormData()
    fd.set("action", "adjust")
    fd.set("lagerId", adjustLagerId)
    fd.set("item", adjustItem)
    fd.set("qty", String(qty))
    if (adjustNote.trim()) fd.set("note", adjustNote.trim())
    const out = await postForm(fd)
    setBusy(false)
    if (!out.ok) {
      setMsg(out.feil)
      return
    }
    setAdjustNote("")
    setMsg("✅ Justert.")
    await fetchOverview()
    setTimeout(() => setMsg(null), 1200)
  }, [adjustItem, adjustLagerId, adjustNote, adjustQty, busy, fetchOverview, postForm])

  const onTransfer = useCallback(async () => {
    if (busy) return
    if (!transferFrom || !transferTo) {
      setMsg("Velg fra/til lager.")
      return
    }
    const qty = clampInt(transferQty, 1, 1_000_000)
    setBusy(true)
    setMsg(null)
    const fd = new FormData()
    fd.set("action", "transfer")
    fd.set("fromId", transferFrom)
    fd.set("toId", transferTo)
    fd.set("item", transferItem)
    fd.set("qty", String(qty))
    if (transferNote.trim()) fd.set("note", transferNote.trim())
    const out = await postForm(fd)
    setBusy(false)
    if (!out.ok) {
      setMsg(out.feil)
      return
    }
    setTransferNote("")
    setMsg("✅ Flyttet.")
    await fetchOverview()
    setTimeout(() => setMsg(null), 1200)
  }, [busy, fetchOverview, postForm, transferFrom, transferItem, transferNote, transferQty, transferTo])

  const onDeploy = useCallback(async () => {
    if (busy) return
    if (!deployFromPerson) return setMsg("Velg personlager.")
    if (!deployLocationName.trim()) return setMsg("Mangler lokasjon.")
    if (!deployLocationType.trim()) return setMsg("Mangler type sted.")
    setBusy(true)
    setMsg(null)
    const fd = new FormData()
    fd.set("action", "deploy")
    fd.set("fromPersonId", deployFromPerson)
    fd.set("locationName", deployLocationName.trim())
    fd.set("locationType", deployLocationType.trim())
    if (deployAddress.trim()) fd.set("address", deployAddress.trim())
    fd.set("boxes", String(clampInt(deployBoxes, 1, 1000)))
    fd.set("glasses", String(clampInt(deployGlasses, 0, 1000)))
    if (deployComment.trim()) fd.set("comment", deployComment.trim())
    if (gps) {
      fd.set("lat", String(gps.lat))
      fd.set("lng", String(gps.lng))
    }
    for (const f of deployImages) fd.append("images", f)
    const out = await postForm(fd)
    setBusy(false)
    if (!out.ok) {
      setMsg(out.feil)
      return
    }
    setDeployLocationName("")
    setDeployLocationType("")
    setDeployAddress("")
    setDeployBoxes(1)
    setDeployGlasses(15)
    setDeployComment("")
    setDeployImages([])
    setMsg("✅ Utsetting logget og lager oppdatert.")
    await fetchOverview()
    const locationId = String((out.json as { locationId?: unknown }).locationId ?? "")
    if (locationId) await openLocation(locationId)
    setTimeout(() => setMsg(null), 1600)
  }, [busy, deployAddress, deployBoxes, deployComment, deployFromPerson, deployGlasses, deployImages, deployLocationName, deployLocationType, gps, openLocation, fetchOverview, postForm])

  const onControl = useCallback(async () => {
    if (busy) return
    if (!selectedLocationId) return
    setBusy(true)
    setMsg(null)
    const fd = new FormData()
    fd.set("action", "control")
    fd.set("locationId", selectedLocationId)
    fd.set("glassesLeft", String(clampInt(controlGlassesLeft, 0, 1_000_000)))
    if (controlFilledAdded > 0) {
      fd.set("filledAdded", String(clampInt(controlFilledAdded, 0, 1000)))
      fd.set("fromLagerId", controlFromLagerId)
    }
    if (controlComment.trim()) fd.set("comment", controlComment.trim())
    if (gps) {
      fd.set("lat", String(gps.lat))
      fd.set("lng", String(gps.lng))
    }
    for (const f of controlImages) fd.append("images", f)
    const out = await postForm(fd)
    setBusy(false)
    if (!out.ok) {
      setMsg(out.feil)
      return
    }
    setControlFilledAdded(0)
    setControlComment("")
    setControlImages([])
    setMsg("✅ Kontroll lagret.")
    await fetchOverview()
    if (locationOpenRef.current) await openLocation(locationOpenRef.current)
    setTimeout(() => setMsg(null), 1400)
  }, [busy, controlComment, controlFilledAdded, controlFromLagerId, controlGlassesLeft, controlImages, fetchOverview, gps, openLocation, postForm, selectedLocationId])

  const balancesText = useCallback((l: Lager) => {
    const b = l.balances ?? {}
    const boxes = Number(b["bie_eske"] ?? 0)
    const glasses = Number(b["glass"] ?? 0)
    return `${Number.isFinite(boxes) ? boxes : 0} esker · ${Number.isFinite(glasses) ? glasses : 0} glass`
  }, [])

  const selectedLocationName = String(locationDetails?.location?.name ?? "").trim()
  const selectedLocationMeta = `${String(locationDetails?.location?.location_type ?? "").trim() || "Ukjent type"} · ${String(locationDetails?.location?.address ?? "").trim() || "Ukjent adresse"}`

  const memberOptions = useMemo(() => {
    if (api.type !== "ready") return [] as MedlemPersonlager[]
    return (api.members ?? []).filter((m) => Boolean(String(m.lagerId ?? "").trim()))
  }, [api])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">📦 Bie-Eske System</h1>
          <p className="text-muted-foreground">Lagerstyring · personlager · lokasjoner · oppfølging</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => router.push("/admin")} disabled={busy}>
            Til admin
          </Button>
          <Button variant="secondary" onClick={fetchOverview} disabled={busy}>
            ↻ Oppdater
          </Button>
        </div>
      </div>

      {msg ? <div className="rounded-xl border bg-card p-4 text-sm">{msg}</div> : null}

      {api.type === "error" ? (
        <div className="rounded-xl border bg-card p-4 text-sm">
          {(() => {
            const { intro, sql } = splitSchemaMessage(api.message)
            const showCopy = Boolean(sql.trim())
            return (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="font-medium">{intro}</div>
                  {showCopy ? (
                    <button
                      type="button"
                      className="shrink-0 rounded-full border bg-background px-3 py-1 text-xs hover:bg-muted"
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
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl border bg-muted/30 p-3 text-xs">{sql.trim()}</pre>
                ) : null}
              </div>
            )
          })()}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-5">
          <div className="text-sm font-medium">Lagere</div>
          <div className="mt-1 text-2xl font-semibold">{api.type === "ready" ? api.totals.totalLagere : "—"}</div>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <div className="text-sm font-medium">Lokasjoner</div>
          <div className="mt-1 text-2xl font-semibold">{api.type === "ready" ? api.totals.totalLokasjoner : "—"}</div>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <div className="text-sm font-medium">GPS</div>
          <div className="mt-1 text-sm text-muted-foreground">
            {gpsStatus === "loading" ? "Henter…" : gpsStatus === "ok" && gps ? `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}` : gpsStatus === "fail" ? "Feil" : "Ikke hentet"}
          </div>
          <div className="mt-3">
            <Button variant="secondary" onClick={requestGps} disabled={busy || gpsStatus === "loading"}>
              Finn GPS
            </Button>
          </div>
        </div>
      </div>

      {api.type === "ready" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="rounded-xl border bg-card p-5">
              <div className="text-sm font-medium">Oppsett</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={onCreateMain} disabled={busy}>
                  Opprett hovedlager
                </Button>
              </div>
            <div className="mt-3 text-sm text-muted-foreground">Personlager hentes automatisk fra medlemsregisteret (aktive frivillige/admin).</div>
            </div>

            <div className="rounded-xl border bg-card p-5">
              <div className="text-sm font-medium">Justér beholdning</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Lager</Label>
                  <select className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm" value={adjustLagerId} onChange={(e) => setAdjustLagerId(e.target.value)}>
                    <option value="" disabled>
                      Velg…
                    </option>
                    {api.lagre.map((l) => (
                      <option key={l.id} value={l.id}>
                        {String(l.name ?? "")} ({String(l.kind ?? "")})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Vare</Label>
                  <select className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm" value={adjustItem} onChange={(e) => setAdjustItem(e.target.value as "bie_eske" | "glass")}>
                    <option value="bie_eske">Eske</option>
                    <option value="glass">Glass</option>
                  </select>
                </div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Antall (setter absolutt)</Label>
                  <Input value={String(adjustQty)} onChange={(e) => setAdjustQty(clampInt(Number(e.target.value), 0, 1_000_000))} inputMode="numeric" />
                </div>
                <div>
                  <Label>Notat (valgfri)</Label>
                  <Input value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} />
                </div>
              </div>
              <div className="mt-4">
                <Button onClick={onAdjust} disabled={busy}>
                  Lagre
                </Button>
              </div>
            </div>

            <div className="rounded-xl border bg-card p-5">
              <div className="text-sm font-medium">Flytt varer</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Fra</Label>
                  <select className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm" value={transferFrom} onChange={(e) => setTransferFrom(e.target.value)}>
                    <option value="" disabled>
                      Velg…
                    </option>
                    {api.lagre.map((l) => (
                      <option key={l.id} value={l.id}>
                        {String(l.name ?? "")} ({balancesText(l)})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Til</Label>
                  <select className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm" value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
                    <option value="" disabled>
                      Velg…
                    </option>
                    {api.lagre.map((l) => (
                      <option key={l.id} value={l.id}>
                        {String(l.name ?? "")} ({balancesText(l)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div>
                  <Label>Vare</Label>
                  <select className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm" value={transferItem} onChange={(e) => setTransferItem(e.target.value as "bie_eske" | "glass")}>
                    <option value="bie_eske">Eske</option>
                    <option value="glass">Glass</option>
                  </select>
                </div>
                <div>
                  <Label>Antall</Label>
                  <Input value={String(transferQty)} onChange={(e) => setTransferQty(clampInt(Number(e.target.value), 1, 1_000_000))} inputMode="numeric" />
                </div>
                <div>
                  <Label>Notat</Label>
                  <Input value={transferNote} onChange={(e) => setTransferNote(e.target.value)} />
                </div>
              </div>
              <div className="mt-4">
                <Button onClick={onTransfer} disabled={busy}>
                  Flytt
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border bg-card p-5">
              <div className="text-sm font-medium">Utsetting (ny lokasjon)</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Personlager</Label>
                  <select className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm" value={deployFromPerson} onChange={(e) => setDeployFromPerson(e.target.value)}>
                    <option value="" disabled>
                      Velg…
                    </option>
                    {memberOptions.map((m) => {
                      const b = m.balances ?? {}
                      const boxes = Number(b["bie_eske"] ?? 0)
                      const glasses = Number(b["glass"] ?? 0)
                      const labelName = String(m.navn ?? m.epost ?? "").trim()
                      const role = String(m.role ?? "").trim()
                      return (
                        <option key={m.lagerId} value={m.lagerId}>
                          {labelName || "Ukjent"}{role ? ` (${role})` : ""} · {Number.isFinite(boxes) ? boxes : 0} esker · {Number.isFinite(glasses) ? glasses : 0} glass
                        </option>
                      )
                    })}
                  </select>
                </div>
                <div>
                  <Label>Type sted</Label>
                  <Input value={deployLocationType} onChange={(e) => setDeployLocationType(e.target.value)} placeholder="F.eks. Butikk" />
                </div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Lokasjon</Label>
                  <Input value={deployLocationName} onChange={(e) => setDeployLocationName(e.target.value)} placeholder="F.eks. Europris" />
                </div>
                <div>
                  <Label>Adresse (valgfri)</Label>
                  <Input value={deployAddress} onChange={(e) => setDeployAddress(e.target.value)} placeholder="F.eks. Halden" />
                </div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div>
                  <Label>Esker</Label>
                  <Input value={String(deployBoxes)} onChange={(e) => setDeployBoxes(clampInt(Number(e.target.value), 1, 1000))} inputMode="numeric" />
                </div>
                <div>
                  <Label>Glass (start)</Label>
                  <Input value={String(deployGlasses)} onChange={(e) => setDeployGlasses(clampInt(Number(e.target.value), 0, 1000))} inputMode="numeric" />
                  <div className="mt-1 text-xs text-muted-foreground">Standard: 15 glass per eske.</div>
                </div>
                <div>
                  <Label>Kommentar</Label>
                  <Input value={deployComment} onChange={(e) => setDeployComment(e.target.value)} />
                </div>
              </div>
              <div className="mt-3">
                <Label>Bilde ved utsetting</Label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  onChange={(e) => pickImages(e.target.files, setDeployImages)}
                  className="mt-2 block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-muted file:px-4 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted/70"
                />
              </div>
              <div className="mt-4">
                <Button onClick={onDeploy} disabled={busy}>
                  Registrer utsetting
                </Button>
              </div>
            </div>

            <div className="rounded-xl border bg-card p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">Lokasjoner</div>
                  <div className="mt-1 text-sm text-muted-foreground">Åpne eksisterende lokasjon for oppfølging</div>
                </div>
                {selectedLocationId ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSelectedLocationId("")
                      setLocationDetails(null)
                    }}
                    disabled={busy}
                  >
                    Lukk
                  </Button>
                ) : null}
              </div>

              {!selectedLocationId ? (
                <div className="mt-3 grid gap-2">
                  {api.locations.slice(0, 12).map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      className="rounded-lg border bg-background p-3 text-left hover:bg-muted/40"
                      onClick={() => openLocation(l.id)}
                      disabled={busy}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium">{String(l.name ?? "")}</div>
                        <div className="text-xs text-muted-foreground">{formatWhen(l.updated_at)}</div>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {String(l.location_type ?? "").trim() || "Ukjent type"} · {balancesText(l)}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="rounded-lg border bg-background p-4">
                    <div className="text-base font-semibold">{selectedLocationName || "Lokasjon"}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{selectedLocationMeta}</div>
                    <div className="mt-3 text-sm">
                      <span className="font-medium">Beholdning:</span> {Number(locationDetails?.balances?.["bie_eske"] ?? 0)} esker ·{" "}
                      {Number(locationDetails?.balances?.["glass"] ?? 0)} glass
                    </div>
                  </div>

                  <div className="rounded-lg border bg-background p-4">
                    <div className="text-sm font-medium">Oppfølging / kontroll</div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <div>
                        <Label>Glass igjen</Label>
                        <Input value={String(controlGlassesLeft)} onChange={(e) => setControlGlassesLeft(clampInt(Number(e.target.value), 0, 1_000_000))} inputMode="numeric" />
                      </div>
                      <div>
                        <Label>Påfylt (antall)</Label>
                        <Input value={String(controlFilledAdded)} onChange={(e) => setControlFilledAdded(clampInt(Number(e.target.value), 0, 1000))} inputMode="numeric" />
                      </div>
                      <div>
                        <Label>Glass tas fra</Label>
                        <select className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm" value={controlFromLagerId} onChange={(e) => setControlFromLagerId(e.target.value)}>
                          <option value="">Velg…</option>
                          {api.lagre
                            .filter((l) => String(l.kind ?? "") !== "location")
                            .map((l) => (
                              <option key={l.id} value={l.id}>
                                {String(l.name ?? "")} ({balancesText(l)})
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                    <div className="mt-3">
                      <Label>Kommentar</Label>
                      <Input value={controlComment} onChange={(e) => setControlComment(e.target.value)} placeholder="Valgfri" />
                    </div>
                    <div className="mt-3">
                      <Label>Bilde ved kontroll</Label>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        multiple
                        onChange={(e) => pickImages(e.target.files, setControlImages)}
                        className="mt-2 block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-muted file:px-4 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted/70"
                      />
                    </div>
                    <div className="mt-4">
                      <Button onClick={onControl} disabled={busy}>
                        Lagre kontroll
                      </Button>
                    </div>
                  </div>

                  {locationDetails?.events?.length ? (
                    <div className="rounded-lg border bg-background p-4">
                      <div className="text-sm font-medium">Historikk</div>
                      <div className="mt-3 grid gap-3">
                        {locationDetails.events.slice(0, 12).map((e) => {
                          const imgs = [e.image1_path, e.image2_path, e.image3_path].map((p) => String(p ?? "").trim()).filter(Boolean)
                          return (
                            <div key={e.id} className="rounded-lg border bg-card p-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-sm font-medium">{String(e.type ?? "hendelse")}</div>
                                <div className="text-xs text-muted-foreground">{formatWhen(e.created_at)}</div>
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {typeof e.glasses_left === "number" ? `${e.glasses_left} igjen` : "ukjent"}{" "}
                                {typeof e.filled_added === "number" && e.filled_added > 0 ? `· +${e.filled_added}` : ""}
                              </div>
                              {e.comment ? <div className="mt-2 text-sm">{e.comment}</div> : null}
                              {imgs.length ? (
                                <div className="mt-3 grid grid-cols-3 gap-2">
                                  {imgs.map((p) => {
                                    const url = locationDetails.signed?.[p] ?? ""
                                    return (
                                      <div key={p} className="overflow-hidden rounded-md border bg-background">
                                        {url ? <img src={url} alt="" className="h-20 w-full object-cover" /> : <div className="h-20 bg-muted/30" />}
                                      </div>
                                    )
                                  })}
                                </div>
                              ) : null}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">{api.type === "loading" ? "Laster…" : "Klar."}</div>
      )}
    </div>
  )
}
