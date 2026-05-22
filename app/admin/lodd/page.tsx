"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Lotteri = {
  id: string
  created_at?: string | null
  tittel?: string | null
  beskrivelse?: string | null
  ticket_price?: number | null
  status?: string | null
  start_at?: string | null
  end_at?: string | null
  winner_loddnr?: number | null
  winner_phone?: string | null
  winner_drawn_at?: string | null
}

type Premie = {
  id: string
  created_at?: string | null
  tittel?: string | null
  sponsor_navn?: string | null
  sponsor_orgnr?: string | null
  sponsor_nettsted?: string | null
  verdi?: number | null
  image_url?: string | null
  status?: string | null
  submitted_by_epost?: string | null
  admin_notat?: string | null
}

type ActivePremieJoin = {
  premie_id?: string | null
  is_hovedpremie?: boolean | null
  sort_order?: number | null
}

type PremieLink = {
  lotteri_id?: string | null
  premie_id?: string | null
  is_hovedpremie?: boolean | null
  sort_order?: number | null
}

type Kjop = {
  id: string
  created_at?: string | null
  phone?: string | null
  antall?: number | null
  belop?: number | null
  status?: string | null
  ticket_from?: number | null
  ticket_to?: number | null
  vipps_ref?: string | null
  paid_at?: string | null
}

type Winner = {
  winner_loddnr?: number | null
  winner_phone?: string | null
  created_at?: string | null
}

type State =
  | { type: "loading" }
  | { type: "error"; message: string }
  | {
      type: "ready"
      role: "admin" | "superadmin"
      lotterier: Lotteri[]
      activeLotteri: Lotteri | null
      premier: Premie[]
      activePremier: ActivePremieJoin[]
      premieLinks: PremieLink[]
      kjop: Kjop[]
      winners: Winner[]
    }

type ApiOk = {
  ok: true
  role: "admin" | "superadmin"
  lotterier: Lotteri[]
  activeLotteri: Lotteri | null
  premier: Premie[]
  activePremier: ActivePremieJoin[]
  premieLinks?: PremieLink[]
  selectedLotteriId?: string | null
  kjop: Kjop[]
  winners?: Winner[]
}

type ApiErr = { ok?: false; feil?: string }

