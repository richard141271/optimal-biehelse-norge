"use client"

import Link from "next/link"
import { type FormEvent, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const VIPPS_RECEIVER_ID = "52387"

function isMobileDevice() {
  if (typeof navigator === "undefined") return false
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

function buildVippsPayDeepLink(amountNok: number, message: string) {
  const amount = Number.isFinite(amountNok) ? Math.round(amountNok) : 0
  const msg = encodeURIComponent(String(message ?? "").trim())
  return `vipps://pay?recipient=${encodeURIComponent(VIPPS_RECEIVER_ID)}&amount=${encodeURIComponent(
    String(amount)
  )}&message=${msg}`
}

function safeCopyToClipboard(text: string) {
  const value = String(text ?? "")
  if (!value) return Promise.resolve(false)
  if (navigator?.clipboard?.writeText) {
    return navigator.clipboard
      .writeText(value)
      .then(() => true)
      .catch(() => false)
  }
  try {
    const el = document.createElement("textarea")
    el.value = value
    el.style.position = "fixed"
    el.style.left = "-9999px"
    el.style.top = "-9999px"
    document.body.appendChild(el)
    el.focus()
    el.select()
    const ok = document.execCommand("copy")
    document.body.removeChild(el)
    return Promise.resolve(Boolean(ok))
  } catch {
    return Promise.resolve(false)
  }
}

type Lotteri = {
  id: string
  tittel?: string | null
  beskrivelse?: string | null
  ticket_price?: number | null
  status?: string | null
  start_at?: string | null
  end_at?: string | null
  winner_loddnr?: number | null
  winner_phone?: string | null
  winner_drawn_at?: string | null
}

type Premie = {
  id: string
  tittel?: string | null
  sponsor_navn?: string | null
  sponsor_nettsted?: string | null
  verdi?: number | null
  image_url?: string | null
  is_hovedpremie?: boolean | null
}

type Winner = {
  winner_loddnr?: number | null
  created_at?: string | null
}

type State =
  | { type: "loading" }
  | { type: "error"; message: string }
  | { type: "ready"; lotteri: Lotteri | null; premier: Premie[]; solgt: number; winners: Winner[] }

type KjopState =
  | { type: "idle" }
  | { type: "creating" }
  | {
      type: "vipps"
      deeplink: string
      message: string
      amount: number
      vippsRef: string
      ticketFrom: number
      ticketTo: number
      successHref: string
      autoOpenFailed?: boolean
    }
  | { type: "error"; message: string }

type ApiLoddOk = {
  ok: true
  lotteri: Lotteri | null
  premier: Premie[]
  stats?: { solgt?: number }
  winners?: Winner[]
}

type ApiLoddErr = { ok?: false; feil?: string }

type ApiKjopOk = {
  ok: true
  orderId: string
  belop: number
  vippsRef: string
  ticketFrom: number
  ticketTo: number
}

type ApiKjopErr = { ok?: false; feil?: string }

function formatCountdown(endAt: string | null | undefined, nowMs: number) {
  if (!endAt) return null
  const d = new Date(endAt)
  if (Number.isNaN(d.getTime())) return null
  const ms = d.getTime() - nowMs
  if (ms <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 }
  const s = Math.floor(ms / 1000)
  const days = Math.floor(s / (24 * 3600))
  const hours = Math.floor((s % (24 * 3600)) / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const seconds = s % 60
  return { days, hours, minutes, seconds }
}

export default function LoddPage() {
  const [state, setState] = useState<State>({ type: "loading" })
  const [kjopState, setKjopState] = useState<KjopState>({ type: "idle" })
  const [telefon, setTelefon] = useState("")
  const [antallInput, setAntallInput] = useState("5")
  const [now, setNow] = useState(0)

  const hent = async () => {
    const res = await fetch(`/api/lodd?ts=${Date.now()}`, { cache: "no-store" })
    const data = (await res.json()) as ApiLoddOk | ApiLoddErr
    if (!res.ok || !data.ok) {
      setState({ type: "error", message: (data as ApiLoddErr).feil ?? "Kunne ikke hente loddsalg." })
      return
    }
    setState({
      type: "ready",
      lotteri: data.lotteri ?? null,
      premier: data.premier ?? [],
      solgt: Number((data as ApiLoddOk).stats?.solgt ?? 0),
      winners: (data as ApiLoddOk).winners ?? [],
    })
  }

  useEffect(() => {
    const id = setTimeout(() => {
      hent().catch(() => setState({ type: "error", message: "Kunne ikke hente loddsalg." }))
    }, 0)
    return () => clearTimeout(id)
  }, [])

  useEffect(() => {
    const immediate = setTimeout(() => setNow(Date.now()), 0)
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      clearTimeout(immediate)
      clearInterval(id)
    }
  }, [])

  const aktivtLotteri = state.type === "ready" ? state.lotteri : null
  const pris = Number(aktivtLotteri?.ticket_price ?? 20)
  const antall = useMemo(() => {
    const n = Math.floor(Number(String(antallInput ?? "").replace(",", ".").trim()))
    if (!Number.isFinite(n)) return 1
    return Math.max(1, Math.min(50, n))
  }, [antallInput])
  const belop = antall * (Number.isFinite(pris) && pris > 0 ? pris : 20)
  const countdown = formatCountdown(aktivtLotteri?.end_at ?? null, now)

  const hovedpremie = useMemo(() => {
    if (state.type !== "ready") return null
    return (state.premier ?? []).find((p) => p.is_hovedpremie) ?? state.premier[0] ?? null
  }, [state])

  const andrePremier = useMemo(() => {
    if (state.type !== "ready") return []
    const list = [...(state.premier ?? [])]
    const mainId = String(hovedpremie?.id ?? "")
    return list.filter((p) => String(p.id ?? "") !== mainId)
  }, [state, hovedpremie])

  async function kjop(e: FormEvent) {
    e.preventDefault()
    if (kjopState.type === "creating") return
    if (kjopState.type === "vipps") return
    setKjopState({ type: "creating" })
    try {
      const res = await fetch("/api/lodd/kjop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ antall, telefon }),
      })
      const data = (await res.json()) as ApiKjopOk | ApiKjopErr
      if (!res.ok || !data.ok) {
        setKjopState({ type: "error", message: (data as ApiKjopErr).feil ?? "Kunne ikke opprette kjøp." })
        return
      }
      const ok = data as ApiKjopOk
      const message = String(ok.vippsRef ?? "").trim()
      const amount = Number(ok.belop ?? 0)
      const successHref = `/lodd/suksess?from=${encodeURIComponent(
        String(ok.ticketFrom)
      )}&to=${encodeURIComponent(String(ok.ticketTo))}&ref=${encodeURIComponent(
        message
      )}&amount=${encodeURIComponent(String(amount))}`

      const deeplink = buildVippsPayDeepLink(amount, message)
      setKjopState({
        type: "vipps",
        deeplink,
        message,
        amount,
        vippsRef: message,
        ticketFrom: ok.ticketFrom,
        ticketTo: ok.ticketTo,
        successHref,
      })

      if (!isMobileDevice()) {
        setKjopState((prev) =>
          prev.type === "vipps" ? { ...prev, autoOpenFailed: true } : prev
        )
        return
      }

      let didHide = false
      const onVisibility = () => {
        if (document.visibilityState === "hidden") {
          didHide = true
          return
        }
        if (didHide && document.visibilityState === "visible") {
          document.removeEventListener("visibilitychange", onVisibility)
          window.location.href = successHref
        }
      }
      document.addEventListener("visibilitychange", onVisibility)

      window.location.href = deeplink

      window.setTimeout(() => {
        if (!didHide) {
          document.removeEventListener("visibilitychange", onVisibility)
          setKjopState((prev) =>
            prev.type === "vipps" ? { ...prev, autoOpenFailed: true } : prev
          )
        }
      }, 1200)
    } catch {
      setKjopState({ type: "error", message: "Noe gikk galt. Prøv igjen." })
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <div className="space-y-8">
          <header className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
              {aktivtLotteri ? "Aktivt lotteri" : "Ingen aktivt lotteri"}
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Vinn fantastiske premier – støtt pollinatorene!
            </h1>
            <p className="max-w-3xl text-muted-foreground">
              Kjøp lodd og vær med i trekningen. Alle inntekter går til pollinatorprosjekter, kjøp av utstyr og miljøtiltak.
            </p>
          </header>

          {state.type === "loading" ? (
            <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">Laster…</div>
          ) : null}
          {state.type === "error" ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">
              {state.message}
            </div>
          ) : null}

          {state.type === "ready" ? (
            aktivtLotteri ? (
              <section className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-xl border bg-card p-4">
                      <div className="text-xs text-muted-foreground">Pris</div>
                      <div className="mt-1 text-lg font-semibold">{pris} kr</div>
                      <div className="text-xs text-muted-foreground">per lodd</div>
                    </div>
                    <div className="rounded-xl border bg-card p-4">
                      <div className="text-xs text-muted-foreground">Salg</div>
                      <div className="mt-1 text-lg font-semibold">{countdown?.days ?? 0}</div>
                      <div className="text-xs text-muted-foreground">dager igjen</div>
                    </div>
                    <div className="rounded-xl border bg-card p-4">
                      <div className="text-xs text-muted-foreground">Solgt</div>
                      <div className="mt-1 text-lg font-semibold">{state.solgt}</div>
                      <div className="text-xs text-muted-foreground">lodd</div>
                    </div>
                  </div>

                  <div className="rounded-2xl border bg-card p-6">
                    <div className="text-sm font-medium">Kjøp lodd</div>
                    <form className="mt-4 space-y-4" onSubmit={kjop}>
                      <div className="space-y-2">
                        <Label htmlFor="telefon">Telefonnummer</Label>
                        <Input
                          id="telefon"
                          value={telefon}
                          onChange={(e) => setTelefon(e.target.value)}
                          placeholder="8 siffer"
                          inputMode="tel"
                          autoComplete="tel"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Antall lodd</Label>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setAntallInput(String(Math.max(1, antall - 1)))}
                          >
                            −
                          </Button>
                          <Input
                            aria-label="Antall lodd"
                            value={antallInput}
                            onChange={(e) => setAntallInput(e.target.value)}
                            inputMode="numeric"
                            className="w-20 text-center"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setAntallInput(String(Math.min(50, antall + 1)))}
                          >
                            +
                          </Button>
                          <div className="ml-2 text-sm text-muted-foreground">= {belop} kr</div>
                        </div>
                      </div>

                      <Button
                        type="submit"
                        disabled={kjopState.type === "creating" || kjopState.type === "vipps"}
                        className="w-full"
                      >
                        {kjopState.type === "creating" ? "Oppretter…" : "Kjøp lodd nå"}
                      </Button>

                      {kjopState.type === "error" ? (
                        <div className="text-sm text-destructive">{kjopState.message}</div>
                      ) : null}

                      {kjopState.type === "vipps" ? (
                        <div className="rounded-xl border bg-muted/30 p-4 text-sm">
                          <div className="font-medium">Åpner Vipps…</div>
                          <div className="mt-1 text-muted-foreground">
                            Vipps skal åpne direkte med ferdig utfylt beløp og melding.
                          </div>
                          <div className="mt-3 space-y-1 text-muted-foreground">
                            <div>
                              <span className="font-medium text-foreground">Dine lodd:</span>{" "}
                              {kjopState.ticketFrom}–{kjopState.ticketTo}
                            </div>
                            <div>
                              <span className="font-medium text-foreground">Beløp:</span> {kjopState.amount} kr
                            </div>
                            <div className="break-all">
                              <span className="font-medium text-foreground">Vippsmelding:</span> {kjopState.message}
                            </div>
                          </div>

                          {kjopState.autoOpenFailed ? (
                            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                              Vipps åpnet ikke automatisk. Bruk knappene under.
                            </div>
                          ) : null}

                          <div className="mt-3 flex flex-wrap gap-2">
                            <a
                              href={kjopState.deeplink}
                              className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
                            >
                              Åpne Vipps
                            </a>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={async () => {
                                await safeCopyToClipboard(kjopState.message)
                              }}
                            >
                              Kopier Vippsmelding
                            </Button>
                            <Link
                              href={kjopState.successHref}
                              className="inline-flex h-9 items-center justify-center rounded-lg border bg-background px-4 text-sm font-medium hover:bg-muted"
                            >
                              Jeg har betalt
                            </Link>
                          </div>
                        </div>
                      ) : null}
                    </form>
                  </div>

                  <div className="rounded-2xl border bg-card p-6">
                    <div className="text-sm font-medium">Trekning om</div>
                    {countdown ? (
                      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                        <div className="rounded-xl border bg-background p-3">
                          <div className="text-lg font-semibold">{countdown.days}</div>
                          <div className="text-xs text-muted-foreground">DAGER</div>
                        </div>
                        <div className="rounded-xl border bg-background p-3">
                          <div className="text-lg font-semibold">{String(countdown.hours).padStart(2, "0")}</div>
                          <div className="text-xs text-muted-foreground">TIMER</div>
                        </div>
                        <div className="rounded-xl border bg-background p-3">
                          <div className="text-lg font-semibold">{String(countdown.minutes).padStart(2, "0")}</div>
                          <div className="text-xs text-muted-foreground">MIN</div>
                        </div>
                        <div className="rounded-xl border bg-background p-3">
                          <div className="text-lg font-semibold">{String(countdown.seconds).padStart(2, "0")}</div>
                          <div className="text-xs text-muted-foreground">SEK</div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 text-sm text-muted-foreground">Trekningstid er ikke satt.</div>
                    )}
                    {state.type === "ready" && state.winners.length ? (
                      <div className="mt-3 rounded-xl border bg-muted/30 p-4 text-sm">
                        <div className="font-medium">Vinnere</div>
                        <div className="mt-2 space-y-1 text-muted-foreground">
                          {state.winners.map((w, idx) => (
                            <div key={`${w.winner_loddnr ?? "?"}-${idx}`}>
                              Vinnerlodd: #{w.winner_loddnr ?? "?"}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-3 rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
                      Premier kan hentes på kontoret vårt i Fredriksfrydveien 2, 1792 Tistedal. Ved avtale kan premie
                      legges ut og hentes i selvbetjening (åpent alle dager 06.00–23.00).
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="rounded-2xl border bg-card p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                        {hovedpremie?.is_hovedpremie ? "HOVEDPREMIE" : "PREMIE"}
                      </div>
                      {hovedpremie?.verdi ? (
                        <div className="rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">
                          Verdi {Number(hovedpremie.verdi)} kr
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-3 overflow-hidden rounded-xl border bg-muted/10">
                      {hovedpremie?.image_url ? (
                        <img
                          src={hovedpremie.image_url}
                          alt={hovedpremie.tittel ?? "Premie"}
                          className="h-[280px] w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
                          Bilde kommer
                        </div>
                      )}
                    </div>

                    <div className="mt-4 space-y-1">
                      <div className="text-lg font-semibold">{hovedpremie?.tittel ?? "Premie"}</div>
                      {hovedpremie?.sponsor_navn ? (
                        <div className="text-sm text-muted-foreground">
                          Sponset av{" "}
                          {hovedpremie.sponsor_nettsted ? (
                            <a
                              className="underline underline-offset-4 hover:text-foreground"
                              href={hovedpremie.sponsor_nettsted}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {hovedpremie.sponsor_navn}
                            </a>
                          ) : (
                            hovedpremie.sponsor_navn
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {andrePremier.length ? (
                    <div className="rounded-2xl border bg-card p-6">
                      <div className="text-sm font-medium">Andre premier i dette lotteriet</div>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        {andrePremier.slice(0, 8).map((p) => (
                          <div key={p.id} className="rounded-xl border bg-background p-3">
                            <div className="overflow-hidden rounded-lg border bg-muted/10">
                              {p.image_url ? (
                                <img src={p.image_url} alt={p.tittel ?? "Premie"} className="h-28 w-full object-cover" />
                              ) : (
                                <div className="flex h-28 items-center justify-center text-xs text-muted-foreground">
                                  Bilde kommer
                                </div>
                              )}
                            </div>
                            <div className="mt-2 text-sm font-medium">{p.tittel ?? "Premie"}</div>
                            {p.sponsor_navn ? (
                              <div className="mt-1 text-xs text-muted-foreground">{p.sponsor_navn}</div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : (
              <section className="rounded-2xl border bg-card p-6 sm:p-8">
                <h2 className="text-xl font-semibold tracking-tight">Ingen aktivt lotteri akkurat nå</h2>
                <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                  Vi åpner loddsalg når vi har premier klare. I mellomtiden kan du donere eller bidra med premie.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href="/min-side/sponset-premie"
                    className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
                  >
                    Doner premie (medlemmer)
                  </Link>
                  <Link
                    href="/vipps?type=donasjon"
                    className="inline-flex h-9 items-center justify-center rounded-lg border bg-background px-4 text-sm font-medium hover:bg-muted"
                  >
                    Doner penger
                  </Link>
                </div>
              </section>
            )
          ) : null}
      </div>
    </main>
  )
}
