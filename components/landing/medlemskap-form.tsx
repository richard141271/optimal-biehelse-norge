"use client"

import { useEffect, useMemo, useState } from "react"
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

function digitsOnly(value: string) {
  return value.replace(/\D/g, "")
}

export function MedlemskapForm() {
  const router = useRouter()
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const [type, setType] = useState<"innmeldt" | "stotte" | "bedrift">("innmeldt")
  const [stotteMerInfo, setStotteMerInfo] = useState(false)
  const [orgnr, setOrgnr] = useState("")
  const [orgLookupStatus, setOrgLookupStatus] = useState<
    | { type: "idle" }
    | { type: "loading" }
    | { type: "error"; message: string }
    | { type: "success" }
  >({ type: "idle" })
  const [navn, setNavn] = useState("")
  const [adresse, setAdresse] = useState("")
  const [postnr, setPostnr] = useState("")
  const [sted, setSted] = useState("")
  const [epost, setEpost] = useState("")
  const [telefon, setTelefon] = useState("")
  const [passord, setPassord] = useState("")
  const [passord2, setPassord2] = useState("")
  const [status, setStatus] = useState<Status>({ type: "idle" })

  const skalViseAdressefelter =
    type === "innmeldt" || type === "bedrift" || (type === "stotte" && stotteMerInfo)
  const skalViseTelefon = type === "innmeldt" || type === "bedrift" || (type === "stotte" && stotteMerInfo)

  function velgType(next: "innmeldt" | "stotte" | "bedrift") {
    setType(next)
    if (next !== "stotte") setStotteMerInfo(false)
    if (next !== "bedrift") {
      setOrgnr("")
      setOrgLookupStatus({ type: "idle" })
    }
    if (next === "stotte" && !stotteMerInfo) {
      setAdresse("")
      setPostnr("")
      setSted("")
      setTelefon("")
    }
    setStatus({ type: "idle" })
  }

  useEffect(() => {
    if (type !== "bedrift") return
    const v = digitsOnly(orgnr)
    if (v.length !== 9) return

    const controller = new AbortController()
    const id = setTimeout(() => {
      ;(async () => {
        setOrgLookupStatus({ type: "loading" })
        try {
          const res = await fetch(
            `https://data.brreg.no/enhetsregisteret/api/enheter/${v}`,
            { signal: controller.signal }
          )
          if (!res.ok) {
            setOrgLookupStatus({
              type: "error",
              message: "Fant ikke bedrift på org.nr.",
            })
            return
          }
          const data = (await res.json()) as {
            navn?: string
            forretningsadresse?: {
              adresse?: string[]
              postnummer?: string
              poststed?: string
            }
          }
          const adr = data.forretningsadresse ?? {}
          const adrLine = (adr.adresse ?? []).filter(Boolean).join(", ")
          setNavn((data.navn ?? "").trim())
          setAdresse(adrLine)
          setPostnr((adr.postnummer ?? "").trim())
          setSted((adr.poststed ?? "").trim())
          setOrgLookupStatus({ type: "success" })
        } catch {
          setOrgLookupStatus({
            type: "error",
            message: "Kunne ikke hente bedriftsinfo akkurat nå.",
          })
        }
      })()
    }, 250)

    return () => {
      clearTimeout(id)
      controller.abort()
    }
  }, [orgnr, type])

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

    const tlf = digitsOnly(telefon)
    if (type !== "stotte") {
      if (tlf.length !== 8) {
        setStatus({ type: "error", message: "Telefon må være 8 siffer." })
        return
      }
    } else if (tlf) {
      if (tlf.length !== 8) {
        setStatus({ type: "error", message: "Telefon må være 8 siffer." })
        return
      }
    }

    const org = digitsOnly(orgnr)
    if (type === "bedrift" && org.length !== 9) {
      setStatus({ type: "error", message: "Org.nr. må være 9 siffer." })
      return
    }

    setStatus({ type: "sending" })
    try {
      const response = await fetch("/api/medlemmer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          orgnr: type === "bedrift" ? org : undefined,
          navn,
          adresse,
          postnr,
          sted,
          epost,
          telefon: tlf,
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
      setStotteMerInfo(false)
      setOrgnr("")
      setOrgLookupStatus({ type: "idle" })
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
            onClick={() => velgType("innmeldt")}
          >
            Medlem
          </Button>
          <Button
            type="button"
            variant={type === "stotte" ? "default" : "outline"}
            onClick={() => velgType("stotte")}
          >
            Støttemedlem
          </Button>
          <Button
            type="button"
            variant={type === "bedrift" ? "default" : "outline"}
            onClick={() => velgType("bedrift")}
          >
            Bedriftsmedlem
          </Button>
        </div>
      </div>

      {type === "bedrift" ? (
        <div className="rounded-xl border bg-card p-4 text-sm">
          <div className="font-medium">Bedriftsmedlemskap – 1000 kr/år</div>
          <p className="mt-2 text-muted-foreground">
            Som bedriftsmedlem i OBNO viser dere støtte til bier, natur og
            bærekraftige økosystemer.
          </p>
          <div className="mt-3 grid gap-1 text-muted-foreground">
            <div>✔ Synlighet på vår nettside som støttespiller</div>
            <div>✔ Digitalt medlemsbevis (kan brukes i markedsføring)</div>
            <div>✔ Mulighet for samarbeid i lokale tiltak</div>
            <div>✔ Omtale i våre kanaler</div>
          </div>
          <p className="mt-3 text-muted-foreground">
            En enkel måte å bidra – med synlig verdi.
          </p>
        </div>
      ) : null}

      {type === "bedrift" ? (
        <div className="space-y-2">
          <Label htmlFor="orgnr">Org.nr.</Label>
          <Input
            id="orgnr"
            name="orgnr"
            value={orgnr}
            onChange={(e) => {
              setOrgLookupStatus({ type: "idle" })
              setOrgnr(digitsOnly(e.target.value).slice(0, 9))
            }}
            inputMode="numeric"
            placeholder="9 siffer"
            required
          />
          {orgLookupStatus.type === "loading" ? (
            <div className="text-xs text-muted-foreground">Henter bedriftsinfo…</div>
          ) : null}
          {orgLookupStatus.type === "error" ? (
            <div className="text-xs text-destructive">{orgLookupStatus.message}</div>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="navn">{type === "bedrift" ? "Bedriftsnavn" : "Navn"}</Label>
        <Input
          id="navn"
          name="navn"
          value={navn}
          onChange={(e) => setNavn(e.target.value)}
          autoComplete="name"
          placeholder={type === "bedrift" ? "Bedriftens navn" : "Fullt navn"}
          required
        />
      </div>
      {type === "stotte" ? (
        <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm">
          <input
            id="stotteMerInfo"
            type="checkbox"
            checked={stotteMerInfo}
            onChange={(e) => {
              const next = e.target.checked
              setStotteMerInfo(next)
              if (!next) {
                setAdresse("")
                setPostnr("")
                setSted("")
                setTelefon("")
              }
            }}
            className="h-4 w-4 accent-primary"
          />
          <Label htmlFor="stotteMerInfo">Registrer flere opplysninger om meg</Label>
        </div>
      ) : null}

      {skalViseAdressefelter ? (
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
              required={type !== "stotte"}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="postnr">Postnr.</Label>
              <Input
                id="postnr"
                name="postnr"
                value={postnr}
                onChange={(e) =>
                  setPostnr(digitsOnly(e.target.value).slice(0, 4))
                }
                inputMode="numeric"
                autoComplete="postal-code"
                placeholder="0000"
                required={type !== "stotte"}
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
                required={type !== "stotte"}
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
      {skalViseTelefon ? (
        <div className="space-y-2">
          <Label htmlFor="telefon">Telefon</Label>
          <Input
            id="telefon"
            name="telefon"
            type="tel"
            value={telefon}
            onChange={(e) => setTelefon(digitsOnly(e.target.value).slice(0, 8))}
            inputMode="numeric"
            autoComplete="tel"
            placeholder="8 siffer"
            required={type !== "stotte"}
          />
        </div>
      ) : null}

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