function formatDateTime(iso?: string | null) {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString("nb-NO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function AdminLoddPage() {
  const router = useRouter()
  const [state, setState] = useState<State>({ type: "loading" })
  const [creating, setCreating] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const [tittel, setTittel] = useState("Månedslotteri")
  const [ticketPrice, setTicketPrice] = useState("20")
  const [durationDays, setDurationDays] = useState("14")
  const [selectedLotteriId, setSelectedLotteriId] = useState<string>("")
  const [editLotteriTittel, setEditLotteriTittel] = useState("")
  const [editLotteriBeskrivelse, setEditLotteriBeskrivelse] = useState("")
  const [editLotteriTicketPrice, setEditLotteriTicketPrice] = useState("")
  const [editingPremieId, setEditingPremieId] = useState<string | null>(null)
  const [editTittel, setEditTittel] = useState("")
  const [editSponsorNavn, setEditSponsorNavn] = useState("")
  const [editSponsorOrgnr, setEditSponsorOrgnr] = useState("")
  const [editSponsorNettsted, setEditSponsorNettsted] = useState("")
  const [editVerdi, setEditVerdi] = useState("")
  const [editAdminNotat, setEditAdminNotat] = useState("")
  const [kjopPhone, setKjopPhone] = useState("")
  const [kjopAntall, setKjopAntall] = useState("1")
  const [kjopMetode, setKjopMetode] = useState<"vipps" | "kontant">("vipps")
  const [kjopVippsRef, setKjopVippsRef] = useState("")
  const [kjopBetalt, setKjopBetalt] = useState(true)
  const [creatingKjop, setCreatingKjop] = useState(false)

  const selectedPremieSet = useMemo(() => {
    if (state.type !== "ready") return new Set<string>()
    return new Set((state.activePremier ?? []).map((p) => String(p.premie_id ?? "")))
  }, [state])

  const lotteriById = useMemo(() => {
    if (state.type !== "ready") return new Map<string, Lotteri>()
    return new Map(state.lotterier.map((l) => [l.id, l]))
  }, [state])

  const reservedLotteriIdByPremieId = useMemo(() => {
    if (state.type !== "ready") return new Map<string, string>()
    const m = new Map<string, string>()
    for (const link of state.premieLinks ?? []) {
      const premieId = String(link.premie_id ?? "").trim()
      const lotteriId = String(link.lotteri_id ?? "").trim()
      if (!premieId || !lotteriId) continue
      const lotteri = lotteriById.get(lotteriId)
      const st = String(lotteri?.status ?? "").trim()
      if (!st || st === "ended") continue
      if (!m.has(premieId)) m.set(premieId, lotteriId)
    }
    return m
  }, [state, lotteriById])

  const selectedLotteri = useMemo(() => {
    if (state.type !== "ready") return null
    const id = String(selectedLotteriId ?? "").trim()
    if (!id) return null
    return state.lotterier.find((l) => l.id === id) ?? null
  }, [state, selectedLotteriId])

  useEffect(() => {
    if (state.type !== "ready") return
    if (!selectedLotteri) return
    setEditLotteriTittel(String(selectedLotteri.tittel ?? ""))
    setEditLotteriBeskrivelse(String(selectedLotteri.beskrivelse ?? ""))
    setEditLotteriTicketPrice(
      selectedLotteri.ticket_price != null ? String(Number(selectedLotteri.ticket_price)) : ""
    )
  }, [state, selectedLotteri])

  const hent = useCallback(
    async (lotteriId?: string) => {
    setActionError(null)
    const q = lotteriId ? `&lotteriId=${encodeURIComponent(lotteriId)}` : ""
    const res = await fetch(`/api/admin/lodd?ts=${Date.now()}${q}`, { cache: "no-store" })
    if (res.status === 401) {
      router.push("/admin/login")
      router.refresh()
      return
    }
    const data = (await res.json()) as ApiOk | ApiErr
    if (!res.ok || !data.ok) {
      setState({ type: "error", message: (data as ApiErr).feil ?? "Kunne ikke hente loddsalg." })
      return
    }
    const role = (data as ApiOk).role ?? "admin"
    const lotterier = (data as ApiOk).lotterier ?? []
    const activeLotteri = (data as ApiOk).activeLotteri ?? null
    const premier = (data as ApiOk).premier ?? []
    const activePremier = (data as ApiOk).activePremier ?? []
    const premieLinks = (data as ApiOk).premieLinks ?? []
    const kjop = (data as ApiOk).kjop ?? []
    const winners = (data as ApiOk).winners ?? []
    setState({
      type: "ready",
      role,
      lotterier,
      activeLotteri,
      premier,
      activePremier,
      premieLinks,
      kjop,
      winners,
    })

    const nextSelected =
      String((data as ApiOk).selectedLotteriId ?? "").trim() ||
      String(activeLotteri?.id ?? "").trim() ||
      String(lotterier.find((l) => l.status === "draft")?.id ?? "").trim()

    setSelectedLotteriId((prev) => prev || nextSelected)
  },
    [router]
  )

  useEffect(() => {
    const id = setTimeout(() => {
      hent().catch(() => setState({ type: "error", message: "Kunne ikke hente loddsalg." }))
    }, 0)
    return () => clearTimeout(id)
  }, [hent])

  async function doAction(body: Record<string, unknown>) {
    setActionError(null)
    const res = await fetch("/api/admin/lodd", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = (await res.json()) as { ok?: boolean; feil?: string }
    if (!res.ok || !data.ok) {
      setActionError(data.feil ?? "Noe gikk galt.")
      return false
    }
    await hent(selectedLotteriId || undefined)
    return true
  }

  async function createLotteri() {
    const price = Number(ticketPrice.replace(",", "."))
    if (!Number.isFinite(price) || price <= 0) {
      setActionError("Ugyldig pris per lodd.")
      return
    }
    setCreating(true)
    try {
      await doAction({
        action: "createLotteri",
        tittel,
        ticketPrice: price,
      })
    } finally {
      setCreating(false)
    }
  }

  async function updateLotteri() {
    const id = String(selectedLotteriId ?? "").trim()
    if (!id) return
    const priceRaw = editLotteriTicketPrice.replace(",", ".").trim()
    const price = priceRaw ? Number(priceRaw) : NaN
    await doAction({
      action: "updateLotteri",
      lotteriId: id,
      tittel: editLotteriTittel,
      beskrivelse: editLotteriBeskrivelse,
      ticketPrice: Number.isFinite(price) ? price : undefined,
    })
  }

  async function activateLotteri(id: string) {
    const days = Math.floor(Number(durationDays))
    await doAction({
      action: "activateLotteri",
      lotteriId: id,
      durationDays: Number.isFinite(days) && days > 0 ? days : 14,
    })
  }

  async function endLotteri(id: string) {
    await doAction({ action: "endLotteri", lotteriId: id })
  }

  async function drawWinner(id: string) {
    await doAction({ action: "drawWinner", lotteriId: id })
  }

  async function publishPremie(premieId: string, isHovedpremie: boolean) {
    const lotteriId = selectedLotteriId || (state.type === "ready" ? state.activeLotteri?.id ?? "" : "")
    if (!lotteriId) {
      setActionError("Velg et lotteri først.")
      return
    }
    await doAction({
      action: "publishPremie",
      premieId,
      lotteriId,
      isHovedpremie,
      sortOrder: 0,
    })
  }

  async function unpublishPremie(premieId: string) {
    const lotteriId = selectedLotteriId || (state.type === "ready" ? state.activeLotteri?.id ?? "" : "")
    if (!lotteriId) {
      setActionError("Velg et lotteri først.")
      return
    }
    await doAction({ action: "unpublishPremie", premieId, lotteriId })
  }

  async function markPaid(kjopId: string) {
    await doAction({ action: "markPaid", kjopId })
  }

  async function createKjop() {
    const lotteriId = selectedLotteriId || ""
    if (!lotteriId) {
      setActionError("Velg et lotteri først.")
      return
    }

    const antall = Math.floor(Number(kjopAntall))
    if (!Number.isFinite(antall) || antall < 1) {
      setActionError("Ugyldig antall.")
      return
    }

    setCreatingKjop(true)
    try {
      const ok = await doAction({
        action: "createKjop",
        lotteriId,
        phone: kjopPhone,
        antall,
        metode: kjopMetode,
        vippsRef: kjopVippsRef,
        paid: kjopBetalt,
      })
      if (ok) {
        setKjopPhone("")
        setKjopAntall("1")
        setKjopVippsRef("")
        setKjopBetalt(true)
        setKjopMetode("vipps")
      }
    } finally {
      setCreatingKjop(false)
    }
  }

  async function toggleUtlevert(premieId: string) {
    const lotteriId = selectedLotteriId || ""
    if (!lotteriId) {
      setActionError("Velg et lotteri først.")
      return
    }
    await doAction({ action: "togglePremieUtlevert", premieId, lotteriId })
  }

  async function updatePremie(premieId: string) {
    await doAction({
      action: "updatePremie",
      premieId,
      tittel: editTittel,
      sponsor_navn: editSponsorNavn,
      sponsor_orgnr: editSponsorOrgnr,
      sponsor_nettsted: editSponsorNettsted,
      verdi: editVerdi,
      admin_notat: editAdminNotat,
    })
    setEditingPremieId(null)
  }

  async function deleteRow(type: "premie" | "kjop" | "lotteri", id: string) {
    if (state.type !== "ready") return
    if (state.role !== "superadmin") return
    if (!confirm("Slette dette?")) return

    setActionError(null)
    const res = await fetch("/api/admin/lodd", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, id }),
    })
    const data = (await res.json()) as { ok?: boolean; feil?: string }
    if (!res.ok || !data.ok) {
      setActionError(data.feil ?? "Kunne ikke slette.")
      return
    }
    await hent()
  }

  return (
    <div className="space-y-8">
          <header className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Loddsalg</h1>
            <p className="max-w-3xl text-muted-foreground">
              Administrer premiearkiv, lotterier, salg og trekking.
            </p>
          </header>

          {actionError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {actionError}
            </div>
          ) : null}

          {state.type === "loading" ? (
            <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
              Laster…
            </div>
          ) : null}

          {state.type === "error" ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">
              {state.message}
            </div>
          ) : null}

          {state.type === "ready" ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="rounded-2xl border bg-card p-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold">Lotteri</h2>
                  <Button variant="outline" onClick={() => hent()} disabled={state.type !== "ready"}>
                    Oppdater
                  </Button>
                </div>

                <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                  <div>
                    <span className="font-medium text-foreground">Aktivt lotteri:</span>{" "}
                    {state.activeLotteri ? state.activeLotteri.tittel : "Ingen"}
                  </div>
                  {state.activeLotteri ? (
                    <div className="space-y-1">
                      <div>
                        <span className="font-medium text-foreground">Per lodd:</span>{" "}
                        {Number(state.activeLotteri.ticket_price ?? 20)} kr
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Start:</span>{" "}
                        {formatDateTime(state.activeLotteri.start_at ?? null)}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Slutt:</span>{" "}
                        {formatDateTime(state.activeLotteri.end_at ?? null)}
                      </div>
                      {state.activeLotteri.winner_loddnr ? (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-emerald-900">
                          <span className="font-medium">Vinner:</span> #{state.activeLotteri.winner_loddnr} ·{" "}
                          {state.activeLotteri.winner_phone}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="mt-6 rounded-xl border bg-background p-4">
                  <div className="text-sm font-medium">Opprett nytt lotteri (utkast)</div>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="lotteri_tittel">Tittel</Label>
                      <Input
                        id="lotteri_tittel"
                        value={tittel}
                        onChange={(e) => setTittel(e.target.value)}
                        placeholder="Månedslotteri"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ticket_price">Pris per lodd (NOK)</Label>
                      <Input
                        id="ticket_price"
                        value={ticketPrice}
                        onChange={(e) => setTicketPrice(e.target.value)}
                        inputMode="decimal"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="duration_days">Salg (dager)</Label>
                      <Input
                        id="duration_days"
                        value={durationDays}
                        onChange={(e) => setDurationDays(e.target.value)}
                        inputMode="numeric"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Button onClick={createLotteri} disabled={creating}>
                        {creating ? "Oppretter…" : "Opprett lotteri"}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  <div className="text-sm font-medium">Velg lotteri</div>
                  <select
                    className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
                    value={selectedLotteriId}
                    onChange={(e) => {
                      const next = e.target.value
                      setSelectedLotteriId(next)
                      hent(next).catch(() => setActionError("Kunne ikke hente loddsalg."))
                    }}
                  >
                    <option value="">—</option>
                    {state.lotterier.some((l) => l.status !== "ended") ? (
                      <optgroup label="Aktive/utkast">
                        {state.lotterier
                          .filter((l) => l.status !== "ended")
                          .map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.tittel ?? "Lotteri"} · {l.status}
                            </option>
                          ))}
                      </optgroup>
                    ) : null}
                    {state.lotterier.some((l) => l.status === "ended") ? (
                      <optgroup label="Lotteriarkiv">
                        {state.lotterier
                          .filter((l) => l.status === "ended")
                          .map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.tittel ?? "Lotteri"} · {l.status}
                            </option>
                          ))}
                      </optgroup>
                    ) : null}
                  </select>
                  <div className="flex flex-wrap gap-2">
                    {selectedLotteriId ? (
                      <>
                        <Button variant="outline" onClick={() => activateLotteri(selectedLotteriId)}>
                          Start
                        </Button>
                        <Button variant="outline" onClick={() => endLotteri(selectedLotteriId)}>
                          Avslutt
                        </Button>
                        <Button variant="outline" onClick={() => drawWinner(selectedLotteriId)}>
                          Trekk vinner
                        </Button>
                        {state.role === "superadmin" ? (
                          <Button variant="destructive" onClick={() => deleteRow("lotteri", selectedLotteriId)}>
                            Slett lotteri
                          </Button>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                  {state.winners.length ? (
                    <div className="rounded-xl border bg-muted/30 p-4 text-sm">
                      <div className="font-medium">Vinnere</div>
                      <div className="mt-2 space-y-1 text-muted-foreground">
                        {state.winners.map((w, idx) => (
                          <div key={`${w.winner_loddnr ?? "?"}-${idx}`}>
                            #{w.winner_loddnr ?? "?"} · {w.winner_phone ?? "?"}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {selectedLotteriId ? (
                    <div className="rounded-xl border bg-background p-4">
                      <div className="text-sm font-medium">Rediger valgt lotteri</div>
                      <div className="mt-3 grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="edit_lotteri_tittel">Tittel</Label>
                          <Input
                            id="edit_lotteri_tittel"
                            value={editLotteriTittel}
                            onChange={(e) => setEditLotteriTittel(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit_lotteri_price">Pris per lodd (NOK)</Label>
                          <Input
                            id="edit_lotteri_price"
                            value={editLotteriTicketPrice}
                            onChange={(e) => setEditLotteriTicketPrice(e.target.value)}
                            inputMode="decimal"
                          />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="edit_lotteri_desc">Beskrivelse</Label>
                          <Input
                            id="edit_lotteri_desc"
                            value={editLotteriBeskrivelse}
                            onChange={(e) => setEditLotteriBeskrivelse(e.target.value)}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Button variant="outline" onClick={updateLotteri}>
                            Lagre endringer
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="rounded-2xl border bg-card p-6">
                <h2 className="text-lg font-semibold">Premiearkiv</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Velg lotteri til venstre og reserver premier til det. Reserverte premier kan ikke brukes i flere lotterier samtidig.
                </p>

                <div className="mt-4 space-y-3">
                  {state.premier.length ? (
                    state.premier.map((p) => {
                      const selectedIsEnded = String(selectedLotteri?.status ?? "") === "ended"
                      const inSelected = selectedPremieSet.has(p.id)
                      if (selectedIsEnded && !inSelected) return null
                      const isArchived = String(p.status ?? "") === "arkivert" || String(p.status ?? "") === "utlevert"
                      if (!selectedIsEnded && isArchived && !inSelected) return null

                      const reservedLotteriId = reservedLotteriIdByPremieId.get(p.id) ?? ""
                      const reservedLotteri = reservedLotteriId ? lotteriById.get(reservedLotteriId) ?? null : null
                      const reservedTitle = String(reservedLotteri?.tittel ?? "").trim()
                      const reservedStatus = String(reservedLotteri?.status ?? "").trim()
                      const isReservedElsewhere = !!reservedLotteriId && reservedLotteriId !== selectedLotteriId
                      const isDelivered = String(p.status ?? "") === "utlevert"
                      const isEditing = editingPremieId === p.id

                      return (
                        <div key={p.id} className="rounded-xl border bg-background p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-medium">{p.tittel ?? "Premie"}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {formatDateTime(p.created_at ?? null)}
                                {p.status ? ` · ${p.status}` : ""}
                                {p.submitted_by_epost ? ` · ${p.submitted_by_epost}` : ""}
                              </div>
                              {selectedIsEnded ? (
                                <div className="mt-2 text-sm text-muted-foreground">
                                  Lotteriarkiv:{" "}
                                  <span className="font-medium text-foreground">{String(selectedLotteri?.tittel ?? "Lotteri")}</span>
                                </div>
                              ) : reservedLotteriId ? (
                                <div className="mt-2 text-sm text-muted-foreground">
                                  Reservert til:{" "}
                                  <span className="font-medium text-foreground">
                                    {reservedTitle || "Lotteri"}
                                    {reservedStatus ? ` · ${reservedStatus}` : ""}
                                  </span>
                                </div>
                              ) : (
                                <div className="mt-2 text-sm text-muted-foreground">Reservert til: ingen</div>
                              )}
                              {p.sponsor_navn ? (
                                <div className="mt-2 text-sm text-muted-foreground">
                                  Sponsor:{" "}
                                  {p.sponsor_nettsted ? (
                                    <a
                                      className="underline underline-offset-4 hover:text-foreground"
                                      href={p.sponsor_nettsted}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      {p.sponsor_navn}
                                    </a>
                                  ) : (
                                    p.sponsor_navn
                                  )}
                                </div>
                              ) : null}
                            </div>
                            {p.image_url ? (
                              <div className="h-16 w-20 overflow-hidden rounded-lg border bg-muted/20">
                                <img src={p.image_url} alt={p.tittel ?? "Premie"} className="h-full w-full object-cover" />
                              </div>
                            ) : null}
                          </div>
                          {isEditing ? (
                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                              <div className="space-y-1 sm:col-span-2">
                                <Label htmlFor={`premie_tittel_${p.id}`}>Tittel</Label>
                                <Input
                                  id={`premie_tittel_${p.id}`}
                                  value={editTittel}
                                  onChange={(e) => setEditTittel(e.target.value)}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor={`premie_sponsor_${p.id}`}>Sponsor</Label>
                                <Input
                                  id={`premie_sponsor_${p.id}`}
                                  value={editSponsorNavn}
                                  onChange={(e) => setEditSponsorNavn(e.target.value)}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor={`premie_orgnr_${p.id}`}>Org.nr</Label>
                                <Input
                                  id={`premie_orgnr_${p.id}`}
                                  value={editSponsorOrgnr}
                                  onChange={(e) => setEditSponsorOrgnr(e.target.value)}
                                />
                              </div>
                              <div className="space-y-1 sm:col-span-2">
                                <Label htmlFor={`premie_url_${p.id}`}>Nettside</Label>
                                <Input
                                  id={`premie_url_${p.id}`}
                                  value={editSponsorNettsted}
                                  onChange={(e) => setEditSponsorNettsted(e.target.value)}
                                  placeholder="https://"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor={`premie_verdi_${p.id}`}>Verdi (kr)</Label>
                                <Input
                                  id={`premie_verdi_${p.id}`}
                                  value={editVerdi}
                                  onChange={(e) => setEditVerdi(e.target.value)}
                                  inputMode="decimal"
                                />
                              </div>
                              <div className="space-y-1 sm:col-span-2">
                                <Label htmlFor={`premie_notat_${p.id}`}>Admin-notat</Label>
                                <Input
                                  id={`premie_notat_${p.id}`}
                                  value={editAdminNotat}
                                  onChange={(e) => setEditAdminNotat(e.target.value)}
                                />
                              </div>
                            </div>
                          ) : null}
                          <div className="mt-3 flex flex-wrap gap-2">
                            {selectedIsEnded ? (
                              inSelected ? (
                                <Button variant="outline" onClick={() => toggleUtlevert(p.id)}>
                                  {isDelivered ? "Ikke utlevert" : "Utlevert"}
                                </Button>
                              ) : null
                            ) : inSelected ? (
                              <Button variant="outline" onClick={() => unpublishPremie(p.id)}>
                                Fjern fra valgt lotteri
                              </Button>
                            ) : !selectedLotteriId ? (
                              <Button variant="outline" disabled>
                                Velg lotteri
                              </Button>
                            ) : isReservedElsewhere ? (
                              <Button variant="outline" disabled>
                                Reservert i annet lotteri
                              </Button>
                            ) : (
                              <>
                                <Button variant="outline" onClick={() => publishPremie(p.id, false)}>
                                  Reserver
                                </Button>
                                <Button variant="outline" onClick={() => publishPremie(p.id, true)}>
                                  Hovedpremie
                                </Button>
                              </>
                            )}
                            {!isEditing ? (
                              <Button
                                variant="outline"
                                onClick={() => {
                                  setEditingPremieId(p.id)
                                  setEditTittel(String(p.tittel ?? ""))
                                  setEditSponsorNavn(String(p.sponsor_navn ?? ""))
                                  setEditSponsorOrgnr(String(p.sponsor_orgnr ?? ""))
                                  setEditSponsorNettsted(String(p.sponsor_nettsted ?? ""))
                                  setEditVerdi(p.verdi != null ? String(p.verdi) : "")
                                  setEditAdminNotat(String(p.admin_notat ?? ""))
                                }}
                              >
                                Rediger
                              </Button>
                            ) : (
                              <>
                                <Button variant="outline" onClick={() => updatePremie(p.id)}>
                                  Lagre
                                </Button>
                                <Button variant="outline" onClick={() => setEditingPremieId(null)}>
                                  Avbryt
                                </Button>
                              </>
                            )}
                            {state.role === "superadmin" ? (
                              <Button variant="destructive" onClick={() => deleteRow("premie", p.id)}>
                                Slett
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
                      Ingen premier registrert ennå.
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-2xl border bg-card p-6 lg:col-span-2">
                <h2 className="text-lg font-semibold">Salg (valgt lotteri)</h2>
                {selectedLotteriId ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Registrer kjøp her. Vipps kan bruke en referanse, kontant kan registreres direkte som betalt.
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">Velg et lotteri for å se salg.</p>
                )}

                <div className="mt-4 space-y-3">
                  {selectedLotteriId ? (
                    <div className="rounded-xl border bg-background p-4">
                      <div className="text-sm font-medium">Registrer kjøp</div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-4">
                        <div className="space-y-1 sm:col-span-2">
                          <Label htmlFor="kjop_phone">Telefon</Label>
                          <Input
                            id="kjop_phone"
                            value={kjopPhone}
                            onChange={(e) => setKjopPhone(e.target.value)}
                            inputMode="tel"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="kjop_antall">Antall</Label>
                          <Input
                            id="kjop_antall"
                            value={kjopAntall}
                            onChange={(e) => setKjopAntall(e.target.value)}
                            inputMode="numeric"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="kjop_metode">Betaling</Label>
                          <select
                            id="kjop_metode"
                            className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
                            value={kjopMetode}
                            onChange={(e) => setKjopMetode(e.target.value === "kontant" ? "kontant" : "vipps")}
                          >
                            <option value="vipps">Vipps</option>
                            <option value="kontant">Kontant</option>
                          </select>
                        </div>
                        {kjopMetode === "vipps" ? (
                          <div className="space-y-1 sm:col-span-4">
                            <Label htmlFor="kjop_vipps_ref">Vipps ref (valgfritt)</Label>
                            <Input
                              id="kjop_vipps_ref"
                              value={kjopVippsRef}
                              onChange={(e) => setKjopVippsRef(e.target.value)}
                              placeholder="Hvis tomt, lages automatisk"
                            />
                          </div>
                        ) : null}
                        <div className="sm:col-span-4">
                          <label className="inline-flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={kjopBetalt}
                              onChange={(e) => setKjopBetalt(e.target.checked)}
                            />
                            Registrer som betalt
                          </label>
                        </div>
                        <div className="sm:col-span-4">
                          <Button variant="outline" onClick={createKjop} disabled={creatingKjop}>
                            {creatingKjop ? "Lagrer…" : "Registrer"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {state.kjop.length ? (
                    state.kjop.map((k) => (
                      <div key={k.id} className="rounded-xl border bg-background p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="text-sm">
                            <span className="font-medium">#{k.ticket_from ?? "?"}–{k.ticket_to ?? "?"}</span>
                            <span className="ml-2 text-muted-foreground">
                              {k.phone} · {k.antall} lodd · {Number(k.belop ?? 0)} kr · {k.status}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {k.status !== "paid" ? (
                              <Button variant="outline" onClick={() => markPaid(k.id)}>
                                Marker betalt
                              </Button>
                            ) : null}
                            {state.role === "superadmin" ? (
                              <Button variant="destructive" onClick={() => deleteRow("kjop", k.id)}>
                                Slett
                              </Button>
                            ) : null}
                          </div>
                        </div>
                        {k.vipps_ref ? (
                          <div className="mt-2 text-xs text-muted-foreground">Vipps ref: {k.vipps_ref}</div>
                        ) : null}
                        {k.paid_at ? (
                          <div className="mt-1 text-xs text-muted-foreground">Betalt: {formatDateTime(k.paid_at)}</div>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
                      Ingen kjøp registrert.
                    </div>
                  )}
                </div>
              </section>
            </div>
          ) : null}
    </div>
  )
}
