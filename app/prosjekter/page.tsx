"use client"

import Link from "next/link"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type Status =
  | { type: "idle" }
  | { type: "sending" }
  | { type: "success" }
  | { type: "error"; message: string }

export default function ProsjekterPage() {
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

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
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
      setMedlemsnummer("")
      setNavn("")
      setEpost("")
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

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="medlemsnummer">Medlemsnummer (valgfritt)</Label>
                <Input
                  id="medlemsnummer"
                  value={medlemsnummer}
                  onChange={(e) => setMedlemsnummer(e.target.value)}
                  inputMode="numeric"
                  placeholder="1000"
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
              />
              {vedlegg.length ? (
                <div className="text-xs text-muted-foreground">
                  {vedlegg.length} fil(er) valgt
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button type="submit" disabled={status.type === "sending"}>
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
