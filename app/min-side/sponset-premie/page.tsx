"use client"

import Link from "next/link"
import { type FormEvent, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

type Premie = {
  id: string
  created_at?: string
  tittel?: string | null
  sponsor_navn?: string | null
  sponsor_orgnr?: string | null
  sponsor_nettsted?: string | null
  verdi?: number | null
  status?: string | null
  admin_notat?: string | null
  image_url?: string | null
}

type State =
  | { type: "loading" }
  | { type: "error"; message: string }
  | { type: "ready"; premier: Premie[] }

type SendStatus =
  | { type: "idle" }
  | { type: "sending" }
  | { type: "success" }
  | { type: "error"; message: string }

function formatDate(iso?: string | null) {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("nb-NO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
}

function normalizeUrl(value: string) {
  const v = value.trim()
  if (!v) return ""
  if (/^https?:\/\//i.test(v)) return v
  return `https://${v}`
}

export default function SponsetPremiePage() {
  const router = useRouter()
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const [state, setState] = useState<State>({ type: "loading" })
  const [sendStatus, setSendStatus] = useState<SendStatus>({ type: "idle" })

  const [tittel, setTittel] = useState("")
  const [sponsorNavn, setSponsorNavn] = useState("")
  const [sponsorOrgnr, setSponsorOrgnr] = useState("")
  const [sponsorNettsted, setSponsorNettsted] = useState("")
  const [verdi, setVerdi] = useState("")
  const [bilde, setBilde] = useState<File | null>(null)

  async function refresh() {
    const res = await fetch(`/api/min-side/premier?ts=${Date.now()}`, { cache: "no-store" })
    if (res.status === 401) {
      router.push("/min-side/login?next=/min-side/sponset-premie")
      router.refresh()
      return
    }
    const data = (await res.json()) as { ok?: boolean; feil?: string; premier?: Premie[] }
    if (!res.ok || !data.ok) {
      setState({ type: "error", message: data.feil ?? "Kunne ikke hente premier." })
      return
    }
    setState({ type: "ready", premier: data.premier ?? [] })
  }

  useEffect(() => {
    const id = setTimeout(() => {
      refresh().catch(() => setState({ type: "error", message: "Kunne ikke hente premier." }))
    }, 0)
    return () => clearTimeout(id)
  }, [])

  async function lagre(e: FormEvent) {
    e.preventDefault()
    if (sendStatus.type === "sending") return

    if (!tittel.trim()) {
      setSendStatus({ type: "error", message: "Skriv inn tittel på premien." })
      return
    }
    if (!bilde) {
      setSendStatus({ type: "error", message: "Legg ved et bilde av premien." })
      return
    }

    setSendStatus({ type: "sending" })
    try {
      const form = new FormData()
      form.set("tittel", tittel.trim())
      form.set("sponsorNavn", sponsorNavn.trim())
      form.set("sponsorOrgnr", sponsorOrgnr.trim())
      form.set("sponsorNettsted", normalizeUrl(sponsorNettsted))
      form.set("verdi", verdi.trim())
      form.set("bilde", bilde)

      const res = await fetch("/api/min-side/premier", { method: "POST", body: form })
      const data = (await res.json()) as { ok?: boolean; feil?: string }
      if (!res.ok || !data.ok) {
        setSendStatus({ type: "error", message: data.feil ?? "Kunne ikke lagre premien." })
        return
      }

      setSendStatus({ type: "success" })
      setTittel("")
      setSponsorNavn("")
      setSponsorOrgnr("")
      setSponsorNettsted("")
      setVerdi("")
      setBilde(null)

      await refresh()
    } catch {
      setSendStatus({ type: "error", message: "Noe gikk galt. Prøv igjen." })
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-14 sm:py-20">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Sponset premie</h1>
          <p className="text-muted-foreground">
            Få med en premie fra en butikk/bedrift og registrer den her.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push("/min-side")}>
            Til Min side
          </Button>
          <Button variant="outline" onClick={() => router.push("/")} disabled={!supabase}>
            Til forsiden
          </Button>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border bg-card p-6">
          <h2 className="text-lg font-semibold">Registrer premie</h2>
          <form className="mt-4 space-y-4" onSubmit={lagre}>
            <div className="space-y-2">
              <Label htmlFor="tittel">Premie</Label>
              <Input
                id="tittel"
                value={tittel}
                onChange={(e) => setTittel(e.target.value)}
                placeholder="F.eks. gavekort på weekendopphold"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sponsorNavn">Bedrift (valgfritt)</Label>
              <Input
                id="sponsorNavn"
                value={sponsorNavn}
                onChange={(e) => setSponsorNavn(e.target.value)}
                placeholder="F.eks. Havbrisen Camping"
              />
              <div className="text-xs text-muted-foreground">
                Du kan legge inn orgnr/nettside hvis du har det, men det er ikke påkrevd.
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sponsorOrgnr">Orgnr (valgfritt)</Label>
                <Input
                  id="sponsorOrgnr"
                  value={sponsorOrgnr}
                  onChange={(e) => setSponsorOrgnr(e.target.value)}
                  inputMode="numeric"
                  placeholder="9 siffer"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="verdi">Verdi (NOK, valgfritt)</Label>
                <Input
                  id="verdi"
                  value={verdi}
                  onChange={(e) => setVerdi(e.target.value)}
                  inputMode="decimal"
                  placeholder="2500"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sponsorNettsted">Nettside (valgfritt)</Label>
              <Input
                id="sponsorNettsted"
                value={sponsorNettsted}
                onChange={(e) => setSponsorNettsted(e.target.value)}
                placeholder="havbrisen.no"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bilde">Bilde av premien</Label>
              <Input
                id="bilde"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null
                  setBilde(f)
                }}
                required
              />
              {bilde ? (
                <div className="text-xs text-muted-foreground">{bilde.name}</div>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button type="submit" disabled={sendStatus.type === "sending"}>
                {sendStatus.type === "sending" ? "Lagrer…" : "Lagre premie"}
              </Button>
              {sendStatus.type === "success" ? (
                <p className="text-sm text-foreground">Takk! Premien er registrert.</p>
              ) : null}
              {sendStatus.type === "error" ? (
                <p className="text-sm text-destructive">{sendStatus.message}</p>
              ) : null}
            </div>
          </form>

          <div className="mt-6 rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
            Premien leveres fysisk til premieansvarlig i foreningen.
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Mine premier</h2>
            <Button variant="outline" onClick={() => refresh()} disabled={state.type === "loading"}>
              Oppdater
            </Button>
          </div>

          {state.type === "loading" ? (
            <div className="mt-4 rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
              Laster…
            </div>
          ) : null}

          {state.type === "error" ? (
            <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {state.message}
            </div>
          ) : null}

          {state.type === "ready" ? (
            state.premier.length ? (
              <div className="mt-4 space-y-4">
                {state.premier.map((p) => (
                  <div key={p.id} className="rounded-xl border bg-background p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">{p.tittel || "Premie"}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {formatDate(p.created_at ?? null)}
                          {p.status ? ` · ${p.status}` : ""}
                        </div>
                        {p.sponsor_navn ? (
                          <div className="mt-2 text-sm text-muted-foreground">
                            Sponsor: {p.sponsor_navn}
                            {p.sponsor_nettsted ? (
                              <>
                                {" "}
                                ·{" "}
                                <a
                                  className="underline underline-offset-4 hover:text-foreground"
                                  href={p.sponsor_nettsted}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  nettside
                                </a>
                              </>
                            ) : null}
                          </div>
                        ) : null}
                        {p.admin_notat ? (
                          <div className="mt-2 text-sm text-muted-foreground">
                            Admin: {p.admin_notat}
                          </div>
                        ) : null}
                      </div>
                      {p.image_url ? (
                        <div className="h-16 w-20 overflow-hidden rounded-lg border bg-muted/20">
                          <img
                            src={p.image_url}
                            alt={p.tittel ?? "Premie"}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
                Ingen registrerte premier ennå.
              </div>
            )
          ) : null}

          <div className="mt-6 text-xs text-muted-foreground">
            Spørsmål?{" "}
            <Link href="mailto:post@obno.no" className="underline underline-offset-4 hover:text-foreground">
              post@obno.no
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}
