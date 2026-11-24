"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type Kalender = {
  id: string
  aar: number
  tittel: string
  beskrivelse: string | null
  pris: number
  status: string
  start_at: string | null
  end_at: string | null
}

type Luke = {
  id: string
  kalender_id: string
  dag: number
  premie_id: string | null
  premie_tekst: string | null
  apnet_at: string | null
  vinner_loddnr: number | null
  vinner_telefon: string | null
}

type Kjop = {
  id: string
  telefon: string
  antall: number
  belop: number
  status: string
  lodd_fra: number | null
  lodd_til: number | null
  paid_at: string | null
}

type Premie = {
  id: string
  tittel: string
  sponsor_navn: string | null
  verdi: number | null
  status: string
}

type State =
  | { type: "loading" }
  | { type: "error"; message: string }
  | { type: "ready"; kalendere: Kalender[]; selectedId: string | null; luker: Luke[]; kjop: Kjop[]; premier: Premie[] }

export default function AdminJulekalenderPage() {
  const [state, setState] = useState<State>({ type: "loading" })
  const [msg, setMsg] = useState<{ type: "ok" | "feil"; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [aar, setAar] = useState(String(new Date().getFullYear()))
  const [tittel, setTittel] = useState("Julekalender")
  const [beskrivelse, setBeskrivelse] = useState("")
  const [pris, setPris] = useState("50")

  const load = useCallback(async () => {
    setState({ type: "loading" })
    try {
      const res = await fetch(`/api/admin/julekalender?ts=${Date.now()}`, { cache: "no-store" })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setState({ type: "error", message: data.feil ?? "Kunne ikke hente data." })
        return
      }
      setState({
        type: "ready",
        kalendere: data.kalendere ?? [],
        selectedId: data.selectedKalenderId,
        luker: data.luker ?? [],
        kjop: data.kjop ?? [],
        premier: data.premier ?? [],
      })
    } catch {
      setState({ type: "error", message: "Kunne ikke hente data." })
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const selected =
    state.type === "ready" && state.selectedId
      ? state.kalendere.find((k) => k.id === state.selectedId) ?? null
      : null

  const onCreate = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch("/api/admin/julekalender", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "createKalender",
          aar: Number(aar),
          tittel,
          beskrivelse,
          pris: Number(pris),
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setMsg({ type: "feil", text: data.feil ?? "Kunne ikke opprette." })
        return
      }
      setMsg({ type: "ok", text: "Julekalender opprettet med 24 luker." })
      load()
    } catch {
      setMsg({ type: "feil", text: "Kunne ikke opprette." })
    } finally {
      setBusy(false)
    }
  }

  const onActivate = async (id: string) => {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch("/api/admin/julekalender", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "activateKalender", kalenderId: id }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setMsg({ type: "feil", text: data.feil ?? "Kunne ikke aktivere." })
        return
      }
      setMsg({ type: "ok", text: "Julekalenderen er nå aktiv." })
      load()
    } catch {
      setMsg({ type: "feil", text: "Kunne ikke aktivere." })
    } finally {
      setBusy(false)
    }
  }

  const onEnd = async (id: string) => {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch("/api/admin/julekalender", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "endKalender", kalenderId: id }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setMsg({ type: "feil", text: data.feil ?? "Kunne ikke avslutte." })
        return
      }
      setMsg({ type: "ok", text: "Julekalenderen er avsluttet." })
      load()
    } catch {
      setMsg({ type: "feil", text: "Kunne ikke avslutte." })
    } finally {
      setBusy(false)
    }
  }

  const onSetPremie = async (dag: number, premieId: string) => {
    if (!selected) return
    setBusy(true)
    try {
      const res = await fetch("/api/admin/julekalender", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "setPremie", kalenderId: selected.id, dag, premieId }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setMsg({ type: "feil", text: data.feil ?? "Kunne ikke sette premie." })
        return
      }
      load()
    } catch {
      setMsg({ type: "feil", text: "Kunne ikke sette premie." })
    } finally {
      setBusy(false)
    }
  }

  const onApne = async (dag: number) => {
    if (!selected) return
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch("/api/admin/julekalender", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "apneLuk", kalenderId: selected.id, dag }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setMsg({ type: "feil", text: data.feil ?? "Kunne ikke åpne luke." })
        return
      }
      setMsg({ type: "ok", text: `Luke ${dag} åpnet. Vinnerlodd: #${data.vinner_loddnr}` })
      load()
    } catch {
      setMsg({ type: "feil", text: "Kunne ikke åpne luke." })
    } finally {
      setBusy(false)
    }
  }

  const onTilbakestill = async (dag: number) => {
    if (!selected) return
    setBusy(true)
    try {
      const res = await fetch("/api/admin/julekalender", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "tilbakestillLuk", kalenderId: selected.id, dag }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setMsg({ type: "feil", text: data.feil ?? "Kunne ikke tilbakestille." })
        return
      }
      load()
    } catch {
      setMsg({ type: "feil", text: "Kunne ikke tilbakestille." })
    } finally {
      setBusy(false)
    }
  }

  const paidCount = state.type === "ready" ? state.kjop.filter((k) => k.status === "paid").length : 0
  const totalLodd = state.type === "ready"
    ? state.kjop.filter((k) => k.status === "paid").reduce((sum, k) => sum + (k.antall ?? 0), 0)
    : 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Julekalender</h1>
          <p className="text-sm text-muted-foreground">
            Administrer julekalenderen: opprett, tildel premier til hver luke, og åpne dem i desember.
          </p>
        </div>
        <Link
          href="/julekalender"
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center justify-center rounded-lg border bg-background px-4 text-sm font-medium shadow-sm hover:bg-muted"
        >
          Vis side ↗
        </Link>
      </div>

      {state.type === "loading" && (
        <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">Laster…</div>
      )}
      {state.type === "error" && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive whitespace-pre-wrap">
          {state.message}
        </div>
      )}

      {state.type === "ready" && (
        <div className="space-y-8">
          {msg && (
            <div
              className={`rounded-xl border p-4 text-sm ${
                msg.type === "ok"
                  ? "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
              }`}
            >
              {msg.text}
            </div>
          )}

          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Opprett ny julekalender</h2>
            <div className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="aar">År</Label>
                <Input id="aar" value={aar} onChange={(e) => setAar(e.target.value)} inputMode="numeric" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tittel">Tittel</Label>
                <Input id="tittel" value={tittel} onChange={(e) => setTittel(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pris">Pris per kalender (kr)</Label>
                <Input id="pris" value={pris} onChange={(e) => setPris(e.target.value)} inputMode="numeric" />
              </div>
              <div className="flex items-end">
                <Button onClick={onCreate} disabled={busy} className="w-full">
                  {busy ? "Oppretter…" : "Opprett kalender"}
                </Button>
              </div>
              <div className="space-y-2 sm:col-span-2 lg:col-span-4">
                <Label htmlFor="beskrivelse">Beskrivelse (valgfritt)</Label>
                <Textarea
                  id="beskrivelse"
                  value={beskrivelse}
                  onChange={(e) => setBeskrivelse(e.target.value)}
                  placeholder="Kort beskrivelse som vises på julekalendersiden"
                  rows={2}
                />
              </div>
            </div>
          </section>

          {selected ? (
            <>
              <section className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
                  <div>
                    <div className="text-lg font-semibold">
                      {selected.tittel} ({selected.aar})
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Status: <span className="font-medium">{selected.status}</span> · Pris: {selected.pris} kr ·{" "}
                      Betalte kjøp: {paidCount} · Totalt solgt: {totalLodd} kalendere
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {selected.status !== "active" && selected.status !== "ended" && (
                      <Button onClick={() => onActivate(selected.id)} disabled={busy}>
                        Aktiver
                      </Button>
                    )}
                    {selected.status !== "ended" && (
                      <Button variant="outline" onClick={() => onEnd(selected.id)} disabled={busy}>
                        Avslutt
                      </Button>
                    )}
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <h2 className="text-lg font-semibold">Luker (1–24)</h2>
                <p className="text-sm text-muted-foreground">
                  Velg premie for hver luke. Når du åpner en luke trekkes en vinner automatisk fra alle betalte
                  kalendere.
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {state.luker.map((luke) => {
                    const apnet = Boolean(luke.apnet_at)
                    const premie = state.premier.find((p) => p.id === luke.premie_id)
                    return (
                      <div
                        key={luke.id}
                        className={`rounded-xl border p-4 ${apnet ? "border-green-500/40 bg-green-500/5" : "bg-card"}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-semibold">Luke {luke.dag}</div>
                          {apnet ? (
                            <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-xs text-green-700 dark:text-green-300">
                              Åpnet
                            </span>
                          ) : (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              Lukket
                            </span>
                          )}
                        </div>

                        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                          {premie ? (
                            <>
                              <div className="font-medium text-foreground">{premie.tittel}</div>
                              {premie.sponsor_navn && <div>Sponsor: {premie.sponsor_navn}</div>}
                              {premie.verdi ? <div>Verdi: {premie.verdi} kr</div> : null}
                            </>
                          ) : (
                            <div>Ingen premie tildelt</div>
                          )}
                          {apnet && luke.vinner_loddnr ? (
                            <div className="mt-1 font-medium text-green-700 dark:text-green-300">
                              Vinnerlodd: #{luke.vinner_loddnr}
                            </div>
                          ) : null}
                        </div>

                        <div className="mt-3 space-y-2">
                          <select
                            className="w-full rounded-lg border bg-background px-3 py-1.5 text-sm"
                            value={luke.premie_id ?? ""}
                            onChange={(e) => onSetPremie(luke.dag, e.target.value)}
                            disabled={busy}
                          >
                            <option value="">— Velg premie —</option>
                            {state.premier.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.tittel}
                                {p.sponsor_navn ? ` (${p.sponsor_navn})` : ""}
                              </option>
                            ))}
                          </select>

                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant={apnet ? "outline" : "default"}
                              onClick={() => onApne(luke.dag)}
                              disabled={busy}
                            >
                              {apnet ? "Trekk ny vinner" : "Åpne luke"}
                            </Button>
                            {apnet && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => onTilbakestill(luke.dag)}
                                disabled={busy}
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              >
                                Tilbakestill
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>

              <section className="space-y-4">
                <h2 className="text-lg font-semibold">Kjøp ({state.kjop.length})</h2>
                {state.kjop.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                    Ingen kjøp ennå.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/30 text-left text-xs text-muted-foreground">
                        <tr>
                          <th className="p-3">Telefon</th>
                          <th className="p-3">Antall</th>
                          <th className="p-3">Beløp</th>
                          <th className="p-3">Lodd</th>
                          <th className="p-3">Status</th>
                          <th className="p-3">Betalt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {state.kjop.map((k) => (
                          <tr key={k.id} className="border-t">
                            <td className="p-3">{k.telefon}</td>
                            <td className="p-3">{k.antall}</td>
                            <td className="p-3">{k.belop} kr</td>
                            <td className="p-3">
                              {k.lodd_fra && k.lodd_til ? `${k.lodd_fra}–${k.lodd_til}` : "—"}
                            </td>
                            <td className="p-3">
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs ${
                                  k.status === "paid"
                                    ? "bg-green-500/15 text-green-700 dark:text-green-300"
                                    : "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300"
                                }`}
                              >
                                {k.status === "paid" ? "Betalt" : "Avventer"}
                              </span>
                            </td>
                            <td className="p-3 text-xs text-muted-foreground">
                              {k.paid_at ? new Date(k.paid_at).toLocaleString("nb-NO") : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          ) : (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Ingen aktiv julekalender. Opprett en over.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
