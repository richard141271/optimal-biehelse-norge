"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

type Status =
  | { type: "idle" }
  | { type: "sending" }
  | { type: "success" }
  | { type: "error"; message: string }

export function MedlemskapForm() {
  const router = useRouter()
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const [type, setType] = useState<"innmeldt" | "stotte" | "bedrift">("innmeldt")
  const [navn, setNavn] = useState("")
  const [adresse, setAdresse] = useState("")
  const [postnr, setPostnr] = useState("")
  const [sted, setSted] = useState("")
  const [epost, setEpost] = useState("")
  const [telefon, setTelefon] = useState("")
  const [passord, setPassord] = useState("")
  const [passord2, setPassord2] = useState("")
  const [status, setStatus] = useState<Status>({ type: "idle" })

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (passord.trim().length < 8) {
      setStatus({ type: "error", message: "Passord må være minst 8 tegn." })
      return
    }
    if (passord !== passord2) {
      setStatus({ type: "error", message: "Passordene er ikke like." })
      return
    }

    setStatus({ type: "sending" })
    try {
      const response = await fetch("/api/medlemmer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          navn,
          adresse,
          postnr,
          sted,
          epost,
          telefon,
          passord,
        }),
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
      if (supabase) {
        await supabase.auth.signInWithPassword({
          email: epost.trim().toLowerCase(),
          password: passord,
        })
        router.push("/min-side")
        router.refresh()
      }
      setNavn("")
      setAdresse("")
      setPostnr("")
      setSted("")
      setEpost("")
      setTelefon("")
      setPassord("")
      setPassord2("")
    } catch {
      setStatus({ type: "error", message: "Noe gikk galt. Prøv igjen." })
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Type medlemskap</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant={type === "innmeldt" ? "default" : "outline"}
            onClick={() => setType("innmeldt")}
          >
            Innmeldt medlem
          </Button>
          <Button
            type="button"
            variant={type === "stotte" ? "default" : "outline"}
            onClick={() => setType("stotte")}
          >
            Støttemedlem
          </Button>
          <Button
            type="button"
            variant={type === "bedrift" ? "default" : "outline"}
            onClick={() => setType("bedrift")}
          >
            Bedriftsmedlem
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="navn">Navn</Label>
        <Input
          id="navn"
          name="navn"
          value={navn}
          onChange={(e) => setNavn(e.target.value)}
          autoComplete="name"
          placeholder="Fullt navn"
          required={type === "innmeldt" || type === "bedrift"}
        />
      </div>
      {type === "innmeldt" || type === "bedrift" ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="adresse">Adresse</Label>
            <Input
              id="adresse"
              name="adresse"
              value={adresse}
              onChange={(e) => setAdresse(e.target.value)}
              autoComplete="street-address"
              placeholder="Gateadresse og nummer"
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="postnr">Postnr.</Label>
              <Input
                id="postnr"
                name="postnr"
                value={postnr}
                onChange={(e) => setPostnr(e.target.value)}
                inputMode="numeric"
                autoComplete="postal-code"
                placeholder="0000"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sted">Sted</Label>
              <Input
                id="sted"
                name="sted"
                value={sted}
                onChange={(e) => setSted(e.target.value)}
                autoComplete="address-level2"
                placeholder="Poststed"
                required
              />
            </div>
          </div>
        </>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="epost">E-post</Label>
        <Input
          id="epost"
          name="epost"
          type="email"
          value={epost}
          onChange={(e) => setEpost(e.target.value)}
          autoComplete="email"
          placeholder="navn@eksempel.no"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="telefon">Telefon</Label>
        <Input
          id="telefon"
          name="telefon"
          type="tel"
          value={telefon}
          onChange={(e) => setTelefon(e.target.value)}
          inputMode="tel"
          autoComplete="tel"
          placeholder="8–12 sifre"
          required={type === "innmeldt" || type === "bedrift"}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="passord">Passord</Label>
        <Input
          id="passord"
          name="passord"
          type="password"
          value={passord}
          onChange={(e) => setPassord(e.target.value)}
          autoComplete="new-password"
          placeholder="Minst 8 tegn"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="passord2">Gjenta passord</Label>
        <Input
          id="passord2"
          name="passord2"
          type="password"
          value={passord2}
          onChange={(e) => setPassord2(e.target.value)}
          autoComplete="new-password"
          placeholder="Gjenta passord"
          required
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" disabled={status.type === "sending"}>
          {status.type === "sending" ? "Sender…" : "Registrer medlemskap"}
        </Button>
        {status.type === "success" ? (
          <p className="text-sm text-foreground">
            Takk! Kontoen din er opprettet. Du kan logge inn på Min side.
          </p>
        ) : null}
        {status.type === "error" ? (
          <p className="text-sm text-destructive">{status.message}</p>
        ) : null}
      </div>
    </form>
  )
}
