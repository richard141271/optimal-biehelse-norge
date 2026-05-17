"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"

type Ticket = {
  ticketNumber: number
  prizeName: string | null
  isWinner: boolean
  claimed: boolean
}

type LoadState =
  | { type: "loading" }
  | { type: "error"; message: string }
  | { type: "ready"; ticket: Ticket }

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export default function SkrapeloddTicketPage({ params }: { params: { ref: string } }) {
  const ref = useMemo(() => String(params.ref ?? "").trim(), [params.ref])
  const [load, setLoad] = useState<LoadState>({ type: "loading" })
  const [revealed, setRevealed] = useState(false)
  const [progress, setProgress] = useState(0)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const drawingRef = useRef(false)

  useEffect(() => {
    let active = true
    async function run() {
      if (!ref) {
        setLoad({ type: "error", message: "Ugyldig referanse." })
        return
      }
      setLoad({ type: "loading" })

      const startedAt = Date.now()
      let attempt = 0

      while (active) {
        attempt += 1
        try {
          const res = await fetch(`/api/skrapelodd/${encodeURIComponent(ref)}?ts=${Date.now()}`, {
            cache: "no-store",
          })
          const data = (await res.json()) as {
            ok?: boolean
            feil?: string
            pending?: boolean
            ticket?: Ticket
          }

          if (data.ok && data.ticket) {
            setLoad({ type: "ready", ticket: data.ticket })
            return
          }

          if (!res.ok && data.feil) {
            setLoad({ type: "error", message: data.feil })
            return
          }

          const elapsed = Date.now() - startedAt
          if (elapsed > 60_000) {
            setLoad({
              type: "error",
              message:
                "Vi fikk ikke bekreftet betalingen enda. Hvis du har betalt i Vipps, prøv å oppdatere siden om litt.",
            })
            return
          }

          const wait = Math.min(2500, 400 + attempt * 150)
          await sleep(wait)
        } catch {
          setLoad({ type: "error", message: "Kunne ikke hente skrapelodd." })
          return
        }
      }
    }
    run()
    return () => {
      active = false
    }
  }, [ref])

  useEffect(() => {
    if (load.type !== "ready") return

    function paintMask() {
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container) return
      const rect = container.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const w = Math.max(1, Math.round(rect.width))
      const h = Math.max(1, Math.round(rect.height))

      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`

      const ctx = canvas.getContext("2d")
      if (!ctx) return

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const grad = ctx.createLinearGradient(0, 0, w, h)
      grad.addColorStop(0, "rgba(180, 140, 40, 0.98)")
      grad.addColorStop(0.45, "rgba(255, 215, 110, 0.98)")
      grad.addColorStop(1, "rgba(60, 50, 25, 0.98)")

      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)

      ctx.globalAlpha = 0.15
      ctx.fillStyle = "#000"
      for (let x = 0; x < w; x += 18) {
        for (let y = 0; y < h; y += 18) {
          ctx.fillRect(x, y, 1, 1)
        }
      }
      ctx.globalAlpha = 1

      ctx.fillStyle = "rgba(255,255,255,0.92)"
      ctx.font = "600 14px ui-sans-serif, system-ui, -apple-system"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText("SKRAP HER", w / 2, h / 2)

      setRevealed(false)
      setProgress(0)
    }

    paintMask()
    const ro = new ResizeObserver(() => paintMask())
    const container = containerRef.current
    if (container) ro.observe(container)
    return () => ro.disconnect()
  }, [load.type])

  function eraseAt(clientX: number, clientY: number) {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top

    ctx.globalCompositeOperation = "destination-out"
    ctx.beginPath()
    ctx.arc(x, y, 22, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = "source-over"

    const sampleStep = 8
    const w = Math.max(1, Math.round(rect.width))
    const h = Math.max(1, Math.round(rect.height))
    const img = ctx.getImageData(0, 0, w, h).data

    let total = 0
    let cleared = 0
    for (let yy = 0; yy < h; yy += sampleStep) {
      for (let xx = 0; xx < w; xx += sampleStep) {
        const idx = (yy * w + xx) * 4 + 3
        total += 1
        if (img[idx] < 30) cleared += 1
      }
    }
    const pct = total > 0 ? (cleared / total) * 100 : 0
    const rounded = clamp(Math.round(pct), 0, 100)
    setProgress(rounded)
    if (rounded >= 45) setRevealed(true)
  }

  function onPointerDown(e: React.PointerEvent) {
    if (revealed) return
    drawingRef.current = true
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    eraseAt(e.clientX, e.clientY)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (revealed) return
    if (!drawingRef.current) return
    eraseAt(e.clientX, e.clientY)
  }

  function onPointerUp(e: React.PointerEvent) {
    drawingRef.current = false
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <div className="space-y-6">
        <header className="space-y-2">
          <div className="text-sm text-muted-foreground">
            <Link href="/skrapelodd" className="hover:text-foreground">
              Tilbake til skrapelodd
            </Link>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Skrapelodd</h1>
          <p className="text-muted-foreground">
            {load.type === "ready"
              ? `Lodd #${load.ticket.ticketNumber}`
              : "Laster loddet ditt…"}
          </p>
        </header>

        {load.type === "error" ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
            {load.message}
          </div>
        ) : null}

        {load.type === "loading" ? (
          <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
            Henter skrapelodd…
          </div>
        ) : null}

        {load.type === "ready" ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="rounded-3xl border bg-card p-5 sm:p-7">
              <div className="relative">
                <div
                  ref={containerRef}
                  className="relative overflow-hidden rounded-2xl border bg-gradient-to-b from-[color:oklch(0.97_0.03_88)] via-background to-background p-8"
                >
                  <div className="space-y-4">
                    <div className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">
                      OBNO · digitale skrapelodd
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-semibold tracking-tight sm:text-3xl">
                        {load.ticket.isWinner ? "🎉 GRATULERER!" : "Takk for støtten 💛"}
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground">
                        {load.ticket.isWinner
                          ? `Du vant ${load.ticket.prizeName ?? "en premie"}!`
                          : "Du hjelper biene og naturen."}
                      </div>
                    </div>
                    <div className="rounded-xl border bg-background p-4 text-sm">
                      {load.ticket.isWinner ? (
                        <div className="space-y-1">
                          <div className="font-medium">Premie</div>
                          <div className="text-muted-foreground">
                            {load.ticket.prizeName ?? "Premie"}
                          </div>
                          {load.ticket.claimed ? (
                            <div className="mt-2 text-xs text-muted-foreground">
                              Markert som hentet i admin.
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="font-medium">Takk!</div>
                          <div className="text-muted-foreground">
                            Bidraget ditt går til arbeid for bier og pollinatorer.
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <canvas
                    ref={canvasRef}
                    className={revealed ? "pointer-events-none absolute inset-0 opacity-0" : "absolute inset-0"}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                  />
                </div>

                {!revealed ? (
                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <div>Skrap for å avsløre</div>
                    <div>{progress}%</div>
                  </div>
                ) : (
                  <div className="mt-3 text-xs text-muted-foreground">Resultat avslørt.</div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border bg-card p-5">
                <div className="text-sm font-medium">Neste steg</div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {load.ticket.isWinner
                    ? "Vi kontakter deg om henting, eller du kan sende oss en e-post."
                    : "Vil du støtte mer? Kjøp gjerne et nytt lodd."}
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-sm">
                  <Link
                    href="mailto:post@obno.no"
                    className="underline underline-offset-4 hover:text-foreground"
                  >
                    post@obno.no
                  </Link>
                  <Link href="/skrapelodd" className="underline underline-offset-4 hover:text-foreground">
                    Kjøp nytt lodd
                  </Link>
                </div>
              </div>

              <div className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">
                Ingen pengepremier. Alle premier er sponsede fysiske premier.
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  )
}
