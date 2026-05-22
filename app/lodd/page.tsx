"use client"

import Image from "next/image"
import Link from "next/link"
import { type FormEvent, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

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
  winner_phone?: string | null
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
      type: "created"
      orderId: string
      vippsRef: string
      belop: number
      ticketFrom: number
      ticketTo: number
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
  const [antall, setAntall] = useState(5)
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
      setKjopState({
        type: "created",
        orderId: String((data as ApiKjopOk).orderId ?? ""),
        vippsRef: String((data as ApiKjopOk).vippsRef ?? ""),
        belop: Number((data as ApiKjopOk).belop ?? 0),
        ticketFrom: Number((data as ApiKjopOk).ticketFrom ?? 0),
        ticketTo: Number((data as ApiKjopOk).ticketTo ?? 0),
      })
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
                            onClick={() => setAntall((v) => Math.max(1, v - 1))}
                          >
                            −
                          </Button>
                          <div className="min-w-[64px] rounded-lg border bg-background px-3 py-2 text-center text-sm">
                            {antall}
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setAntall((v) => Math.min(50, v + 1))}
                          >
                            +
                          </Button>
                          <div className="ml-2 text-sm text-muted-foreground">= {belop} kr</div>
                        </div>
                      </div>

                      <Button type="submit" disabled={kjopState.type === "creating"} className="w-full">
                        {kjopState.type === "creating" ? "Oppretter…" : "Kjøp lodd nå"}
                      </Button>

                      {kjopState.type === "error" ? (
                        <div className="text-sm text-destructive">{kjopState.message}</div>
                      ) : null}

                      {kjopState.type === "created" ? (
                        <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
                          <div className="font-medium text-foreground">Reservert!</div>
                          <div className="mt-1">
                            Dine lodd får nummer: {kjopState.ticketFrom} – {kjopState.ticketTo}
                          </div>
                          <div className="mt-2">
                            Vipps-melding: <span className="font-medium text-foreground">{kjopState.vippsRef}</span>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-3">
                            <div className="inline-flex rounded-xl border bg-background p-3">
                              <Image
                                src="/qr.png"
                                alt="Vipps QR-kode"
                                width={180}
                                height={180}
                                className="h-auto w-[160px]"
                              />
                            </div>
                            <div className="space-y-2">
                              <div>
                                Vipps til <span className="font-medium text-foreground">#52387</span>
                              </div>
                              <div>Beløp: {kjopState.belop} kr</div>
                              <Link
                                className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
                                href={`/vipps?type=lodd&belop=${encodeURIComponent(
                                  String(kjopState.belop)
                                )}&ref=${encodeURIComponent(kjopState.vippsRef)}`}
                              >
                                Åpne Vipps-side
                              </Link>
                            </div>
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
                              #{w.winner_loddnr ?? "?"} · Telefon: {w.winner_phone ?? "?"}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
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
