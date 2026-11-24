"use client"

import { type FormEvent, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const VIPPS_NUMBER = "52387"

type Kalender = {
  id: string
  aar: number
  tittel: string
  beskrivelse: string | null
  pris: number
}

type Luke = {
  dag: number
  apnet: boolean
  premie_tittel: string | null
  sponsor_navn: string | null
  verdi: number | null
  vinner_loddnr: number | null
  vinner_telefon: string | null
}

type State =
  | { type: "loading" }
  | { type: "error"; message: string }
  | { type: "ready"; kalender: Kalender | null; luker: Luke[]; solgt: number }

type KjopState =
  | { type: "idle" }
  | { type: "creating" }
  | {
      type: "reserved"
      orderId: string
      belop: number
      vippsRef: string
      loddFra: number
      loddTil: number
      copied: boolean
    }
  | { type: "error"; message: string }

function normalizePhone(v: unknown) {
  const digits = String(v ?? "").replace(/\D+/g, "")
  if (!digits) return null
  if (digits.length < 8 || digits.length > 15) return "__invalid__"
  return digits
}

function maskPhone(phone: string) {
  const digits = String(phone ?? "")
  if (digits.length < 8) return digits
  return digits.slice(0, 3) + " " + digits.slice(3, 5) + " .. " + digits.slice(-2)
}

export default function JulekalenderPage() {
  const [state, setState] = useState<State>({ type: "loading" })
  const [kjopState, setKjopState] = useState<KjopState>({ type: "idle" })
  const [telefon, setTelefon] = useState("")
  const [antallInput, setAntallInput] = useState("1")
  const [apentLuke, setApentLuke] = useState<number | null>(null)

  const hent = async () => {
    const res = await fetch(`/api/julekalender?ts=${Date.now()}`, { cache: "no-store" })
    const data = await res.json()
    if (!res.ok || !data.ok) {
      setState({ type: "error", message: data.feil ?? "Kunne ikke hente julekalender." })
      return
    }
    setState({
      type: "ready",
      kalender: data.kalender ?? null,
      luker: data.luker ?? [],
      solgt: Number(data.solgt ?? 0),
    })
  }

  useEffect(() => {
    const id = setTimeout(() => {
      hent().catch(() => setState({ type: "error", message: "Kunne ikke hente julekalender." }))
    }, 0)
    return () => clearTimeout(id)
  }, [])

  const kalender = state.type === "ready" ? state.kalender : null
  const luker = state.type === "ready" ? state.luker : []
  const pris = Number(kalender?.pris ?? 50)
  const antall = useMemo(() => {
    const n = Math.floor(Number(String(antallInput ?? "").replace(",", ".").trim()))
    if (!Number.isFinite(n)) return 1
    return Math.max(1, Math.min(50, n))
  }, [antallInput])
  const belop = antall * (Number.isFinite(pris) && pris > 0 ? pris : 50)

  async function kjop(e: FormEvent) {
    e.preventDefault()
    if (kjopState.type === "creating") return

    const telefonDigits = normalizePhone(telefon)
    if (telefonDigits === "__invalid__") {
      setKjopState({ type: "error", message: "Ugyldig telefonnummer." })
      return
    }
    if (!telefonDigits) {
      setKjopState({ type: "error", message: "Skriv inn telefonnummer." })
      return
    }

    setKjopState({ type: "creating" })
    try {
      const res = await fetch("/api/julekalender/kjop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ antall, telefon: telefonDigits }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setKjopState({ type: "error", message: data.feil ?? "Kunne ikke opprette kjøp." })
        return
      }
      setKjopState({
        type: "reserved",
        orderId: String(data.orderId ?? ""),
        belop: Number(data.belop ?? 0),
        vippsRef: String(data.vippsRef ?? ""),
        loddFra: Number(data.loddFra ?? 0),
        loddTil: Number(data.loddTil ?? 0),
        copied: false,
      })
    } catch {
      setKjopState({ type: "error", message: "Noe gikk galt. Prøv igjen." })
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <div className="space-y-8">
        <header className="space-y-3 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
            🎄 Julekalender {kalender?.aar ?? new Date().getFullYear()}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            OBNO Julekalender
          </h1>
          <p className="mx-auto max-w-2xl text-muted-foreground sm:text-lg">
            Kjøp en julekalender og vær med i trekningen bak hver av de 24 lukene. Hver luke har en egen premie som
            trekker en vinner 1. desember. Alle inntekter går til pollinatorprosjekter.
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

        {state.type === "ready" && kalender ? (
          <>
            <section className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border bg-card p-4">
                <div className="text-xs text-muted-foreground">Pris per kalender</div>
                <div className="mt-1 text-lg font-semibold">{pris} kr</div>
                <div className="text-xs text-muted-foreground">gir deg lodd i alle 24 luker</div>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <div className="text-xs text-muted-foreground">Solgt</div>
                <div className="mt-1 text-lg font-semibold">{state.solgt}</div>
                <div className="text-xs text-muted-foreground">kalendere</div>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <div className="text-xs text-muted-foreground">Åpnede luker</div>
                <div className="mt-1 text-lg font-semibold">
                  {luker.filter((l) => l.apnet).length} / 24
                </div>
                <div className="text-xs text-muted-foreground">en ny luke åpnes hver dag</div>
              </div>
            </section>

            <section className="rounded-2xl border bg-card p-6">
              <div className="text-sm font-medium">Kjøp julekalender</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Legg inn telefonnummer, velg antall kalendere, trykk kjøp. Åpne Vipps, tast inn #{VIPPS_NUMBER} og betal
                summen. Vinnere trekkes og annonseres hver dag i desember.
              </p>
              <form className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto_auto_auto]" onSubmit={kjop}>
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
                  <Label>Antall</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setAntallInput(String(Math.max(1, antall - 1)))}
                    >
                      −
                    </Button>
                    <Input
                      aria-label="Antall kalendere"
                      value={antallInput}
                      onChange={(e) => setAntallInput(e.target.value)}
                      inputMode="numeric"
                      className="w-16 text-center"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setAntallInput(String(Math.min(50, antall + 1)))}
                    >
                      +
                    </Button>
                  </div>
                </div>
                <div className="flex items-end">
                  <div className="pb-2 text-sm text-muted-foreground">= {belop} kr</div>
                </div>
                <div className="flex items-end">
                  <Button type="submit" disabled={kjopState.type === "creating"}>
                    {kjopState.type === "creating" ? "Oppretter…" : "Kjøp kalender"}
                  </Button>
                </div>
              </form>

              <div className="mt-4 rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                <div>
                  Vippsnummer: <span className="font-medium text-foreground">#{VIPPS_NUMBER}</span>
                </div>
                <div className="mt-2 inline-flex rounded-xl border bg-background p-2">
                  <img
                    src="/QR-kode-52387.png"
                    alt={`Vipps QR-kode #${VIPPS_NUMBER}`}
                    className="h-auto w-[180px] sm:w-[220px]"
                  />
                </div>
              </div>

              {kjopState.type === "error" ? (
                <div className="mt-3 text-sm text-destructive">{kjopState.message}</div>
              ) : null}

              {kjopState.type === "reserved" ? (
                <div className="mt-4 rounded-xl border bg-muted/30 p-4 text-sm">
                  <div className="font-medium">Kalender reservert!</div>
                  <div className="mt-2 space-y-1 text-muted-foreground">
                    <div>
                      <span className="font-medium text-foreground">Dine lodd:</span>{" "}
                      {kjopState.loddFra}–{kjopState.loddTil}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Beløp:</span>{" "}
                      {Math.round(kjopState.belop)} kr
                    </div>
                    <div className="break-all">
                      <span className="font-medium text-foreground">Vippsmelding:</span>{" "}
                      {kjopState.vippsRef}
                    </div>
                  </div>
                  <div className="mt-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(kjopState.vippsRef)
                          setKjopState((prev) =>
                            prev.type === "reserved" ? { ...prev, copied: true } : prev
                          )
                          window.setTimeout(() => {
                            setKjopState((prev) =>
                              prev.type === "reserved" ? { ...prev, copied: false } : prev
                            )
                          }, 2000)
                        } catch {
                          setKjopState({ type: "error", message: "Kunne ikke kopiere." })
                        }
                      }}
                    >
                      {kjopState.copied ? "Kopiert" : "Kopier vippsmelding"}
                    </Button>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold">Kalenderen</h2>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
                {Array.from({ length: 24 }, (_, i) => i + 1).map((dag) => {
                  const luke = luker.find((l) => l.dag === dag)
                  const apnet = luke?.apnet ?? false
                  return (
                    <button
                      key={dag}
                      type="button"
                      onClick={() => setApentLuke(apnet ? dag : null)}
                      className={`group relative aspect-square overflow-hidden rounded-xl border text-left transition-all ${
                        apnet
                          ? "cursor-pointer border-green-500/40 bg-gradient-to-br from-green-500/10 to-green-700/10 hover:scale-[1.02]"
                          : "cursor-default border-amber-700/30 bg-gradient-to-br from-red-600 to-red-800 hover:from-red-700 hover:to-red-900"
                      }`}
                      disabled={!apnet}
                    >
                      <div
                        className={`absolute inset-0 flex items-center justify-center text-2xl font-bold ${
                          apnet ? "text-green-700 dark:text-green-300" : "text-white/90"
                        }`}
                      >
                        {dag}
                      </div>
                      {apnet && (
                        <div className="absolute inset-0 flex items-center justify-center text-2xl">
                          🎁
                        </div>
                      )}
                      {!apnet && (
                        <div className="absolute bottom-1 right-1 text-xs text-white/60">🔒</div>
                      )}
                    </button>
                  )
                })}
              </div>
              <p className="text-center text-xs text-muted-foreground">
                Klikk på en åpnet luke for å se premien og vinneren.
              </p>
            </section>

            {apentLuke !== null && (
              <section className="rounded-2xl border bg-card p-6">
                <LukeModal
                  luke={luker.find((l) => l.dag === apentLuke) ?? null}
                  onClose={() => setApentLuke(null)}
                />
              </section>
            )}
          </>
        ) : state.type === "ready" ? (
          <section className="rounded-2xl border bg-card p-6 text-center sm:p-8">
            <div className="text-4xl">🎄</div>
            <h2 className="mt-2 text-xl font-semibold">Ingen aktiv julekalender akkurat nå</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Vi åpner julekalenderen når desember nærmer seg. Følg med på{" "}
              <a href="/lodd" className="underline underline-offset-4">
                lotteriet
              </a>{" "}
              i mellomtiden!
            </p>
          </section>
        ) : null}
      </div>
    </main>
  )
}

function LukeModal({ luke, onClose }: { luke: Luke | null; onClose: () => void }) {
  if (!luke) return null
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Luke {luke.dag}</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Lukk
        </Button>
      </div>
      <div className="rounded-xl border bg-muted/20 p-4">
        {luke.premie_tittel ? (
          <div className="space-y-2">
            <div className="text-xl font-semibold">{luke.premie_tittel}</div>
            {luke.sponsor_navn && (
              <div className="text-sm text-muted-foreground">Sponset av {luke.sponsor_navn}</div>
            )}
            {luke.verdi ? (
              <div className="text-sm text-muted-foreground">Verdi: {luke.verdi} kr</div>
            ) : null}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Premie kommer snart.</div>
        )}
      </div>
      {luke.vinner_loddnr ? (
        <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4">
          <div className="text-sm font-medium text-green-700 dark:text-green-300">
            🎉 Vinnerlodd: #{luke.vinner_loddnr}
          </div>
          {luke.vinner_telefon && (
            <div className="mt-1 text-xs text-muted-foreground">
              Telefon: {maskPhone(luke.vinner_telefon)}
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">Vinner trekkes snart.</div>
      )}
    </div>
  )
}
