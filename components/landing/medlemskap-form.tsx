"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Status =
  | { type: "idle" }
  | { type: "sending" }
  | { type: "success" }
  | { type: "error"; message: string }

export function MedlemskapForm() {
  const [navn, setNavn] = useState("")
  const [epost, setEpost] = useState("")
  const [telefon, setTelefon] = useState("")
  const [status, setStatus] = useState<Status>({ type: "idle" })

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setStatus({ type: "sending" })
    try {
      const response = await fetch("/api/medlemmer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ navn, epost, telefon }),
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
      setNavn("")
      setEpost("")
      setTelefon("")
    } catch {
      setStatus({ type: "error", message: "Noe gikk galt. Prøv igjen." })
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="navn">Navn</Label>
        <Input
          id="navn"
          name="navn"
          value={navn}
          onChange={(e) => setNavn(e.target.value)}
          autoComplete="name"
          placeholder="Fullt navn"
          required
        />
      </div>
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
          required
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" disabled={status.type === "sending"}>
          {status.type === "sending" ? "Sender…" : "Registrer medlemskap"}
        </Button>
        {status.type === "success" ? (
          <p className="text-sm text-foreground">
            Takk! Vi har mottatt registreringen din.
          </p>
        ) : null}
        {status.type === "error" ? (
          <p className="text-sm text-destructive">{status.message}</p>
        ) : null}
      </div>
    </form>
  )
}
