"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type FileRow = {
  path: string
  name: string
  created_at?: string | null
  updated_at?: string | null
  last_accessed_at?: string | null
  size?: number | null
  mimetype?: string | null
}

type LoadState =
  | { type: "loading" }
  | { type: "error"; message: string }
  | { type: "ready"; files: FileRow[]; hasMore: boolean; offset: number }

function formatBytes(bytes?: number | null) {
  const b = Number(bytes ?? 0)
  if (!Number.isFinite(b) || b <= 0) return "—"
  const units = ["B", "KB", "MB", "GB"]
  let v = b
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  const digits = i === 0 ? 0 : i === 1 ? 0 : 1
  return `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: digits }).format(v)} ${units[i]}`
}

function formatWhen(iso?: string | null) {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString("nb-NO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function normalize(v: string) {
  return v
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
}

function isImage(mime?: string | null) {
  const m = String(mime ?? "")
  return m.startsWith("image/")
}

function isVideo(mime?: string | null) {
  const m = String(mime ?? "")
  return m.startsWith("video/")
}

export default function MediaBibliotekPage() {
  const [state, setState] = useState<LoadState>({ type: "loading" })
  const stateRef = useRef<LoadState>(state)
  const [msg, setMsg] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadCount, setUploadCount] = useState(0)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [q, setQ] = useState("")
  const [typeFilter, setTypeFilter] = useState<"alle" | "bilder" | "video">("alle")
  const [sort, setSort] = useState<"newest" | "oldest" | "name" | "size">("newest")
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  const load = useCallback(async (opts?: { append?: boolean }) => {
    setMsg(null)
    setState((prev) => {
      if (prev.type === "ready" && opts?.append) return prev
      return { type: "loading" }
    })
    try {
      const current = stateRef.current
      const prev = current.type === "ready" && opts?.append ? current : null
      const nextOffset = prev ? prev.offset : 0
      const res = await fetch(`/api/admin/media-bibliotek?action=list&limit=200&offset=${nextOffset}`, { cache: "no-store" })
      const data = (await res.json()) as { ok?: boolean; feil?: string; files?: FileRow[] }
      if (!res.ok || !data.ok) {
        setState({ type: "error", message: data.feil ?? "Kunne ikke hente filer." })
        return
      }
      const incoming = (data.files ?? []).filter((f) => Boolean(String(f.path ?? "").trim()))
      const merged = prev ? [...prev.files, ...incoming] : incoming
      const hasMore = incoming.length >= 200
      setState({ type: "ready", files: merged, hasMore, offset: merged.length })
    } catch {
      setState({ type: "error", message: "Kunne ikke hente filer." })
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      load().catch(() => setState({ type: "error", message: "Kunne ikke hente filer." }))
    }, 0)
    return () => clearTimeout(t)
  }, [load])

  const filteredSorted = useMemo(() => {
    if (state.type !== "ready") return []
    const qq = normalize(q.trim())
    const out = state.files.filter((f) => {
      if (typeFilter === "bilder" && !isImage(f.mimetype ?? null)) return false
      if (typeFilter === "video" && !isVideo(f.mimetype ?? null)) return false
      if (!qq) return true
      return normalize(String(f.name ?? "")).includes(qq)
    })
    out.sort((a, b) => {
      if (sort === "name") return String(a.name ?? "").localeCompare(String(b.name ?? ""), "no", { sensitivity: "base" })
      if (sort === "size") return (Number(b.size ?? 0) - Number(a.size ?? 0)) || String(a.name ?? "").localeCompare(String(b.name ?? ""), "no")
      if (sort === "oldest") return String(a.created_at ?? a.updated_at ?? "").localeCompare(String(b.created_at ?? b.updated_at ?? ""), "no")
      return String(b.created_at ?? b.updated_at ?? "").localeCompare(String(a.created_at ?? a.updated_at ?? ""), "no")
    })
    return out
  }, [q, sort, state, typeFilter])

  const pickFiles = useCallback((files: FileList | null) => {
    if (!files) return
    const arr = Array.from(files).filter((f) => f.size > 0)
    setSelectedFiles(arr)
    setUploadCount(0)
  }, [])

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    pickFiles(e.dataTransfer.files)
  }, [pickFiles])

  const onUpload = useCallback(async () => {
    if (!selectedFiles.length) {
      setMsg("Velg filer først.")
      return
    }
    setUploading(true)
    setUploadCount(0)
    setMsg(null)
    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const f = selectedFiles[i]
        const fd = new FormData()
        fd.append("files", f)
        const res = await fetch("/api/admin/media-bibliotek", { method: "POST", body: fd })
        const data = (await res.json()) as { ok?: boolean; feil?: string }
        if (!res.ok || !data.ok) {
          setMsg(data.feil ? `${f.name}: ${data.feil}` : `${f.name}: Kunne ikke laste opp.`)
          return
        }
        setUploadCount(i + 1)
      }
      setSelectedFiles([])
      if (fileInputRef.current) fileInputRef.current.value = ""
      setMsg("✅ Lastet opp.")
      await load()
      setTimeout(() => setMsg(null), 1400)
    } finally {
      setUploading(false)
    }
  }, [load, selectedFiles])

  const getSignedUrl = useCallback(async (path: string) => {
    const res = await fetch(`/api/admin/media-bibliotek?action=signed&path=${encodeURIComponent(path)}`, { cache: "no-store" })
    const data = (await res.json()) as { ok?: boolean; feil?: string; signedUrl?: string }
    if (!res.ok || !data.ok || !data.signedUrl) return { ok: false as const, feil: data.feil ?? "Kunne ikke lage lenke." }
    return { ok: true as const, url: data.signedUrl }
  }, [])

  const openFile = useCallback(async (path: string) => {
    setMsg(null)
    const signed = await getSignedUrl(path)
    if (!signed.ok) {
      setMsg(signed.feil)
      return
    }
    const w = window.open(signed.url, "_blank", "noopener,noreferrer")
    if (!w) window.location.href = signed.url
  }, [getSignedUrl])

  const downloadFile = useCallback(async (path: string) => {
    setMsg(null)
    const signed = await getSignedUrl(path)
    if (!signed.ok) {
      setMsg(signed.feil)
      return
    }
    const a = document.createElement("a")
    a.href = signed.url
    a.download = path.split("/").pop() || "fil"
    document.body.appendChild(a)
    a.click()
    a.remove()
  }, [getSignedUrl])

  const copyLink = useCallback(async (path: string) => {
    setMsg(null)
    const signed = await getSignedUrl(path)
    if (!signed.ok) {
      setMsg(signed.feil)
      return
    }
    try {
      await navigator.clipboard.writeText(signed.url)
      setMsg("✅ Lenke kopiert (gyldig i 15 min).")
      setTimeout(() => setMsg(null), 1400)
    } catch {
      setMsg("Kunne ikke kopiere.")
    }
  }, [getSignedUrl])

  const deleteFile = useCallback(
    async (path: string) => {
      if (!confirm("Slette filen?")) return
      setMsg(null)
      const res = await fetch(`/api/admin/media-bibliotek?path=${encodeURIComponent(path)}`, { method: "DELETE" })
      const data = (await res.json()) as { ok?: boolean; feil?: string }
      if (!res.ok || !data.ok) {
        setMsg(data.feil ?? "Kunne ikke slette.")
        return
      }
      setMsg("✅ Slettet.")
      await load()
      setTimeout(() => setMsg(null), 1400)
    },
    [load]
  )

  const loadAll = useCallback(async () => {
    setMsg(null)
    for (let i = 0; i < 50; i++) {
      const s = stateRef.current.type === "ready" ? stateRef.current : null
      if (!s?.hasMore) break
      await load({ append: true })
    }
  }, [load])

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Felles bildebibliotek</h1>
        <p className="text-muted-foreground">Last opp og hent ut bilder og videoer (for nettside og SOME).</p>
      </header>

      {msg ? <div className="rounded-xl border bg-card p-4 text-sm">{msg}</div> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border bg-card p-6">
          <div className="text-lg font-semibold">Last opp</div>
          <div className="mt-3 grid gap-4">
            <div
              className="rounded-xl border border-dashed bg-background p-4 text-center text-sm text-muted-foreground sm:p-6"
              onDragOver={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
              onDrop={onDrop}
            >
              <div className="break-words">Dra og slipp bilder/video her</div>
              <input ref={fileInputRef} id="media_files" type="file" accept="image/*,video/*" multiple onChange={(e) => pickFiles(e.target.files)} className="sr-only" />
              <div className="mt-3 flex flex-col items-center justify-center gap-2 sm:flex-row">
                <label htmlFor="media_files" className={`${buttonVariants({ variant: "outline" })} w-full sm:w-auto`}>
                  Velg filer
                </label>
                <Button onClick={onUpload} disabled={uploading || !selectedFiles.length} className="w-full sm:w-auto">
                  {uploading ? `Laster opp ${uploadCount}/${selectedFiles.length}` : `Last opp (${selectedFiles.length})`}
                </Button>
              </div>
              {selectedFiles.length ? (
                <div className="mt-3 w-full text-left text-xs text-muted-foreground">
                  {selectedFiles.slice(0, 6).map((f) => (
                    <div key={`${f.name}-${f.size}`} className="flex items-center justify-between gap-2">
                      <div className="min-w-0 truncate">{f.name}</div>
                      <div className="shrink-0">{formatBytes(f.size)}</div>
                    </div>
                  ))}
                  {selectedFiles.length > 6 ? <div>+ {selectedFiles.length - 6} til…</div> : null}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold">Bibliotek</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {state.type === "ready" ? `${filteredSorted.length} vist · ${state.files.length} lastet` : "—"}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => load()} disabled={state.type === "loading" || uploading}>
                Oppdater
              </Button>
              {state.type === "ready" && state.hasMore ? (
                <>
                  <Button variant="outline" onClick={() => load({ append: true })} disabled={uploading}>
                    Last inn flere
                  </Button>
                  <Button variant="outline" onClick={loadAll} disabled={uploading}>
                    Last inn alle
                  </Button>
                </>
              ) : null}
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label>Søk</Label>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søk i filnavn" className="mt-2" />
            </div>
            <div>
              <Label>Type</Label>
              <select className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value === "video" ? "video" : e.target.value === "bilder" ? "bilder" : "alle")}>
                <option value="alle">Alle</option>
                <option value="bilder">Bilder</option>
                <option value="video">Video</option>
              </select>
            </div>
          </div>

          <div className="mt-3">
            <Label>Sorter</Label>
            <select className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm" value={sort} onChange={(e) => setSort(e.target.value === "name" ? "name" : e.target.value === "size" ? "size" : e.target.value === "oldest" ? "oldest" : "newest")}>
              <option value="newest">Nyeste først</option>
              <option value="oldest">Eldste først</option>
              <option value="name">Filnavn (A–Å)</option>
              <option value="size">Størrelse (stor→liten)</option>
            </select>
          </div>

          <div className="mt-4">
            {state.type === "loading" ? (
              <div className="rounded-xl border bg-background p-4 text-sm text-muted-foreground">Laster…</div>
            ) : null}
            {state.type === "error" ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{state.message}</div>
            ) : null}
            {state.type === "ready" ? (
              filteredSorted.length ? (
                <div className="max-h-[70vh] overflow-auto rounded-xl border bg-background">
                  <div className="grid gap-2 p-3">
                    {filteredSorted.map((f) => {
                      const mime = String(f.mimetype ?? "")
                      const label = isImage(mime) ? "Bilde" : isVideo(mime) ? "Video" : "Fil"
                      return (
                        <div key={f.path} className="rounded-lg border bg-card p-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">{f.name}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {label} · {formatBytes(f.size)} · {formatWhen(f.created_at ?? f.updated_at ?? null)}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button variant="outline" onClick={() => openFile(f.path)} disabled={uploading}>
                                Åpne
                              </Button>
                              <Button variant="outline" onClick={() => downloadFile(f.path)} disabled={uploading}>
                                Last ned
                              </Button>
                              <Button variant="outline" onClick={() => copyLink(f.path)} disabled={uploading}>
                                Kopier lenke
                              </Button>
                              <Button variant="destructive" onClick={() => deleteFile(f.path)} disabled={uploading}>
                                Slett
                              </Button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border bg-background p-4 text-sm text-muted-foreground">Ingen filer.</div>
              )
            ) : null}
          </div>
        </section>
      </div>
    </div>
  )
}
