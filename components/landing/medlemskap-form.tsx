"use client"

import { useMemo, useState } from "react"
import { useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

type Status =
  | { type: "idle" }
  | { type: "sending" }
  | { type: "success" }
  | { type: "error"; message: string }

type ReferralState =
  | { type: "idle" }
  | { type: "loading" }
  | {
      type: "ready"
      campaignId: string
      referrerMemberId: string
      campaignTitle: string
      referrerName: string
      endsAt?: string | null
    }
  | { type: "error"; message: string }

function digitsOnly(value: string) {
  return value.replace(/\D/g, "")
}

export function MedlemskapForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const [type, setType] = useState<"innmeldt" | "stotte" | "bedrift">("innmeldt")
  const [stotteMerInfo, setStotteMerInfo] = useState(false)
  const [navn, setNavn] = useState("")
  const [adresse, setAdresse] = useState("")
  const [postnr, setPostnr] = useState("")
  const [sted, setSted] = useState("")
  const [epost, setEpost] = useState("")
  const [telefon, setTelefon] = useState("")
  const [passord, setPassord] = useState("")
  const [passord2, setPassord2] = useState("")
  const [status, setStatus] = useState<Status>({ type: "idle" })
  const [referral, setReferral] = useState<ReferralState>({ type: "idle" })

  const skalViseAdressefelter =
    type === "innmeldt" || type === "bedrift" || (type === "stotte" && stotteMerInfo)
  const skalViseTelefon = type === "innmeldt" || type === "bedrift" || (type === "stotte" && stotteMerInfo)

  useEffect(() => {
    const campaignId = String(searchParams.get("kampanje") ?? "").trim()
    const referrerMemberId = String(searchParams.get("verver") ?? "").trim()

    if (!campaignId || !referrerMemberId) {
      return
    }

    let ignore = false

    void fetch(
      `/api/vervekampanje?kampanje=${encodeURIComponent(campaignId)}&verver=${encodeURIComponent(referrerMemberId)}&ts=${Date.now()}`,
      { cache: "no-store" }
    )
      .then(async (res) => {
        const data = (await res.json()) as {
          ok?: boolean
          feil?: string
          campaign?: { id?: string; title?: string; ends_at?: string | null }
          referrer?: { id?: string; navn?: string }
        }
        if (ignore) return
        if (!res.ok || !data.ok || !data.campaign?.id || !data.referrer?.id) {
          setReferral({
            type: "error",
            message: data.feil ?? "Vervelenken er ikke gyldig lenger.",
          })
          return
        }
        setReferral({
          type: "ready",
          campaignId: String(data.campaign.id),
          referrerMemberId: String(data.referrer.id),
          campaignTitle: String(data.campaign.title ?? "").trim() || "Vervekampanje",
          referrerName: String(data.referrer.navn ?? "").trim() || "et medlem i OBNO",
          endsAt: data.campaign.ends_at ?? null,
        })
      })
      .catch(() => {
        if (ignore) return
        setReferral({
          type: "error",
          message: "Kunne ikke lese vervelenken akkurat nå.",
        })
      })

    return () => {
      ignore = true
    }
  }, [searchParams])

  const aktivReferral = (() => {
    const campaignId = String(searchParams.get("kampanje") ?? "").trim()
    const referrerMemberId = String(searchParams.get("verver") ?? "").trim()
    if (!campaignId || !referrerMemberId) return { type: "idle" as const }
    return referral
  })()

  function velgType(next: "innmeldt" | "stotte" | "bedrift") {
    setType(next)
    if (next !== "stotte") setStotteMerInfo(false)
    if (next === "stotte" && !stotteMerInfo) {
      setAdresse("")
      setPostnr("")
      setSted("")
      setTelefon("")
    }
    setStatus({ type: "idle" })
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (passord.trim().length < 6) {
      setStatus({ type: "error", message: "Passord må være minst 6 tegn." })
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
          telefon: tlf,
          passord,
          referralCampaignId:
            aktivReferral.type === "ready" ? aktivReferral.campaignId : undefined,
          referrerMemberId:
            aktivReferral.type === "ready" ? aktivReferral.referrerMemberId : undefined,
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
            Bedrift
          </Button>
        </div>
      </div>

      {aktivReferral.type === "loading" ? (
        <div className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
          Leser vervelenke...
        </div>
      ) : null}
      {aktivReferral.type === "ready" ? (
        <div className="rounded-xl border bg-card px-4 py-3 text-sm">
          Dette medlemskapet teller i <span className="font-medium">{aktivReferral.campaignTitle}</span>
          {" "}for <span className="font-medium">{aktivReferral.referrerName}</span>.
          {aktivReferral.endsAt ? (
            <div className="mt-1 text-muted-foreground">
              Kampanjen avsluttes {new Date(aktivReferral.endsAt).toLocaleDateString("nb-NO")}.
            </div>
          ) : null}
        </div>
      ) : null}
      {aktivReferral.type === "error" ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {aktivReferral.message}
        </div>
      ) : null}

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
          placeholder="Minst 6 tegn"
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
        <Button
          type="submit"
          disabled={status.type === "sending" || aktivReferral.type === "loading"}
        >
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
