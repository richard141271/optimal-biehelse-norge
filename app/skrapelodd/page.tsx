"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Status =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "error"; message: string }

export default function SkrapeloddPage() {
  const [status, setStatus] = useState<Status>({ type: "idle" })
  const [telefon, setTelefon] = useState("")
  const [nextHref, setNextHref] = useState<string | null>(null)

  async function kjop() {
    setStatus({ type: "loading" })
    try {
      setNextHref(null)
      const res = await fetch("/api/skrapelodd-ny/new", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ telefon }),
      })

      const data = (await res.json()) as {
        ok?: boolean
        feil?: string
        nextUrl?: string | null
      }

      const nextUrl = String(data.nextUrl ?? "").trim()

      if (!res.ok || !data.ok) {
        setStatus({ type: "error", message: data.feil ?? "Kunne ikke hente skrapelodd." })
        return
      }

      if (!nextUrl) {
        setStatus({ type: "error", message: "Kunne ikke hente skrapelodd." })
        return
      }

      setNextHref(nextUrl)
      window.location.href = nextUrl
    } catch {
      setStatus({ type: "error", message: "Kunne ikke hente skrapelodd." })
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <div className="space-y-8">
        <section className="rounded-3xl border bg-gradient-to-b from-[color:oklch(0.97_0.03_88)] via-background to-background p-6 sm:p-10">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">
              Støtt naturen · vinn sponsede premier
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">
              Digitale skrapelodd for biene 🐝
            </h1>
            <p className="max-w-2xl text-muted-foreground sm:text-lg">
              Kjøp et digitalt skrapelodd og støtt arbeidet for bier, pollinatorer og naturen.
            </p>
            <p className="text-sm text-muted-foreground">Små bidrag kan gjøre stor forskjell.</p>

            <div className="max-w-sm space-y-2">
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

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                onClick={kjop}
                disabled={status.type === "loading"}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-60"
              >
                {status.type === "loading" ? "Åpner Vipps…" : "Åpne Vipps"}
              </button>
              <div className="text-sm text-muted-foreground">
                Pris: <span className="font-medium text-foreground">20 kr</span> per lodd
              </div>
            </div>

            {status.type === "error" ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                {status.message}
              </div>
            ) : null}

            {nextHref ? (
              <div className="text-sm text-muted-foreground">
                Når du kommer tilbake fra Vipps åpner vi loddet automatisk. Du kan også åpne det her:{" "}
                <a className="underline underline-offset-4 hover:text-foreground" href={nextHref}>
                  Åpne skrapelodd
                </a>
              </div>
            ) : null}
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border bg-card p-5">
            <div className="text-sm font-medium">Ekte Vipps-betaling</div>
            <div className="mt-2 text-sm text-muted-foreground">
              Loddet utleveres kun når betalingen er bekreftet server-side.
            </div>
          </div>
          <div className="rounded-2xl border bg-card p-5">
            <div className="text-sm font-medium">Forhåndsdefinerte premier</div>
            <div className="mt-2 text-sm text-muted-foreground">
              Alle lodd er lagt inn på forhånd, med sponsede fysiske premier.
            </div>
          </div>
          <div className="rounded-2xl border bg-card p-5">
            <div className="text-sm font-medium">Mobil først</div>
            <div className="mt-2 text-sm text-muted-foreground">
              Skrap med finger eller mus. Resultatet vises når du har skrapt nok.
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
