"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"

type Ticket = {
  id: string
  revealed: boolean
  isWinner?: boolean
  prizeName?: string | null
  claimed?: boolean
}

type LoadState =
  | { type: "loading" }
  | { type: "error"; message: string }
  | { type: "ready"; ticket: Ticket }

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

export default function SkrapeloddNyTicketPage({ params }: { params: { id: string } }) {
  const id = useMemo(() => String(params.id ?? "").trim(), [params.id])
  const [load, setLoad] = useState<LoadState>({ type: "loading" })
  const [revealed, setRevealed] = useState(false)
  const [progress, setProgress] = useState(0)
  const [revealing, setRevealing] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const drawingRef = useRef(false)
  const revealTriggeredRef = useRef(false)

  useEffect(() => {
    let active = true
    async function run() {
      if (!id || !isUuid(id)) {
        setLoad({ type: "error", message: "Ugyldig skrapelodd." })
        return
      }
      setLoad({ type: "loading" })
      try {
        const res = await fetch(`/api/skrapelodd-ny/ticket/${encodeURIComponent(id)}?ts=${Date.now()}`, {
          cache: "no-store",
        })
        const data = (await res.json()) as { ok?: boolean; feil?: string; ticket?: Ticket }
        if (!active) return
        if (!res.ok || !data.ok || !data.ticket) {
          setLoad({ type: "error", message: data.feil ?? "Kunne ikke hente skrapelodd." })
          return
        }
        setLoad({ type: "ready", ticket: data.ticket })
        setRevealed(Boolean(data.ticket.revealed))
      } catch {
        if (!active) return
        setLoad({ type: "error", message: "Kunne ikke hente skrapelodd." })
      }
    }
    run()
    return () => {
      active = false
    }
  }, [id])

  const revealServer = useCallback(async () => {
    if (revealTriggeredRef.current) return
    revealTriggeredRef.current = true
    setRevealing(true)
    try {
      const res = await fetch(`/api/skrapelodd-ny/ticket/${encodeURIComponent(id)}/reveal`, {
        method: "POST",
        cache: "no-store",
      })
      const data = (await res.json()) as { ok?: boolean; feil?: string; ticket?: Ticket }
      if (!res.ok || !data.ok || !data.ticket) {
        setLoad({ type: "error", message: data.feil ?? "Kunne ikke avsløre skrapelodd." })
        return
      }
      setLoad({ type: "ready", ticket: data.ticket })
      setRevealed(true)
    } catch {
      setLoad({ type: "error", message: "Kunne ikke avsløre skrapelodd." })
    } finally {
      setRevealing(false)
    }
  }, [id])

  useEffect(() => {
    if (load.type !== "ready") return
    if (load.ticket.revealed) return
    function resize() {
      const canvasEl = canvasRef.current
      const containerEl = containerRef.current
      if (!canvasEl || !containerEl) return
      const ctx = canvasEl.getContext("2d")
      if (!ctx) return

      const rect = containerEl.getBoundingClientRect()
      const w = Math.max(280, Math.floor(rect.width))
      const h = Math.max(280, Math.floor(rect.width * 0.75))
      canvasEl.width = w * devicePixelRatio
      canvasEl.height = h * devicePixelRatio
      canvasEl.style.width = `${w}px`
      canvasEl.style.height = `${h}px`
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
      ctx.globalCompositeOperation = "source-over"
      ctx.fillStyle = "#c9c9c9"
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = "#8a8a8a"
      ctx.font = "600 20px system-ui, -apple-system, Segoe UI, Roboto, Arial"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText("SKRAP HER", Math.floor(w / 2), Math.floor(h / 2))
      setProgress(0)
      setRevealed(false)
      revealTriggeredRef.current = false
    }

    resize()
    const ro = new ResizeObserver(() => resize())
    const containerEl = containerRef.current
    if (containerEl) ro.observe(containerEl)
    return () => ro.disconnect()
  }, [load])

  useEffect(() => {
    function getPoint(e: PointerEvent) {
      const canvasEl = canvasRef.current
      if (!canvasEl) return null
      const rect = canvasEl.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * (canvasEl.width / devicePixelRatio)
      const y = ((e.clientY - rect.top) / rect.height) * (canvasEl.height / devicePixelRatio)
      return { x, y }
    }

    function scratchAt(x: number, y: number) {
      const canvasEl = canvasRef.current
      if (!canvasEl) return
      const ctx = canvasEl.getContext("2d")
      if (!ctx) return
      ctx.save()
      ctx.globalCompositeOperation = "destination-out"
      ctx.beginPath()
      ctx.arc(x, y, 22, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    let raf = 0
    function measureProgress() {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const canvasEl = canvasRef.current
        if (!canvasEl) return
        const ctx = canvasEl.getContext("2d")
        if (!ctx) return
        const w = Math.floor(canvasEl.width / devicePixelRatio)
        const h = Math.floor(canvasEl.height / devicePixelRatio)
        const img = ctx.getImageData(0, 0, w, h)
        let cleared = 0
        for (let i = 3; i < img.data.length; i += 4) {
          if (img.data[i] === 0) cleared += 1
        }
        const total = w * h
        const p = total ? cleared / total : 0
        const pct = clamp(Math.round(p * 100), 0, 100)
        setProgress(pct)
        if (pct >= 45) {
          setRevealed(true)
        }
      })
    }

    function onDown(e: PointerEvent) {
      if (load.type !== "ready") return
      if (load.ticket.revealed) return
      drawingRef.current = true
      const canvasEl = canvasRef.current
      if (!canvasEl) return
      canvasEl.setPointerCapture(e.pointerId)
      const p = getPoint(e)
      if (!p) return
      const { x, y } = p
      scratchAt(x, y)
      measureProgress()
    }

    function onMove(e: PointerEvent) {
      if (!drawingRef.current) return
      if (load.type !== "ready") return
      if (load.ticket.revealed) return
      const p = getPoint(e)
      if (!p) return
      const { x, y } = p
      scratchAt(x, y)
      measureProgress()
    }

    function onUp() {
      drawingRef.current = false
    }

    const canvasEl = canvasRef.current
    if (!canvasEl) return
    canvasEl.addEventListener("pointerdown", onDown)
    canvasEl.addEventListener("pointermove", onMove)
    canvasEl.addEventListener("pointerup", onUp)
    canvasEl.addEventListener("pointercancel", onUp)
    canvasEl.addEventListener("pointerleave", onUp)

    return () => {
      canvasEl.removeEventListener("pointerdown", onDown)
      canvasEl.removeEventListener("pointermove", onMove)
      canvasEl.removeEventListener("pointerup", onUp)
      canvasEl.removeEventListener("pointercancel", onUp)
      canvasEl.removeEventListener("pointerleave", onUp)
      cancelAnimationFrame(raf)
    }
  }, [load])

  useEffect(() => {
    if (load.type !== "ready") return
    if (load.ticket.revealed) return
    if (!revealed) return
    revealServer()
  }, [load, revealed, revealServer])

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      <div className="space-y-2">
        <div className="text-sm text-muted-foreground">
          <Link href="/skrapelodd-ny" className="underline underline-offset-4">
            Tilbake
          </Link>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Skrapelodd (ny)</h1>
        <p className="text-muted-foreground">{load.type === "loading" ? "Laster loddet ditt…" : ""}</p>
      </div>

      {load.type === "error" ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {load.message}
        </div>
      ) : null}

      {load.type === "ready" ? (
        <div className="space-y-4">
          <div className="rounded-2xl border bg-card p-6">
            <div className="text-sm text-muted-foreground">Skrap frem resultatet</div>
            <div className="mt-3">
              <div ref={containerRef} className="relative w-full overflow-hidden rounded-xl border bg-background">
                <div className="flex h-full w-full items-center justify-center px-6 py-16 text-center">
                  {load.ticket.revealed ? (
                    <div className="space-y-2">
                      <div className="text-2xl font-semibold tracking-tight">
                        {load.ticket.isWinner ? "GRATULERER!" : "Takk for støtten"}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {load.ticket.isWinner
                          ? `Du vant ${load.ticket.prizeName ?? "en premie"}!`
                          : "Du hjelper biene og naturen."}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="text-xl font-semibold tracking-tight">Skrap her</div>
                      <div className="text-sm text-muted-foreground">
                        {revealing ? "Avslører…" : `Skrapet: ${progress}%`}
                      </div>
                    </div>
                  )}
                </div>

                {!load.ticket.revealed ? (
                  <canvas ref={canvasRef} className="absolute inset-0 touch-none" />
                ) : null}
              </div>
            </div>
          </div>

          {load.ticket.revealed ? (
            <Link href="/skrapelodd-ny" className="inline-flex underline underline-offset-4">
              Hent nytt skrapelodd
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
