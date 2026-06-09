"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

type Campaign = {
  id: string
  title: string
  description?: string | null
  status: string
  starts_at?: string | null
  ends_at?: string | null
  created_at?: string | null
  stats: {
    count: number
    amount: number
  }
}

type Prize = {
  id: string
  tittel: string
  sponsor_navn?: string | null
  verdi?: number | null
  status?: string | null
  is_reserved_in_selected: boolean
  reserved_campaign_title?: string | null
  reserved_lotteri_title?: string | null
  unavailable_reason?: string | null
}

type ScoreRow = {
  rank: number
  referrer_member_id: string
  referrer_name: string
  referrer_email?: string | null
  amount: number
  count: number
  referrals: Array<{
    navn: string
    epost?: string | null
    medlemskap: string
    amount: number
    created_at?: string | null
  }>
}

type State =
  | { type: "loading" }
  | { type: "error"; message: string }
  | {
      type: "ready"
      campaigns: Campaign[]
      activeCampaign: Omit<Campaign, "stats"> | null
      selectedCampaignId?: string | null
      selectedSummary: {
        count: number
        amount: number
      }
      scoreboard: ScoreRow[]
      reservedPremier: Prize[]
      premier: Prize[]
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

export function VervekampanjePanel() {
  const [isOpen, setIsOpen] = useState(false)
  const [state, setState] = useState<State>({ type: "loading" })
  const [selectedCampaignId, setSelectedCampaignId] = useState("")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [endsAt, setEndsAt] = useState("")
  const [actionError, setActionError] = useState("")
  const [actionBusy, setActionBusy] = useState("")
  const [prizeQuery, setPrizeQuery] = useState("")

  const hent = useCallback(async (campaignId?: string) => {
    setState({ type: "loading" })
    setActionError("")
    try {
      const url = campaignId
        ? `/api/admin/vervekampanje?campaignId=${encodeURIComponent(campaignId)}&ts=${Date.now()}`
        : `/api/admin/vervekampanje?ts=${Date.now()}`
      const res = await fetch(url, { cache: "no-store" })
      const data = (await res.json()) as {
        ok?: boolean
        feil?: string
        campaigns?: Campaign[]
        activeCampaign?: Omit<Campaign, "stats"> | null
        selectedCampaignId?: string | null
        selectedSummary?: { count: number; amount: number }
        scoreboard?: ScoreRow[]
        reservedPremier?: Prize[]
        premier?: Prize[]
      }
      if (!res.ok || !data.ok) {
        setState({ type: "error", message: data.feil ?? "Kunne ikke hente vervekampanje." })
        return
      }
      setSelectedCampaignId(String(data.selectedCampaignId ?? ""))
      setState({
        type: "ready",
        campaigns: data.campaigns ?? [],
        activeCampaign: data.activeCampaign ?? null,
        selectedCampaignId: data.selectedCampaignId ?? null,
        selectedSummary: data.selectedSummary ?? { count: 0, amount: 0 },
        scoreboard: data.scoreboard ?? [],
        reservedPremier: data.reservedPremier ?? [],
        premier: data.premier ?? [],
      })
    } catch {
      setState({ type: "error", message: "Kunne ikke hente vervekampanje." })
    }
  }, [])

  useEffect(() => {
    const id = setTimeout(() => {
      void hent()
    }, 0)
    return () => clearTimeout(id)
  }, [hent])

  const selectedCampaign = useMemo(() => {
    if (state.type !== "ready") return null
    return state.campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null
  }, [selectedCampaignId, state])

  const filteredPrizes = useMemo(() => {
    if (state.type !== "ready") return []
    const query = prizeQuery.trim().toLowerCase()
    if (!query) return state.premier
    return state.premier.filter((prize) =>
      `${prize.tittel} ${prize.sponsor_navn ?? ""}`.toLowerCase().includes(query)
    )
  }, [prizeQuery, state])

  async function doAction(body: Record<string, unknown>, doneText?: string) {
    const action = String(body.action ?? "")
    setActionBusy(action)
    setActionError("")
    try {
      const res = await fetch("/api/admin/vervekampanje", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = (await res.json()) as { ok?: boolean; feil?: string }
      if (!res.ok || !data.ok) {
        setActionError(data.feil ?? "Kunne ikke oppdatere vervekampanje.")
        return
      }
      if (doneText) setActionError(doneText)
      if (body.action === "startCampaign") {
        setTitle("")
        setDescription("")
        setEndsAt("")
      }
      await hent(body.action === "stopCampaign" ? undefined : selectedCampaignId || undefined)
    } catch {
      setActionError("Kunne ikke oppdatere vervekampanje.")
    } finally {
      setActionBusy("")
    }
  }

  if (state.type === "loading") {
    return (
      <section className="rounded-2xl border bg-card p-5">
        <div className="text-sm text-muted-foreground">Laster vervekampanje...</div>
      </section>
    )
  }

  if (state.type === "error") {
    return (
      <section className="rounded-2xl border bg-card p-5">
        <div className="text-sm text-destructive">{state.message}</div>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Vervekampanje</h2>
          <p className="text-sm text-muted-foreground">
            Start en kampanje i admin, la medlemmene hente egen vervelenke på Min side og følg resultatene her.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setIsOpen((prev) => !prev)
            }}
          >
            {isOpen ? (
              <>
                Skjul <ChevronUp className="ml-2 h-4 w-4" />
              </>
            ) : (
              <>
                Åpne <ChevronDown className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
          <div className="rounded-xl border bg-background px-3 py-2 text-xs text-muted-foreground">
            Score rangeres på sum inntekt, deretter antall verv.
          </div>
        </div>
      </div>

      {!isOpen ? null : (
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="rounded-xl border bg-background p-4">
            <div className="text-sm font-medium">Aktiv kampanje</div>
            {state.activeCampaign ? (
              <div className="mt-3 space-y-3">
                <div>
                  <div className="font-medium">{state.activeCampaign.title}</div>
                  {state.activeCampaign.description ? (
                    <div className="text-sm text-muted-foreground">
                      {state.activeCampaign.description}
                    </div>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border bg-card p-3 text-sm">
                    <div className="text-muted-foreground">Startet</div>
                    <div className="font-medium">{formatDate(state.activeCampaign.starts_at) || "I dag"}</div>
                  </div>
                  <div className="rounded-lg border bg-card p-3 text-sm">
                    <div className="text-muted-foreground">Slutter</div>
                    <div className="font-medium">{formatDate(state.activeCampaign.ends_at) || "Ikke satt"}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() =>
                      void doAction({
                        action: "stopCampaign",
                        campaignId: state.activeCampaign?.id,
                      })
                    }
                    disabled={actionBusy === "stopCampaign"}
                  >
                    Avslutt kampanje
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setSelectedCampaignId(state.activeCampaign?.id ?? "")
                      void hent(state.activeCampaign?.id)
                    }}
                  >
                    Vis scoreboard
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="text-sm text-muted-foreground">
                  Ingen aktiv kampanje akkurat nå.
                </div>
                <div className="grid gap-3">
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Navn på vervekampanjen"
                  />
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Kort tekst om kampanjen og hvordan premiene deles ut"
                  />
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Sluttdato (valgfritt)</div>
                    <Input
                      type="date"
                      value={endsAt}
                      onChange={(e) => setEndsAt(e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={() =>
                      void doAction({
                        action: "startCampaign",
                        title,
                        description,
                        endsAt: endsAt ? `${endsAt}T23:59:59.000Z` : null,
                      })
                    }
                    disabled={actionBusy === "startCampaign" || !title.trim()}
                  >
                    Start vervekampanje
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-background p-4">
            <div className="text-sm font-medium">Kampanjearkiv</div>
            <div className="mt-3 space-y-2">
              {state.campaigns.length ? (
                state.campaigns.map((campaign) => (
                  <button
                    key={campaign.id}
                    type="button"
                    onClick={() => {
                      setSelectedCampaignId(campaign.id)
                      void hent(campaign.id)
                    }}
                    className={`w-full rounded-xl border px-4 py-3 text-left ${
                      campaign.id === selectedCampaignId ? "border-primary bg-card" : "bg-card"
                    }`}
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="font-medium">{campaign.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {campaign.status === "ended" ? "Avsluttet" : "Aktiv"} · {formatDate(campaign.created_at)}
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {campaign.stats.count} verv · {formatCurrency(campaign.stats.amount)}
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">Ingen kampanjer registrert ennå.</div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border bg-background p-4">
            <div className="text-sm font-medium">Utsending til medlemmene</div>
            <div className="mt-2 text-sm text-muted-foreground">
              Bruk masseutsendingen lenger ned i medlemsregisteret for å sende beskjed til alle. Medlemmene finner sin personlige vervelenke på Min side.
            </div>
          </div>

          <div className="rounded-xl border bg-background p-4">
            <div className="text-sm font-medium">Valgt kampanje</div>
            {selectedCampaign ? (
              <div className="mt-3 space-y-3">
                <div>
                  <div className="font-medium">{selectedCampaign.title}</div>
                  {selectedCampaign.description ? (
                    <div className="text-sm text-muted-foreground">{selectedCampaign.description}</div>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border bg-card p-3">
                    <div className="text-xs text-muted-foreground">Verv</div>
                    <div className="mt-1 text-xl font-semibold">{state.selectedSummary.count}</div>
                  </div>
                  <div className="rounded-lg border bg-card p-3">
                    <div className="text-xs text-muted-foreground">Sum inntekt</div>
                    <div className="mt-1 text-xl font-semibold">
                      {formatCurrency(state.selectedSummary.amount)}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-2 text-sm text-muted-foreground">Velg en kampanje for a se detaljer.</div>
            )}
          </div>
        </div>
      </div>

      )}
      {isOpen && actionError ? (
        <div className={`mt-4 rounded-xl border p-3 text-sm ${actionError.includes("kopiert") ? "bg-card" : "bg-background"}`}>
          {actionError}
        </div>
      ) : null}

      {isOpen && selectedCampaign ? (
        <div className="mt-6 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-4">
            <div className="rounded-xl border bg-background p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm font-medium">Vervepremier</div>
                <Input
                  value={prizeQuery}
                  onChange={(e) => setPrizeQuery(e.target.value)}
                  placeholder="Søk i premiearkivet"
                  className="sm:max-w-xs"
                />
              </div>

              {state.reservedPremier.length ? (
                <div className="mt-3 space-y-2">
                  {state.reservedPremier.map((premie) => (
                    <div key={premie.id} className="rounded-lg border bg-card p-3 text-sm">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="font-medium">{premie.tittel}</div>
                          <div className="text-muted-foreground">
                            {premie.sponsor_navn ? `${premie.sponsor_navn} · ` : ""}
                            {premie.verdi != null ? formatCurrency(premie.verdi) : "Premie"}
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            void doAction({
                              action: "unreservePrize",
                              campaignId: selectedCampaign.id,
                              premieId: premie.id,
                            })
                          }
                          disabled={actionBusy === "unreservePrize"}
                        >
                          Fjern
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 text-sm text-muted-foreground">
                  Ingen premier er reservert til denne kampanjen ennå.
                </div>
              )}

              <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto pr-1">
                {filteredPrizes.map((premie) => (
                  <div key={premie.id} className="rounded-lg border bg-card p-3 text-sm">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="font-medium">{premie.tittel}</div>
                        <div className="text-muted-foreground">
                          {premie.sponsor_navn ? `${premie.sponsor_navn} · ` : ""}
                          {premie.verdi != null ? formatCurrency(premie.verdi) : "Premie"}
                        </div>
                        {premie.unavailable_reason && !premie.is_reserved_in_selected ? (
                          <div className="mt-1 text-xs text-destructive">{premie.unavailable_reason}</div>
                        ) : null}
                      </div>
                      {premie.is_reserved_in_selected ? (
                        <div className="rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground">
                          Reservert i valgt kampanje
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            void doAction({
                              action: "reservePrize",
                              campaignId: selectedCampaign.id,
                              premieId: premie.id,
                            })
                          }
                          disabled={!!premie.unavailable_reason || actionBusy === "reservePrize"}
                        >
                          Reserver
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {filteredPrizes.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Ingen premier matcher soket.</div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border bg-background p-4">
              <div className="text-sm font-medium">Scoreboard</div>
              {state.scoreboard.length ? (
                <div className="mt-3 space-y-3">
                  {state.scoreboard.map((row) => (
                    <div key={row.referrer_member_id} className="rounded-xl border bg-card p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="font-medium">
                            #{row.rank} {row.referrer_name}
                          </div>
                          {row.referrer_email ? (
                            <div className="text-xs text-muted-foreground">{row.referrer_email}</div>
                          ) : null}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {row.count} verv · {formatCurrency(row.amount)}
                        </div>
                      </div>
                      <div className="mt-3 space-y-2">
                        {row.referrals.map((referral, index) => (
                          <div key={`${referral.epost ?? referral.navn}-${index}`} className="rounded-lg border bg-background p-3 text-sm">
                            <div className="font-medium">{referral.navn}</div>
                            <div className="text-muted-foreground">
                              {referral.medlemskap} · {formatCurrency(referral.amount)}
                              {referral.created_at ? ` · ${formatDate(referral.created_at)}` : ""}
                            </div>
                            {referral.epost ? (
                              <div className="text-xs text-muted-foreground">{referral.epost}</div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 text-sm text-muted-foreground">
                  Ingen verv registrert i valgt kampanje ennå.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
