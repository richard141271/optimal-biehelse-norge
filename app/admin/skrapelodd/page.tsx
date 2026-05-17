"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type TicketRow = {
  id: string
  ticket_number: number
  prize_name: string | null
  is_winner: boolean
  claimed: boolean
  payment_verified: boolean
  used: boolean
  created_at: string
  claimed_at: string | null
}

type LoadState =
  | { type: "loading" }
  | { type: "ready"; role: "admin" | "superadmin"; stats: Stats; tickets: TicketRow[] }
  | { type: "error"; message: string }

type Stats = { total: number; used: number; winners: number; claimed: number }

export default function AdminSkrapeloddPage() {
  const [q, setQ] = useState("")
  const [from, setFrom] = useState("1")
  const [to, setTo] = useState("200")
  const [premieNr, setPremieNr] = useState("")
  const [premieNavn, setPremieNavn] = useState("")
  const [premieVinner, setPremieVinner] = useState(true)
  const [saving, setSaving] = useState(false)
  const [state, setState] = useState<LoadState>({ type: "loading" })

  const queryUrl = useMemo(() => {
    const params = new URLSearchParams()
    if (q.trim()) params.set("q", q.trim())
    params.set("limit", "200")
    return `/api/admin/skrapelodd?${params.toString()}`
  }, [q])

  const load = useCallback(async () => {
    setState({ type: "loading" })
    try {
      const res = await fetch(`${queryUrl}&ts=${Date.now()}`, { cache: "no-store" })
      const data = (await res.json()) as {
        ok?: boolean
        feil?: string
        role?: "admin" | "superadmin"
        stats?: Stats
        tickets?: TicketRow[]
      }
      if (!res.ok || !data.ok) {
        setState({ type: "error", message: data.feil ?? "Kunne ikke hente skrapelodd." })
        return
      }
      setState({
        type: "ready",
        role: data.role ?? "admin",
        stats: data.stats ?? { total: 0, used: 0, winners: 0, claimed: 0 },
        tickets: data.tickets ?? [],
      })
    } catch {
      setState({ type: "error", message: "Kunne ikke hente skrapelodd." })
    }
  }, [queryUrl])

  useEffect(() => {
    load()
  }, [load])

  async function post(action: Record<string, unknown>) {
    setSaving(true)
    try {
      const res = await fetch("/api/admin/skrapelodd", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action),
      })
      const data = (await res.json()) as { ok?: boolean; feil?: string }
      if (!res.ok || !data.ok) {
        setState({ type: "error", message: data.feil ?? "Kunne ikke lagre." })
        return false
      }
      await load()
      return true
    } catch {
      setState({ type: "error", message: "Kunne ikke lagre." })
      return false
    } finally {
      setSaving(false)
    }
  }

  async function createBatch() {
    const f = Math.round(Number(from))
    const t = Math.round(Number(to))
    await post({ action: "createBatch", from: f, to: t })
  }

  async function setPrize() {
    const n = Math.round(Number(premieNr))
    await post({ action: "setPrize", ticketNumber: n, prizeName: premieNavn, isWinner: premieVinner })
    setPremieNr("")
    setPremieNavn("")
  }

  async function markClaimed(ticketId: string, claimed: boolean) {
    await post({ action: "markClaimed", ticketId, claimed })
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Skrapelodd</h1>
        <p className="max-w-3xl text-muted-foreground">
          Administrer forhåndsdefinerte skrapelodd, vinnere og utlevering.
        </p>
      </header>

      {state.type === "error" ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">
          {state.message}
        </div>
      ) : null}

      {state.type === "ready" ? (
        <section className="grid gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border bg-card p-5">
            <div className="text-xs text-muted-foreground">Totalt</div>
            <div className="mt-1 text-2xl font-semibold">{state.stats.total}</div>
          </div>
          <div className="rounded-2xl border bg-card p-5">
            <div className="text-xs text-muted-foreground">Brukt</div>
            <div className="mt-1 text-2xl font-semibold">{state.stats.used}</div>
          </div>
          <div className="rounded-2xl border bg-card p-5">
            <div className="text-xs text-muted-foreground">Vinnere</div>
            <div className="mt-1 text-2xl font-semibold">{state.stats.winners}</div>
          </div>
          <div className="rounded-2xl border bg-card p-5">
            <div className="text-xs text-muted-foreground">Hentet</div>
            <div className="mt-1 text-2xl font-semibold">{state.stats.claimed}</div>
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border bg-card p-6">
          <div className="text-sm font-medium">Opprett tomme lodd</div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="from">Fra</Label>
              <Input id="from" value={from} onChange={(e) => setFrom(e.target.value)} inputMode="numeric" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="to">Til</Label>
              <Input id="to" value={to} onChange={(e) => setTo(e.target.value)} inputMode="numeric" />
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={createBatch} disabled={saving}>
              Opprett / oppdater
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-6">
          <div className="text-sm font-medium">Legg inn premie</div>
          <div className="mt-4 grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="premieNr">Loddnummer</Label>
              <Input
                id="premieNr"
                value={premieNr}
                onChange={(e) => setPremieNr(e.target.value)}
                inputMode="numeric"
                placeholder="42"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="premieNavn">Premienavn</Label>
              <Input
                id="premieNavn"
                value={premieNavn}
                onChange={(e) => setPremieNavn(e.target.value)}
                placeholder="Honningpakke"
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border bg-background px-4 py-3 text-sm">
              <div>
                <div className="font-medium">Vinner</div>
                <div className="text-xs text-muted-foreground">Av = ikke-vinn</div>
              </div>
              <button
                type="button"
                onClick={() => setPremieVinner((v) => !v)}
                className={
                  premieVinner
                    ? "rounded-lg bg-primary px-3 py-1.5 text-primary-foreground"
                    : "rounded-lg border bg-background px-3 py-1.5"
                }
              >
                {premieVinner ? "På" : "Av"}
              </button>
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={setPrize} disabled={saving}>
              Lagre premie
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <div className="text-sm font-medium">Lodd</div>
            <div className="text-xs text-muted-foreground">Søk på loddnummer. Viser inntil 200.</div>
          </div>
          <div className="w-full sm:w-64">
            <Label htmlFor="q">Søk</Label>
            <Input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="F.eks. 42" />
          </div>
        </div>

        {state.type === "ready" ? (
          <div className="mt-4 space-y-3">
            {state.tickets.length === 0 ? (
              <div className="text-sm text-muted-foreground">Ingen lodd.</div>
            ) : (
              state.tickets.map((t) => (
                <div key={t.id} className="rounded-xl border bg-background p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm">
                      <span className="font-medium">#{t.ticket_number}</span>
                      <span className="ml-2 text-muted-foreground">
                        {t.used ? "Brukt" : "Ledig"} · {t.payment_verified ? "Verifisert" : "Ikke verifisert"} ·{" "}
                        {t.is_winner ? "Vinner" : "Ikke-vinn"} · {t.claimed ? "Hentet" : "Ikke hentet"}
                      </span>
                      {t.prize_name ? (
                        <div className="mt-1 text-xs text-muted-foreground">Premie: {t.prize_name}</div>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {t.is_winner ? (
                        <Button
                          variant={t.claimed ? "outline" : "default"}
                          onClick={() => markClaimed(t.id, !t.claimed)}
                          disabled={saving || !t.used}
                        >
                          {t.claimed ? "Angre hentet" : "Marker hentet"}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}
      </section>
    </div>
  )
}

