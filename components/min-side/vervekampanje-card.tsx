"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"

type State =
  | { type: "loading" }
  | { type: "error"; message: string }
  | {
      type: "ready"
      campaign: null
    }
  | {
      type: "ready"
      campaign: {
        id: string
        title: string
        description?: string | null
        starts_at?: string | null
        ends_at?: string | null
        referralPath: string
        premier: Array<{ id: string; tittel: string; verdi?: number | null }>
      }
      medlem: {
        id: string
        navn: string
        epost?: string | null
      }
      stats: {
        count: number
        amount: number
        rank?: number | null
      }
      referrals: Array<{
        navn: string
        epost?: string | null
        medlemskap: string
        amount: number
        created_at?: string | null
      }>
    }

function formatDate(value?: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString("nb-NO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(value)
}

export function VervekampanjeCard() {
  const [state, setState] = useState<State>({ type: "loading" })
  const [copyStatus, setCopyStatus] = useState("")

  const hent = useCallback(async () => {
    try {
      const res = await fetch(`/api/min-side/vervekampanje?ts=${Date.now()}`, {
        cache: "no-store",
      })
      const data = (await res.json()) as {
        ok?: boolean
        feil?: string
        campaign?: unknown
        medlem?: unknown
        stats?: unknown
        referrals?: unknown
      }
      if (!res.ok || !data.ok) {
        setState({
          type: "error",
          message: data.feil ?? "Kunne ikke hente vervekampanje.",
        })
        return
      }

      if (!data.campaign) {
        setState({ type: "ready", campaign: null })
        return
      }

      setState({
        type: "ready",
        campaign: data.campaign as {
          id: string
          title: string
          description?: string | null
          starts_at?: string | null
          ends_at?: string | null
          referralPath: string
          premier: Array<{ id: string; tittel: string; verdi?: number | null }>
        },
        medlem: data.medlem as { id: string; navn: string; epost?: string | null },
        stats: data.stats as { count: number; amount: number; rank?: number | null },
        referrals: (data.referrals ?? []) as Array<{
          navn: string
          epost?: string | null
          medlemskap: string
          amount: number
          created_at?: string | null
        }>,
      })
    } catch {
      setState({
        type: "error",
        message: "Kunne ikke hente vervekampanje.",
      })
    }
  }, [])

  useEffect(() => {
    const id = setTimeout(() => {
      void hent()
    }, 0)
    return () => clearTimeout(id)
  }, [hent])

  const referralLink = useMemo(() => {
    if (state.type !== "ready" || !state.campaign) return ""
    return state.campaign.referralPath
  }, [state])

  async function copyText(text: string, successText: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopyStatus(successText)
      window.setTimeout(() => setCopyStatus(""), 2500)
    } catch {
      setCopyStatus("Kopiering feilet. Proev igjen.")
      window.setTimeout(() => setCopyStatus(""), 2500)
    }
  }

  function absoluteLink(path: string) {
    if (typeof window === "undefined") return path
    return `${window.location.origin}${path}`
  }

  if (state.type === "loading") {
    return (
      <section className="rounded-2xl border bg-card p-6">
        <div className="text-sm text-muted-foreground">Laster vervekampanje...</div>
      </section>
    )
  }

  if (state.type === "error") {
    return (
      <section className="rounded-2xl border bg-card p-6">
        <div className="text-sm text-destructive">{state.message}</div>
      </section>
    )
  }

  if (!state.campaign) return null

  const shareMessage = [
    `Hei! Jeg er med i OBNO sin vervekampanje: ${state.campaign.title}.`,
    "Hvis du vil bli medlem og samtidig la vervet telle pa meg, bruker du denne lenken:",
    absoluteLink(referralLink),
  ]
    .filter(Boolean)
    .join("\n\n")

  return (
    <section className="rounded-2xl border bg-card p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Vervekampanje</h2>
          <p className="text-sm text-muted-foreground">
            Del lenken din, sa teller nye medlemmer pa deg i kampanjen.
          </p>
        </div>
        <div className="rounded-xl border bg-background px-3 py-2 text-xs text-muted-foreground">
          Males pa inntekt: medlem 100 kr, stottemedlem 300 kr, bedrift 1000 kr
        </div>
      </div>

      <div className="mt-4 rounded-xl border bg-background p-4">
        <div className="font-medium">{state.campaign.title}</div>
        {state.campaign.description ? (
          <div className="mt-1 text-sm text-muted-foreground">{state.campaign.description}</div>
        ) : null}
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-card p-3">
            <div className="text-xs text-muted-foreground">Vervet</div>
            <div className="mt-1 text-xl font-semibold">{state.stats.count}</div>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <div className="text-xs text-muted-foreground">Sum inntekt</div>
            <div className="mt-1 text-xl font-semibold">{formatCurrency(state.stats.amount)}</div>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <div className="text-xs text-muted-foreground">Plassering</div>
            <div className="mt-1 text-xl font-semibold">
              {state.stats.rank ? `#${state.stats.rank}` : "—"}
            </div>
          </div>
        </div>
        {state.campaign.ends_at ? (
          <div className="mt-3 text-sm text-muted-foreground">
            Kampanjen avsluttes {formatDate(state.campaign.ends_at)}.
          </div>
        ) : null}
      </div>

      <div className="mt-4 rounded-xl border bg-background p-4">
        <div className="text-sm font-medium">Din vervelenke</div>
        <div className="mt-2 break-all rounded-lg border bg-card px-3 py-2 text-sm">
          {referralLink}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => void copyText(absoluteLink(referralLink), "Vervelenke kopiert.")}
          >
            Kopier vervelenke
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void copyText(shareMessage, "Vervemelding kopiert.")}
          >
            Kopier vervemelding
          </Button>
        </div>
        {copyStatus ? <div className="mt-2 text-xs text-muted-foreground">{copyStatus}</div> : null}
      </div>

      {state.campaign.premier.length ? (
        <div className="mt-4 rounded-xl border bg-background p-4">
          <div className="text-sm font-medium">Vervepremier</div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {state.campaign.premier.map((premie) => (
              <div key={premie.id} className="rounded-lg border bg-card p-3 text-sm">
                <div className="font-medium">{premie.tittel}</div>
                <div className="text-muted-foreground">
                  {premie.verdi != null ? formatCurrency(premie.verdi) : "Premie"}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 rounded-xl border bg-background p-4">
        <div className="text-sm font-medium">Hvem du har vervet</div>
        {state.referrals.length ? (
          <div className="mt-3 space-y-2">
            {state.referrals.map((referral, index) => (
              <div key={`${referral.epost ?? referral.navn}-${index}`} className="rounded-lg border bg-card p-3 text-sm">
                <div className="font-medium">{referral.navn}</div>
                <div className="mt-1 text-muted-foreground">
                  {referral.medlemskap} · {formatCurrency(referral.amount)}
                  {referral.created_at ? ` · ${formatDate(referral.created_at)}` : ""}
                </div>
                {referral.epost ? <div className="text-xs text-muted-foreground">{referral.epost}</div> : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 text-sm text-muted-foreground">
            Ingen registrerte verv ennå.
          </div>
        )}
      </div>
    </section>
  )
}
