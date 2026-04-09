"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type Status =
  | { type: "idle" }
  | { type: "sending" }
  | { type: "success" }
  | { type: "error"; message: string }

type Gate =
  | { type: "loading" }
  | { type: "anon" }
  | { type: "not_member"; message: string }
  | {
      type: "ready"
      medlem: {
        medlemsnummer?: number | null
        navn?: string | null
        epost?: string | null
        telefon?: string | null
      }
    }

export default function ProsjekterPage() {
  const [gate, setGate] = useState<Gate>({ type: "loading" })
  const [medlemsnummer, setMedlemsnummer] = useState("")
  const [navn, setNavn] = useState("")
  const [epost, setEpost] = useState("")
  const [telefon, setTelefon] = useState("")
  const [tittel, setTittel] = useState("")
  const [sted, setSted] = useState("")
  const [budsjett, setBudsjett] = useState("")
  const [beskrivelse, setBeskrivelse] = useState("")
  const [vedlegg, setVedlegg] = useState<File[]>([])
  const [status, setStatus] = useState<Status>({ type: "idle" })

  useEffect(() => {
    let active = true
    fetch(`/api/min-side/me?ts=${Date.now()}`, { cache: "no-store" })
      .then(async (res) => {
        const payload = (await res.json()) as {
          ok?: boolean
          feil?: string
          medlem?: {
            medlemsnummer?: number | null
            navn?: string | null
            epost?: string | null
            telefon?: string | null
          }
        }
        if (!active) return
        if (!res.ok || !payload.ok || !payload.medlem) {
          if (res.status === 401) {
            setGate({ type: "anon" })
            return
          }
          setGate({ type: "not_member", message: payload.feil ?? "Ingen tilgang." })
          return
        }
        setGate({ type: "ready", medlem: payload.medlem })
        setMedlemsnummer(payload.medlem.medlemsnummer ? String(payload.medlem.medlemsnummer) : "")
        setNavn(String(payload.medlem.navn ?? ""))
        setEpost(String(payload.medlem.epost ?? ""))
        if (payload.medlem.telefon) setTelefon(String(payload.medlem.telefon))
      })
      .catch(() => {
        if (!active) return
        setGate({ type: "anon" })
      })
    return () => {
      active = false
    }
  }, [])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (gate.type !== "ready") {
      setStatus({ type: "error", message: "Du må være innlogget som medlem for å sende inn prosjekt." })
      return
    }
    setStatus({ type: "sending" })
    try {
      const formData = new FormData()
      formData.set("medlemsnummer", medlemsnummer)
      formData.set("navn", navn)
      formData.set("epost", epost)
      formData.set("telefon", telefon)
      formData.set("tittel", tittel)
      formData.set("sted", sted)
      formData.set("budsjett", budsjett)
      formData.set("beskrivelse", beskrivelse)
      for (const f of vedlegg) {
        formData.append("vedlegg", f, f.name)
      }
      const response = await fetch("/api/prosjekter", {
        method: "POST",
        body: formData,
      })

      const data = (await response.json()) as { ok?: boolean; feil?: string }
      if (!response.ok || !data.ok) {
        setStatus({
          type: "error",
          message: data.feil ?? "Noe gikk galt. Prøv igjen.",
        })
        return
      }

      setStatus({ type: "success" })
      setTelefon("")
      setTittel("")
      setSted("")
      setBudsjett("")
      setBeskrivelse("")
      setVedlegg([])
    } catch {
      setStatus({ type: "error", message: "Noe gikk galt. Prøv igjen." })
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <div className="space-y-8">
        <header className="space-y-3">
          <div className="text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground">
              Til forsiden
            </Link>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Prosjekter for bier
          </h1>
          <p className="max-w-3xl text-muted-foreground">
            Har du en idé til et tiltak som kan styrke bier og pollinatorer i
            nærmiljøet? Send inn et prosjektforslag. Vi kan vurdere støtte i
            form av veiledning, utstyr eller økonomisk bidrag.
          </p>
        </header>

        <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight">
              Send inn prosjektforslag
            </h2>
            <p className="text-sm text-muted-foreground">
              Beskriv prosjektet kort og hva du trenger.
            </p>
          </div>

          {gate.type !== "ready" ? (
            <div className="mt-6 rounded-xl border bg-muted/30 p-4 text-sm">
              {gate.type === "loading"
                ? "Sjekker innlogging…"
                : gate.type === "anon"
                  ? "Kun innloggede medlemmer kan sende inn prosjektforslag."
                  : gate.message}
              {gate.type === "anon" ? (
                <div className="mt-3">
                  <Link
                    href={`/min-side/login?next=${encodeURIComponent("/prosjekter")}`}
                    className="underline underline-offset-4"
                  >
                    Gå til innlogging
                  </Link>
                </div>
              ) : gate.type === "not_member" ? (
                <div className="mt-3">
                  <Link href="/#medlemskap" className="underline underline-offset-4">
                    Registrer medlemskap
                  </Link>
                </div>
              ) : null}
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="medlemsnummer">Medlemsnummer</Label>
                <Input
                  id="medlemsnummer"
                  value={medlemsnummer}
                  onChange={(e) => setMedlemsnummer(e.target.value)}
                  inputMode="numeric"
                  placeholder="1000"
                  disabled={gate.type !== "ready"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="navn">Navn</Label>
                <Input
                  id="navn"
                  value={navn}
                  onChange={(e) => setNavn(e.target.value)}
                  autoComplete="name"
                  placeholder="Fullt navn"
                  required
                  disabled={gate.type !== "ready"}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="epost">E-post</Label>
                <Input
                  id="epost"
                  type="email"
                  value={epost}
                  onChange={(e) => setEpost(e.target.value)}
                  autoComplete="email"
                  placeholder="navn@eksempel.no"
                  required
                  disabled={gate.type !== "ready"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="telefon">Telefon (valgfritt)</Label>
                <Input
                  id="telefon"
                  type="tel"
                  value={telefon}
                  onChange={(e) => setTelefon(e.target.value)}
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="8–12 sifre"
                  disabled={gate.type !== "ready"}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tittel">Prosjekttittel</Label>
              <Input
                id="tittel"
                value={tittel}
                onChange={(e) => setTittel(e.target.value)}
                placeholder="F.eks. pollinatorbed i skolegård"
                required
                disabled={gate.type !== "ready"}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sted">Sted</Label>
                <Input
                  id="sted"
                  value={sted}
                  onChange={(e) => setSted(e.target.value)}
                  placeholder="Kommune / område"
                  required
                  disabled={gate.type !== "ready"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="budsjett">Ønsket støtte (NOK, valgfritt)</Label>
                <Input
                  id="budsjett"
                  value={budsjett}
                  onChange={(e) => setBudsjett(e.target.value)}
                  inputMode="decimal"
                  placeholder="0,00"
                  disabled={gate.type !== "ready"}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="beskrivelse">Beskrivelse</Label>
              <Textarea
                id="beskrivelse"
                value={beskrivelse}
                onChange={(e) => setBeskrivelse(e.target.value)}
                placeholder="Hva er målet, hva skal gjøres, og hvordan kan OBNO bidra?"
                required
                disabled={gate.type !== "ready"}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="vedlegg">Vedlegg (valgfritt)</Label>
              <Input
                id="vedlegg"
                type="file"
                multiple
                accept="image/*,application/pdf"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? [])
                  setVedlegg(files)
                }}
                disabled={gate.type !== "ready"}
              />
              {vedlegg.length ? (
                <div className="text-xs text-muted-foreground">
                  {vedlegg.length} fil(er) valgt
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button type="submit" disabled={status.type === "sending" || gate.type !== "ready"}>
                {status.type === "sending" ? "Sender…" : "Send inn"}
              </Button>
              {status.type === "success" ? (
                <p className="text-sm text-foreground">
                  Takk! Vi har mottatt prosjektforslaget ditt.
                </p>
              ) : null}
              {status.type === "error" ? (
                <p className="text-sm text-destructive">{status.message}</p>
              ) : null}
            </div>
          </form>
        </section>
      </div>
    </main>
  )
}
