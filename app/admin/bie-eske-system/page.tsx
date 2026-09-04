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
  last_event_at?: string | null
  last_event_type?: string | null
  last_comment?: string | null
  last_actor_epost?: string | null
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

type StockFilter = "" | "tom" | "lav" | "ok" | "full"
type LocationSort = "updated" | "name" | "type" | "address" | "responsible" | "comment" | "glass" | "boxes"
type SortDir = "desc" | "asc"

function asStockFilter(v: string): StockFilter {
  if (v === "tom" || v === "lav" || v === "ok" || v === "full") return v
  return ""
}

function asLocationSort(v: string): LocationSort {
  if (v === "updated" || v === "name" || v === "type" || v === "address" || v === "responsible" || v === "comment" || v === "glass" || v === "boxes") return v
  return "updated"
}

function asSortDir(v: string): SortDir {
  if (v === "asc" || v === "desc") return v
  return "desc"
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
  const [locationsOpen, setLocationsOpen] = useState(false)
  const [includeInactiveLocations, setIncludeInactiveLocations] = useState(false)
  const [locQuery, setLocQuery] = useState("")
  const [locSort, setLocSort] = useState<LocationSort>("updated")
  const [locSortDir, setLocSortDir] = useState<SortDir>("desc")
  const [locTypeFilter, setLocTypeFilter] = useState<string>("")
  const [locResponsibleFilter, setLocResponsibleFilter] = useState<string>("")
  const [locStockFilter, setLocStockFilter] = useState<StockFilter>("")

  const [adjustLagerId, setAdjustLagerId] = useState("")
  const [adjustItem, setAdjustItem] = useState<"bie_eske" | "glass">("bie_eske")
  const [adjustQty, setAdjustQty] = useState(0)
  const [adjustNote, setAdjustNote] = useState("")

  const [transferFrom, setTransferFrom] = useState("")
  const [transferTo, setTransferTo] = useState("")
  const [transferBoxes, setTransferBoxes] = useState(0)
  const [transferGlasses, setTransferGlasses] = useState(0)
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
  const [editingLocation, setEditingLocation] = useState(false)
  const [editLocName, setEditLocName] = useState("")
  const [editLocType, setEditLocType] = useState("")
  const [editLocAddress, setEditLocAddress] = useState("")
  const [editLocResponsible, setEditLocResponsible] = useState("")
  const [controlGlassesLeft, setControlGlassesLeft] = useState(0)
  const [controlBaseGlasses, setControlBaseGlasses] = useState(0)
  const [controlGlassesManual, setControlGlassesManual] = useState(false)
  const [controlFilledAdded, setControlFilledAdded] = useState(0)
  const [controlFromLagerId, setControlFromLagerId] = useState("")
  const [controlCollectedGlasses, setControlCollectedGlasses] = useState(0)
  const [controlPickedUp, setControlPickedUp] = useState(false)
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
      const warning = String(json.warning ?? "").trim()
      if (warning) {
        setMsg(warning)
      } else {
        setMsg(null)
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

  const warehouseFromBalances = useMemo(() => {
    if (api.type !== "ready") return { boxes: 0, glasses: 0 }
    const l = api.lagre.find((x) => x.id === transferFrom)
    if (!l) return { boxes: 0, glasses: 0 }
    const b = l.balances ?? {}
    return {
      boxes: Math.max(0, Math.trunc(Number(b["bie_eske"] ?? 0))),
      glasses: Math.max(0, Math.trunc(Number(b["glass"] ?? 0))),
    }
  }, [api, transferFrom])

  const transferMaxBoxes = warehouseFromBalances.boxes
  const transferMaxGlasses = warehouseFromBalances.glasses

  const onChangeTransferFrom = useCallback((id: string) => {
    setTransferFrom(id)
    if (api.type !== "ready") return
    const l = api.lagre.find((x) => x.id === id)
    if (!l) {
      setTransferBoxes(0)
      setTransferGlasses(0)
      return
    }
    const b = l.balances ?? {}
    const currBoxes = Math.max(0, Math.trunc(Number(b["bie_eske"] ?? 0)))
    const currGlass = Math.max(0, Math.trunc(Number(b["glass"] ?? 0)))
    setTransferBoxes(currBoxes)
    setTransferGlasses(currGlass)
  }, [api])

  const onChangeTransferBoxes = useCallback((rawBoxes: number) => {
    const maxB = clampInt(transferMaxBoxes, 0, 1_000_000)
    const boxes = clampInt(rawBoxes, 0, maxB)
    setTransferBoxes(boxes)
  }, [transferMaxBoxes])

  useEffect(() => {
    if (!adjustLagerId && defaultMainId) {
      setTimeout(() => setAdjustLagerId(defaultMainId), 0)
    }
    if (!transferFrom && defaultMainId) {
      setTimeout(() => onChangeTransferFrom(defaultMainId), 0)
    }
  }, [adjustLagerId, defaultMainId, onChangeTransferFrom, transferFrom])

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
      const safeGlass = Number.isFinite(currentGlass) ? Math.max(0, Math.trunc(currentGlass)) : 0
      setControlGlassesLeft(safeGlass)
      setControlBaseGlasses(safeGlass)
      setControlGlassesManual(false)
      setControlFilledAdded(0)
      setControlCollectedGlasses(0)
      setControlPickedUp(false)
      setControlComment("")
      setControlImages([])
      const responsible = String((json.location as Lager | null)?.responsible_lager_id ?? "").trim()
      setControlFromLagerId(responsible)
      setEditingLocation(false)
      setEditLocName(String((json.location as Lager | null)?.name ?? ""))
      setEditLocType(String((json.location as Lager | null)?.location_type ?? ""))
      setEditLocAddress(String((json.location as Lager | null)?.address ?? ""))
      setEditLocResponsible(responsible)
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
    if (transferFrom === transferTo) {
      setMsg("Fra og til lager kan ikke være samme.")
      return
    }
    const boxes = clampInt(transferBoxes, 0, 1_000_000)
    const glasses = clampInt(transferGlasses, 0, 1_000_000)
    if (boxes <= 0 && glasses <= 0) {
      setMsg("Flytt minst én eske eller ett glass.")
      return
    }
    setBusy(true)
    setMsg(null)
    const fd = new FormData()
    fd.set("action", "transfer")
    fd.set("fromId", transferFrom)
    fd.set("toId", transferTo)
    fd.set("boxes", String(boxes))
    fd.set("glasses", String(glasses))
    if (transferNote.trim()) fd.set("note", transferNote.trim())
    const out = await postForm(fd)
    setBusy(false)
    if (!out.ok) {
      setMsg(out.feil)
      return
    }
    setTransferNote("")
    setTransferBoxes(0)
    setTransferGlasses(0)
    setMsg("✅ Flyttet.")
    await fetchOverview()
    setTimeout(() => setMsg(null), 1200)
  }, [busy, fetchOverview, postForm, transferBoxes, transferFrom, transferGlasses, transferNote, transferTo])

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
    }
    if (controlCollectedGlasses > 0) {
      fd.set("collectedGlasses", String(clampInt(controlCollectedGlasses, 0, 1_000_000)))
    }
    if (controlPickedUp) {
      fd.set("pickedUp", "1")
    }
    if (controlFilledAdded > 0 || controlCollectedGlasses > 0 || controlPickedUp) {
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
    setControlCollectedGlasses(0)
    setControlPickedUp(false)
    setControlComment("")
    setControlImages([])
    setMsg("✅ Kontroll lagret.")
    await fetchOverview()
    if (locationOpenRef.current) await openLocation(locationOpenRef.current)
    setTimeout(() => setMsg(null), 1400)
  }, [
    busy,
    controlCollectedGlasses,
    controlComment,
    controlFilledAdded,
    controlFromLagerId,
    controlGlassesLeft,
    controlImages,
    controlPickedUp,
    fetchOverview,
    gps,
    openLocation,
    postForm,
    selectedLocationId,
  ])

  const onUpdateLocation = useCallback(async () => {
    if (busy) return
    if (!selectedLocationId) return
    const name = editLocName.trim()
    const type = editLocType.trim()
    if (!name) return setMsg("Mangler lokasjonsnavn.")
    if (!type) return setMsg("Mangler type sted.")
    setBusy(true)
    setMsg(null)
    const fd = new FormData()
    fd.set("action", "updateLocation")
    fd.set("locationId", selectedLocationId)
    fd.set("name", name)
    fd.set("locationType", type)
    if (editLocAddress.trim()) fd.set("address", editLocAddress.trim())
    if (editLocResponsible.trim()) fd.set("responsibleLagerId", editLocResponsible.trim())
    const out = await postForm(fd)
    setBusy(false)
    if (!out.ok) {
      setMsg(out.feil)
      return
    }
    setEditingLocation(false)
    setMsg("✅ Lokasjon oppdatert.")
    await fetchOverview()
    await openLocation(selectedLocationId)
    setTimeout(() => setMsg(null), 1400)
  }, [busy, editLocAddress, editLocName, editLocResponsible, editLocType, fetchOverview, openLocation, postForm, selectedLocationId])

  const onDeactivateLocation = useCallback(async () => {
    if (busy) return
    if (!selectedLocationId) return
    if (!confirm("Deaktivere lokasjonen? (Den forsvinner fra listen.)")) return
    setBusy(true)
    setMsg(null)
    const fd = new FormData()
    fd.set("action", "deactivateLocation")
    fd.set("locationId", selectedLocationId)
    const out = await postForm(fd)
    setBusy(false)
    if (!out.ok) {
      setMsg(out.feil)
      return
    }
    setSelectedLocationId("")
    setLocationDetails(null)
    setEditingLocation(false)
    setMsg("✅ Lokasjon deaktivert.")
    await fetchOverview()
    setTimeout(() => setMsg(null), 1400)
  }, [busy, fetchOverview, postForm, selectedLocationId])

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

  const lagerNameById = useMemo(() => {
    const m = new Map<string, string>()
    if (api.type !== "ready") return m
    for (const l of api.lagre) {
      const id = String(l.id ?? "").trim()
      const name = String(l.name ?? "").trim()
      if (id && name) m.set(id, name)
    }
    return m
  }, [api])

  const typeOptions = useMemo(() => {
    if (api.type !== "ready") return [] as string[]
    const s = new Set<string>()
    for (const l of api.locations) {
      const t = String(l.location_type ?? "").trim()
      if (t) s.add(t)
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b, "no"))
  }, [api])

  const responsibleOptions = useMemo(() => {
    if (api.type !== "ready") return [] as Array<{ id: string; name: string }>
    const s = new Map<string, string>()
    for (const l of api.locations) {
      const id = String(l.responsible_lager_id ?? "").trim()
      if (!id) continue
      const name = lagerNameById.get(id) ?? ""
      s.set(id, name || id)
    }
    return Array.from(s.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "no"))
  }, [api, lagerNameById])

  const filteredSortedLocations = useMemo(() => {
    if (api.type !== "ready") return [] as Lager[]

    const normalize = (v: string) =>
      v
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")

    const q = normalize(locQuery.trim())
    const out = api.locations.filter((l) => {
      if (!includeInactiveLocations && l.active === false) return false
      const type = String(l.location_type ?? "").trim()
      if (locTypeFilter && type !== locTypeFilter) return false
      const resp = String(l.responsible_lager_id ?? "").trim()
      if (locResponsibleFilter && resp !== locResponsibleFilter) return false

      const b = l.balances ?? {}
      const glass = Math.max(0, Math.trunc(Number(b["glass"] ?? 0)))
      if (locStockFilter === "tom" && glass !== 0) return false
      if (locStockFilter === "lav" && !(glass >= 1 && glass <= 5)) return false
      if (locStockFilter === "ok" && !(glass >= 6 && glass <= 14)) return false
      if (locStockFilter === "full" && glass < 15) return false

      if (!q) return true
      const name = normalize(String(l.name ?? ""))
      const addr = normalize(String(l.address ?? ""))
      const comm = normalize(String(l.last_comment ?? ""))
      const respName = normalize(lagerNameById.get(resp) ?? "")
      return name.includes(q) || addr.includes(q) || normalize(type).includes(q) || comm.includes(q) || respName.includes(q)
    })

    const getSortVal = (l: Lager) => {
      const b = l.balances ?? {}
      const boxes = Math.max(0, Math.trunc(Number(b["bie_eske"] ?? 0)))
      const glass = Math.max(0, Math.trunc(Number(b["glass"] ?? 0)))
      const resp = String(l.responsible_lager_id ?? "").trim()
      const respName = lagerNameById.get(resp) ?? ""
      if (locSort === "updated") return String(l.updated_at ?? "")
      if (locSort === "name") return String(l.name ?? "")
      if (locSort === "type") return String(l.location_type ?? "")
      if (locSort === "address") return String(l.address ?? "")
      if (locSort === "responsible") return respName
      if (locSort === "comment") return String(l.last_comment ?? "")
      if (locSort === "glass") return glass
      return boxes
    }

    const dir = locSortDir === "asc" ? 1 : -1
    out.sort((a, b) => {
      const av = getSortVal(a)
      const bv = getSortVal(b)
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir
      return String(av).localeCompare(String(bv), "no", { sensitivity: "base" }) * dir
    })

    return out
  }, [api, includeInactiveLocations, lagerNameById, locQuery, locResponsibleFilter, locSort, locSortDir, locStockFilter, locTypeFilter])

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
          <div className="order-2 space-y-4 lg:order-1">
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
                  <select className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm" value={transferFrom} onChange={(e) => onChangeTransferFrom(e.target.value)}>
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
                  <Label>Antall esker (maks {transferMaxBoxes})</Label>
                  <Input
                    value={String(transferBoxes)}
                    onChange={(e) => {
                      onChangeTransferBoxes(Number(e.target.value))
                    }}
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <Label>Antall glass (maks {transferMaxGlasses})</Label>
                  <Input
                    value={String(transferGlasses)}
                    onChange={(e) => {
                      setTransferGlasses(clampInt(Number(e.target.value), 0, transferMaxGlasses))
                    }}
                    inputMode="numeric"
                  />
                  <div className="mt-1 text-xs text-muted-foreground">
                    Velg først «Fra»-lager – så setter vi antall esker og glass lik det som faktisk finnes derfra (fra siste kontroll).
                    Flytt gjerne esker og løse glass i egne operasjoner. For å gi medlem 1 eske + 5 løse glass: flytt først 1 eske (også 15 glass), deretter flytt 5 løse glass i et nytt flytt.
                  </div>
                </div>
                <div>
                  <Label>Notat</Label>
                  <Input value={transferNote} onChange={(e) => setTransferNote(e.target.value)} />
                </div>
              </div>
              <div className="mt-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <div className="text-xs text-muted-foreground">
                  {transferFrom
                    ? `Saldo på fra-lager: ${transferMaxBoxes} esker, ${transferMaxGlasses} glass.`
                    : "Velg fra-lager for å se saldo og standard-verdier."}
                </div>
                <Button onClick={onTransfer} disabled={busy}>
                  Flytt
                </Button>
              </div>
            </div>
          </div>

          <div className="order-1 space-y-4 lg:order-2">
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
                  multiple
                  onChange={(e) => {
                    pickImages(e.currentTarget.files, setDeployImages)
                    e.currentTarget.value = ""
                  }}
                  className="mt-2 block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-muted file:px-4 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted/70"
                />
                {deployImages.length ? (
                  <div className="mt-2 text-xs text-muted-foreground">
                    Valgt: {deployImages.slice(0, 3).map((f) => f.name).join(", ")}
                  </div>
                ) : null}
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
                <div className="flex items-center gap-2">
                  <Button variant="secondary" onClick={() => setLocationsOpen(true)} disabled={busy || api.type !== "ready"}>
                    Vis alle
                  </Button>
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
              </div>

              {locationsOpen && api.type === "ready" ? (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-muted-foreground">
                      Viser {filteredSortedLocations.length} av{" "}
                      {includeInactiveLocations ? api.locations.length : api.locations.filter((l) => l.active !== false).length}
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={includeInactiveLocations} onChange={(e) => setIncludeInactiveLocations(e.target.checked)} />
                      Vis inaktive
                    </label>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setLocationsOpen(false)
                      }}
                      disabled={busy}
                    >
                      Lukk liste
                    </Button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>Søk</Label>
                      <Input value={locQuery} onChange={(e) => setLocQuery(e.target.value)} placeholder="Lokasjon / adresse / type / kommentar / ansvarlig" className="mt-2" />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label>Type sted</Label>
                        <select className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm" value={locTypeFilter} onChange={(e) => setLocTypeFilter(e.target.value)}>
                          <option value="">Alle</option>
                          {typeOptions.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Label>Beholdning (glass)</Label>
                        <select className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm" value={locStockFilter} onChange={(e) => setLocStockFilter(asStockFilter(e.target.value))}>
                          <option value="">Alle</option>
                          <option value="tom">Tom (0)</option>
                          <option value="lav">Lav (1–5)</option>
                          <option value="ok">OK (6–14)</option>
                          <option value="full">Full (15+)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label>Utsatt av</Label>
                      <select className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm" value={locResponsibleFilter} onChange={(e) => setLocResponsibleFilter(e.target.value)}>
                        <option value="">Alle</option>
                        {responsibleOptions.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label>Sorter på</Label>
                      <select className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm" value={locSort} onChange={(e) => setLocSort(asLocationSort(e.target.value))}>
                        <option value="updated">Sist oppdatert</option>
                        <option value="name">Lokasjon</option>
                        <option value="type">Type sted</option>
                        <option value="responsible">Utsatt av</option>
                        <option value="address">Adresse</option>
                        <option value="comment">Kommentar</option>
                        <option value="glass">Glass</option>
                        <option value="boxes">Esker</option>
                      </select>
                    </div>
                    <div>
                      <Label>Rekkefølge</Label>
                      <select className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm" value={locSortDir} onChange={(e) => setLocSortDir(asSortDir(e.target.value))}>
                        <option value="desc">Synkende</option>
                        <option value="asc">Stigende</option>
                      </select>
                    </div>
                  </div>

                  <div className="max-h-[70vh] overflow-auto rounded-lg border bg-background">
                    <div className="grid gap-2 p-3">
                      {filteredSortedLocations.map((l) => {
                        const b = l.balances ?? {}
                        const boxes = Math.max(0, Math.trunc(Number(b["bie_eske"] ?? 0)))
                        const glass = Math.max(0, Math.trunc(Number(b["glass"] ?? 0)))
                        const respId = String(l.responsible_lager_id ?? "").trim()
                        const respName = respId ? lagerNameById.get(respId) ?? respId : "—"
                        const comment = String(l.last_comment ?? "").trim()
                        return (
                          <button
                            key={l.id}
                            type="button"
                            className="rounded-lg border bg-card p-3 text-left hover:bg-muted/40"
                            onClick={() => {
                              setLocationsOpen(false)
                              openLocation(l.id)
                            }}
                            disabled={busy}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="text-sm font-medium">{String(l.name ?? "")}</div>
                              <div className="text-xs text-muted-foreground">{formatWhen(l.updated_at)}</div>
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {String(l.location_type ?? "").trim() || "Ukjent type"} · {boxes} esker · {glass} glass
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {respName} · {String(l.address ?? "").trim() || "Ukjent adresse"}
                            </div>
                            {comment ? <div className="mt-2 text-sm">{comment}</div> : null}
                          </button>
                        )
                      })}
                      {!filteredSortedLocations.length ? <div className="p-3 text-sm text-muted-foreground">Ingen treff.</div> : null}
                    </div>
                  </div>
                </div>
              ) : null}

              {!selectedLocationId ? (
                <div className="mt-3 grid gap-2">
                  {api.locations
                    .filter((l) => l.active !== false)
                    .slice(0, 12)
                    .map((l) => (
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
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-base font-semibold">{selectedLocationName || "Lokasjon"}</div>
                        <div className="mt-1 text-sm text-muted-foreground">{selectedLocationMeta}</div>
                      </div>
                      {api.role !== "frivillig" ? (
                        <div className="flex flex-wrap gap-2">
                          {!editingLocation ? (
                            <Button variant="outline" onClick={() => setEditingLocation(true)} disabled={busy}>
                              Rediger
                            </Button>
                          ) : (
                            <>
                              <Button variant="outline" onClick={() => setEditingLocation(false)} disabled={busy}>
                                Avbryt
                              </Button>
                              <Button onClick={onUpdateLocation} disabled={busy}>
                                Lagre
                              </Button>
                            </>
                          )}
                          <Button variant="destructive" onClick={onDeactivateLocation} disabled={busy}>
                            Deaktiver
                          </Button>
                        </div>
                      ) : null}
                    </div>
                    <div className="mt-3 text-sm">
                      <span className="font-medium">Beholdning:</span> {Number(locationDetails?.balances?.["bie_eske"] ?? 0)} esker ·{" "}
                      {Number(locationDetails?.balances?.["glass"] ?? 0)} glass
                    </div>
                    {editingLocation && api.role !== "frivillig" ? (
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div>
                          <Label>Butikknavn / lokasjon</Label>
                          <Input value={editLocName} onChange={(e) => setEditLocName(e.target.value)} />
                        </div>
                        <div>
                          <Label>Type sted</Label>
                          <Input value={editLocType} onChange={(e) => setEditLocType(e.target.value)} />
                        </div>
                        <div className="sm:col-span-2">
                          <Label>Adresse</Label>
                          <Input value={editLocAddress} onChange={(e) => setEditLocAddress(e.target.value)} placeholder="Valgfri" />
                        </div>
                        <div className="sm:col-span-2">
                          <Label>Ansvarlig personlager</Label>
                          <select className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm" value={editLocResponsible} onChange={(e) => setEditLocResponsible(e.target.value)}>
                            <option value="">—</option>
                            {api.lagre
                              .filter((l) => String(l.kind ?? "") !== "location")
                              .map((l) => (
                                <option key={l.id} value={l.id}>
                                  {String(l.name ?? "")}
                                </option>
                              ))}
                          </select>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-lg border bg-background p-4">
                    <div className="text-sm font-medium">Oppfølging / kontroll</div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <div>
                        <Label>Glass igjen</Label>
                        <Input
                          value={String(controlGlassesLeft)}
                          onChange={(e) => {
                            setControlGlassesManual(true)
                            setControlGlassesLeft(clampInt(Number(e.target.value), 0, 1_000_000))
                          }}
                          inputMode="numeric"
                        />
                      </div>
                      <div>
                        <Label>Påfylt (antall)</Label>
                        <Input
                          value={String(controlFilledAdded)}
                          onChange={(e) => {
                            const nextFilled = clampInt(Number(e.target.value), 0, 1000)
                            setControlFilledAdded(nextFilled)
                            if (!controlGlassesManual) {
                              setControlGlassesLeft(clampInt(controlBaseGlasses + nextFilled - clampInt(controlCollectedGlasses, 0, 1_000_000), 0, 1_000_000))
                            }
                          }}
                          inputMode="numeric"
                        />
                      </div>
                      <div>
                        <Label>Lager/person (besøk)</Label>
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
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <div>
                        <Label>Glass hentes inn</Label>
                        <Input
                          value={String(controlCollectedGlasses)}
                          onChange={(e) => {
                            const nextCollected = clampInt(Number(e.target.value), 0, 1_000_000)
                            setControlCollectedGlasses(nextCollected)
                            if (!controlGlassesManual) {
                              setControlGlassesLeft(clampInt(controlBaseGlasses + clampInt(controlFilledAdded, 0, 1000) - nextCollected, 0, 1_000_000))
                            }
                          }}
                          inputMode="numeric"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label>Eske</Label>
                        <div className="mt-2 flex items-center gap-2">
                          <input
                            id="pickedUp"
                            type="checkbox"
                            checked={controlPickedUp}
                            onChange={(e) => {
                              const next = Boolean(e.target.checked)
                              setControlPickedUp(next)
                              if (next) {
                                const prevLeft = clampInt(controlGlassesLeft, 0, 1_000_000)
                                if (controlCollectedGlasses === 0 && prevLeft > 0) setControlCollectedGlasses(prevLeft)
                                setControlGlassesLeft(0)
                              }
                            }}
                            className="h-4 w-4 rounded border"
                          />
                          <label htmlFor="pickedUp" className="text-sm">
                            Hentet inn (esken tas med)
                          </label>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">Når hentet inn settes glass igjen automatisk til 0.</div>
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
                        multiple
                        onChange={(e) => {
                          pickImages(e.currentTarget.files, setControlImages)
                          e.currentTarget.value = ""
                        }}
                        className="mt-2 block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-muted file:px-4 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted/70"
                      />
                      {controlImages.length ? (
                        <div className="mt-2 text-xs text-muted-foreground">
                          Valgt: {controlImages.slice(0, 3).map((f) => f.name).join(", ")}
                        </div>
                      ) : null}
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
                                        {url ? (
                                          <a href={url} target="_blank" rel="noreferrer" className="block">
                                            <img src={url} alt="Bilde" className="h-20 w-full object-cover" />
                                          </a>
                                        ) : (
                                          <div className="flex h-20 items-center justify-center bg-muted/30 text-[10px] text-muted-foreground" title={p}>
                                            Mangler bilde
                                          </div>
                                        )}
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
