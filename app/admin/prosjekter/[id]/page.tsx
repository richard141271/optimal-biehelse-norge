"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

type Prosjekt = {
  id: string
  created_at?: string
  medlemsnummer?: number | null
  navn?: string
  epost?: string
  telefon?: string | null
  tittel?: string
  sted?: string
  budsjett?: number | null
  beskrivelse?: string
  status?: string | null
  vedlegg_signed_urls?: string[] | null
  admin_svar?: string | null
  admin_svar_at?: string | null
  admin_svar_sent_at?: string | null
  admin_intern_notat?: string | null
  admin_intern_notat_at?: string | null
  avsluttet_at?: string | null
  avsluttet_resultat?: string[] | null
  avsluttet_kommentar?: string | null
  hendelser?: Array<{
    id?: string
    created_at?: string
    type?: string
    message?: string | null
    actor_email?: string | null
  }>
}

type State =
  | { type: "loading" }
  | { type: "error"; message: string; status?: number }
  | { type: "ready"; prosjekt: Prosjekt }

function formatDato(value?: string) {
  if (!value) return ""
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  return new Intl.DateTimeFormat("nb-NO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
}

function formatBelop(value?: number | null) {
  if (value === null || value === undefined) return "—"
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
  }).format(value)
}

const statusOptions = [
  { value: "mottatt", label: "mottatt" },
  { value: "under behandling", label: "under behandling" },
  { value: "godkjent", label: "godkjent" },
  { value: "avslått", label: "avslått" },
  { value: "avsluttet", label: "avsluttet" },
]

const resultatAlternativer: Array<{ value: string; label: string; hint?: string }> = [
  { value: "gikk_bra", label: "Gikk bra / som planlagt" },
  { value: "noen_utfordringer", label: "Noen utfordringer" },
  { value: "fiasko", label: "Fiasko / langt fra planlagt" },
  { value: "dyrt", label: "Dyrt / over budsjett" },
  { value: "billigere", label: "Billigere enn planlagt" },
  { value: "vanskelig", label: "Vanskelig å gjennomføre" },
  { value: "ekstraarbeid", label: "Mye ekstraarbeid" },
  { value: "bra_samarbeid", label: "Flott samarbeid med søker" },
  { value: "materiale_vanskelig", label: "Vanskelig å få tak i materialer" },
]

const defaultTakksvar = (tittel: string) =>
  `Takk at dere ville dele prosjektet ${tittel ? `"${tittel}"` : ""} med oss! Det har vært en utrolig fin opplevelse å være med, og vi ser frem til mange lignende prosjekter videre. Fortsett det gode arbeidet! 😊`


export default function AdminProsjektDetailPage() {
  const params = useParams<{ id?: string }>()
  const prosjektId = String(params?.id ?? "").trim()
  const router = useRouter()

  const [state, setState] = useState<State>({ type: "loading" })
  const [status, setStatus] = useState<string>("mottatt")
  const [svar, setSvar] = useState("")
  const [internNotat, setInternNotat] = useState("")
  const [valgteResultat, setValgteResultat] = useState<string[]>([])
  const [avsluttKommentar, setAvsluttKommentar] = useState("")
  const [sendTakksvar, setSendTakksvar] = useState(false)
  const [takksvarTekst, setTakksvarTekst] = useState("")
  const [savingStatus, setSavingStatus] = useState(false)
  const [sendingSvar, setSendingSvar] = useState(false)
  const [savingInternNotat, setSavingInternNotat] = useState(false)
  const [avslutter, setAvslutter] = useState(false)
  const [apnerIgjen, setApnerIgjen] = useState(false)
  const [info, setInfo] = useState<string | null>(null)
  const [minRolle, setMinRolle] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const selectClassName = useMemo(
    () =>
      "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80",
    []
  )

  const hent = useCallback(async () => {
    setState({ type: "loading" })
    setInfo(null)
    const res = await fetch(`/api/admin/prosjekter/${encodeURIComponent(prosjektId)}?ts=${Date.now()}`, {
      cache: "no-store",
    })
    const payload = (await res.json()) as {
      ok?: boolean
      feil?: string
      prosjekt?: Prosjekt
      schemaWarning?: string | null
    }
    if (!res.ok || !payload.ok || !payload.prosjekt) {
      setState({
        type: "error",
        message: payload.feil ?? "Kunne ikke hente prosjekt.",
        status: res.status,
      })
      return
    }
    setState({ type: "ready", prosjekt: payload.prosjekt })
    setStatus(String(payload.prosjekt.status ?? "mottatt"))
    setSvar(String(payload.prosjekt.admin_svar ?? ""))
    setInternNotat(String(payload.prosjekt.admin_intern_notat ?? ""))
    setValgteResultat(
      Array.isArray(payload.prosjekt.avsluttet_resultat)
        ? (payload.prosjekt.avsluttet_resultat as string[]).filter(Boolean)
        : []
    )
    setAvsluttKommentar(String(payload.prosjekt.avsluttet_kommentar ?? ""))
    setTakksvarTekst(defaultTakksvar(String(payload.prosjekt.tittel ?? "")))
    if (payload.schemaWarning) {
      setInfo(payload.schemaWarning)
    }
  }, [prosjektId])

  useEffect(() => {
    if (!prosjektId) return
    const id = setTimeout(() => void hent(), 0)
    return () => clearTimeout(id)
  }, [hent, prosjektId])

  useEffect(() => {
    let active = true
    fetch(`/api/admin/me?ts=${Date.now()}`, { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json()) as { ok?: boolean; role?: string | null }
        if (!active) return
        setMinRolle(data.ok ? (data.role ?? null) : null)
      })
      .catch(() => {
        if (!active) return
        setMinRolle(null)
      })
    return () => {
      active = false
    }
  }, [])

  async function apneVedlegg(url: string) {
    window.open(url, "_blank", "noopener,noreferrer")
  }

  const slettProsjekt = useCallback(async () => {
    if (deleting) return
    if (minRolle !== "superadmin") return
    if (state.type !== "ready") return

    const label = [
      formatDato(state.prosjekt.created_at) || null,
      state.prosjekt.tittel ?? null,
      state.prosjekt.navn ?? null,
    ]
      .filter(Boolean)
      .join(" · ")

    const ok = confirm(
      `Slette dette prosjektet?\n\n${label}\n\nDette sletter også vedlegg. Handlingen er uomgjørlig.`
    )
    if (!ok) return

    setDeleting(true)
    try {
      const res = await fetch(
        `/api/admin/prosjekter/${encodeURIComponent(prosjektId)}`,
        { method: "DELETE" }
      )
      const data = (await res.json()) as { ok?: boolean; feil?: string }
      if (!res.ok || !data.ok) {
        setInfo(data.feil ?? `Kunne ikke slette prosjekt. (HTTP ${res.status})`)
        return
      }
      router.push("/admin/prosjekter")
      router.refresh()
    } finally {
      setDeleting(false)
    }
  }, [deleting, minRolle, prosjektId, router, state])

  async function endreStatus() {
    if (state.type !== "ready" || savingStatus) return
    setSavingStatus(true)
    setSavingStatus(true)
    setInfo(null)
    try {
      const res = await fetch(`/api/admin/prosjekter/${encodeURIComponent(prosjektId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      const data = (await res.json()) as { ok?: boolean; feil?: string; schemaWarning?: string | null }
      if (!res.ok || !data.ok) {
        setInfo(data.feil ?? "Kunne ikke oppdatere status.")
        return
      }
      setInfo("Status oppdatert.")
      if (data.schemaWarning) setInfo(data.schemaWarning)
      await hent()
    } finally {
      setSavingStatus(false)
    }
  }

  async function sendSvar() {
    if (state.type !== "ready" || sendingSvar) return
    const tekst = svar.trim()
    if (!tekst) {
      setInfo("Skriv et svar før du sender.")
      return
    }
    setSendingSvar(true)
    setInfo(null)
    try {
      const res = await fetch(`/api/admin/prosjekter/${encodeURIComponent(prosjektId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ svar: tekst, send: true }),
      })
      const data = (await res.json()) as { ok?: boolean; feil?: string; schemaWarning?: string | null }
      if (!res.ok || !data.ok) {
        setInfo(data.feil ?? "Kunne ikke sende svar.")
        return
      }
      setInfo("Svar sendt.")
      if (data.schemaWarning) setInfo(data.schemaWarning)
      await hent()
    } finally {
      setSendingSvar(false)
    }
  }

  async function lagreInternNotat() {
    if (state.type !== "ready" || savingInternNotat) return
    setSavingInternNotat(true)
    setInfo(null)
    try {
      const res = await fetch(`/api/admin/prosjekter/${encodeURIComponent(prosjektId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intern_notat: internNotat }),
      })
      const data = (await res.json()) as { ok?: boolean; feil?: string; schemaWarning?: string | null }
      if (!res.ok || !data.ok) {
        setInfo(data.feil ?? "Kunne ikke lagre internnotat.")
        return
      }
      setInfo("Internnotat lagret.")
      if (data.schemaWarning) setInfo(data.schemaWarning)
      await hent()
    } finally {
      setSavingInternNotat(false)
    }
  }

  function toggleResultat(value: string) {
    setValgteResultat((prev) => {
      const set = new Set(prev)
      if (set.has(value)) set.delete(value)
      else set.add(value)
      return Array.from(set)
    })
  }

  async function markerAvslutt() {
    if (state.type !== "ready" || avslutter) return
    if (!valgteResultat.length && !avsluttKommentar.trim()) {
      // tillatt, men bare én av dem må være satt – validering skjer i API.
    }
    setAvslutter(true)
    setInfo(null)
    try {
      const body: {
        avslutt: true
        avsluttet_resultat: string[]
        avsluttet_kommentar?: string
        send_takksvar?: boolean
        takksvar_tekst?: string
      } = {
        avslutt: true,
        avsluttet_resultat: valgteResultat,
      }
      if (avsluttKommentar.trim()) body.avsluttet_kommentar = avsluttKommentar.trim()
      if (sendTakksvar) {
        body.send_takksvar = true
        body.takksvar_tekst = takksvarTekst.trim()
      }
      const res = await fetch(`/api/admin/prosjekter/${encodeURIComponent(prosjektId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = (await res.json()) as { ok?: boolean; feil?: string; schemaWarning?: string | null }
      if (!res.ok || !data.ok) {
        setInfo(data.feil ?? "Kunne ikke avslutte prosjektet.")
        return
      }
      setInfo("Prosjektet er nå avsluttet.")
      if (data.schemaWarning) setInfo(data.schemaWarning)
      await hent()
    } finally {
      setAvslutter(false)
    }
  }

  async function apneIgjen() {
    if (state.type !== "ready" || apnerIgjen) return
    setApnerIgjen(true)
    setInfo(null)
    try {
      const res = await fetch(`/api/admin/prosjekter/${encodeURIComponent(prosjektId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aapne: true }),
      })
      const data = (await res.json()) as { ok?: boolean; feil?: string; schemaWarning?: string | null }
      if (!res.ok || !data.ok) {
        setInfo(data.feil ?? "Kunne ikke åpne prosjektet igjen.")
        return
      }
      setInfo("Prosjektet er åpnet igjen. Resultatene er beholdt for arkiv, men prosjektet er nå aktivt.")
      if (data.schemaWarning) setInfo(data.schemaWarning)
      await hent()
    } finally {
      setApnerIgjen(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <div className="text-sm text-muted-foreground">
            <Link href="/admin/prosjekter" className="hover:text-foreground">
              Tilbake til prosjekter
            </Link>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Prosjekt</h1>
        </div>
        {state.type === "ready" && minRolle === "superadmin" ? (
          <div className="flex gap-2">
            <Button variant="destructive" onClick={() => void slettProsjekt()} disabled={deleting}>
              Slett prosjekt
            </Button>
          </div>
        ) : null}
      </div>

      {state.type === "loading" ? (
        <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          Laster prosjekt…
        </div>
      ) : null}

      {state.type === "error" ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">
            {state.message}
          </div>
          {state.status === 401 ? (
            <Link
              href={`/min-side/login?next=${encodeURIComponent(`/admin/prosjekter/${prosjektId}`)}`}
              className="text-sm underline underline-offset-4"
            >
              Gå til innlogging
            </Link>
          ) : null}
        </div>
      ) : null}

      {state.type === "ready" ? (
        <div className="space-y-6">
          {info ? (
            <div className="rounded-xl border bg-card p-4 text-sm">{info}</div>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border bg-card p-6">
              <h2 className="text-lg font-semibold">Detaljer</h2>
              <dl className="mt-4 grid gap-3 text-sm">
                <div className="flex items-start justify-between gap-4 border-b pb-3">
                  <dt className="text-muted-foreground">Dato</dt>
                  <dd className="text-right">{formatDato(state.prosjekt.created_at) || "—"}</dd>
                </div>
                <div className="flex items-start justify-between gap-4 border-b pb-3">
                  <dt className="text-muted-foreground">Tittel</dt>
                  <dd className="text-right">{state.prosjekt.tittel ?? "—"}</dd>
                </div>
                <div className="flex items-start justify-between gap-4 border-b pb-3">
                  <dt className="text-muted-foreground">Sted</dt>
                  <dd className="text-right">{state.prosjekt.sted ?? "—"}</dd>
                </div>
                <div className="flex items-start justify-between gap-4 border-b pb-3">
                  <dt className="text-muted-foreground">Ønsket støtte</dt>
                  <dd className="text-right">{formatBelop(state.prosjekt.budsjett)}</dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="text-right">{state.prosjekt.status ?? "mottatt"}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-2xl border bg-card p-6">
              <h2 className="text-lg font-semibold">Kontaktinfo</h2>
              <dl className="mt-4 grid gap-3 text-sm">
                <div className="flex items-start justify-between gap-4 border-b pb-3">
                  <dt className="text-muted-foreground">Navn</dt>
                  <dd className="text-right">{state.prosjekt.navn ?? "—"}</dd>
                </div>
                <div className="flex items-start justify-between gap-4 border-b pb-3">
                  <dt className="text-muted-foreground">E-post</dt>
                  <dd className="text-right">{state.prosjekt.epost ?? "—"}</dd>
                </div>
                <div className="flex items-start justify-between gap-4 border-b pb-3">
                  <dt className="text-muted-foreground">Telefon</dt>
                  <dd className="text-right">{state.prosjekt.telefon ?? "—"}</dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-muted-foreground">Medlemsnr.</dt>
                  <dd className="text-right">{state.prosjekt.medlemsnummer ?? "—"}</dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-6">
            <h2 className="text-lg font-semibold">Beskrivelse</h2>
            <div className="mt-3 whitespace-pre-wrap text-sm">
              {state.prosjekt.beskrivelse ?? "—"}
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-6">
            <h2 className="text-lg font-semibold">Vedlegg</h2>
            <div className="mt-3">
              {Array.isArray(state.prosjekt.vedlegg_signed_urls) &&
              state.prosjekt.vedlegg_signed_urls.length ? (
                <div className="flex flex-wrap gap-2">
                  {state.prosjekt.vedlegg_signed_urls.slice(0, 12).map((url, idx) => (
                    <Button
                      key={`${state.prosjekt.id}-vedlegg-${idx}`}
                      variant="outline"
                      onClick={() => apneVedlegg(url)}
                      className="h-8 px-3 text-sm"
                    >
                      Vedlegg {idx + 1}
                    </Button>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Ingen vedlegg.</div>
              )}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border bg-card p-6">
              <h2 className="text-lg font-semibold">Endre status</h2>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className={selectClassName}
                >
                  {statusOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <Button onClick={endreStatus} disabled={savingStatus}>
                  {savingStatus ? "Lagrer…" : "Endre status"}
                </Button>
              </div>
              {state.prosjekt.avsluttet_at ? (
                <div className="mt-4 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                  Avsluttet: {formatDato(state.prosjekt.avsluttet_at) || "—"}
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border bg-card p-6">
              <h2 className="text-lg font-semibold">Svar til søker</h2>
              <div className="mt-4 space-y-3">
                <Textarea
                  value={svar}
                  onChange={(e) => setSvar(e.target.value)}
                  placeholder="Skriv svar til søker…"
                />
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-muted-foreground">
                    {state.prosjekt.admin_svar_sent_at
                      ? `Sist sendt: ${formatDato(state.prosjekt.admin_svar_sent_at)}`
                      : state.prosjekt.admin_svar_at
                        ? `Sist lagret: ${formatDato(state.prosjekt.admin_svar_at)}`
                        : ""}
                  </div>
                  <Button onClick={sendSvar} disabled={sendingSvar}>
                    {sendingSvar ? "Sender…" : "Send svar"}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {state.prosjekt.avsluttet_at ? (
            <div className="rounded-2xl border bg-emerald-50/40 p-6">
              <h2 className="text-lg font-semibold text-emerald-800">✅ Prosjektet er avsluttet</h2>
              <div className="mt-4 grid gap-6 lg:grid-cols-2">
                <div className="space-y-3">
                  <div className="text-sm">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Resultat
                    </div>
                    {Array.isArray(state.prosjekt.avsluttet_resultat) &&
                    state.prosjekt.avsluttet_resultat.length ? (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {state.prosjekt.avsluttet_resultat.map((k) => {
                          const opt = resultatAlternativer.find((r) => r.value === k)
                          const label = opt?.label ?? k
                          return (
                            <span
                              key={k}
                              className="inline-flex items-center rounded-full border bg-white px-2.5 py-0.5 text-xs"
                            >
                              {label}
                            </span>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="mt-1 text-muted-foreground">Ingen resultatvalget.</div>
                    )}
                  </div>
                  <div className="text-sm">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Kommentar
                    </div>
                    <div className="mt-1 whitespace-pre-wrap">
                      {state.prosjekt.avsluttet_kommentar ?? "Ingen kommentar."}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-start gap-3">
                  <Button variant="outline" onClick={() => void apneIgjen()} disabled={apnerIgjen}>
                    {apnerIgjen ? "Åpner igjen…" : "Åpne prosjektet igjen"}
                  </Button>
                  <div className="text-xs text-muted-foreground">
                    Hvis du åpner igjen beholdes resultatdataene i arkiv, men prosjektet kan
                    endres videre.
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border bg-card p-6">
              <h2 className="text-lg font-semibold">Avslutt prosjekt</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Velg resultatet for hvordan prosjektet gikk. Dataene brukes til å lære av og bygge
                statestikker senere. Feltene er kun synlige for admin – søker ser kun at prosjektet
                er avsluttet.
              </p>
              <div className="mt-4 space-y-5">
                <div>
                  <div className="text-sm font-medium">Resultat (flere kan velges)</div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {resultatAlternativer.map((r) => {
                      const valgt = valgteResultat.includes(r.value)
                      return (
                        <label
                          key={r.value}
                          className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm transition-colors ${
                            valgt
                              ? "border-emerald-500 bg-emerald-50/60"
                              : "hover:bg-muted/40"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 rounded border-input"
                            checked={valgt}
                            onChange={() => toggleResultat(r.value)}
                          />
                          <span>{r.label}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <div className="text-sm font-medium">Kommentar (valgfri)</div>
                  <Textarea
                    className="mt-2 min-h-24"
                    placeholder="Er det mer å si? F.eks. hva vi kunne gjort annerledes, hvilke kontaktpunkter som var gull, osv."
                    value={avsluttKommentar}
                    onChange={(e) => setAvsluttKommentar(e.target.value)}
                  />
                </div>

                <div className="rounded-lg border p-3">
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-input"
                      checked={sendTakksvar}
                      onChange={(e) => setSendTakksvar(e.target.checked)}
                    />
                    <span>
                      Send takke-melding til søker samtidig (valgfritt)
                    </span>
                  </label>
                  {sendTakksvar ? (
                    <div className="mt-3 space-y-2">
                      <Textarea
                        value={takksvarTekst}
                        onChange={(e) => setTakksvarTekst(e.target.value)}
                        placeholder="Skriv en takk-melding som sendes på e-post til søker."
                        className="min-h-28"
                      />
                      <div className="text-xs text-muted-foreground">
                        Tips: E-posten sendes til{" "}
                        <span className="font-mono">{state.prosjekt.epost ?? "mangler e-post"}</span>.
                        Hvis e-post-konfigurasjonen mangler, får du en feilmelding i stedet.
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="flex justify-end">
                  <Button onClick={() => void markerAvslutt()} disabled={avslutter}>
                    {avslutter ? "Lagrer avsluttet-status…" : "Marker som avsluttet"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-2xl border bg-card p-6">
            <h2 className="text-lg font-semibold">Internnotat</h2>
            <div className="mt-2 text-sm text-muted-foreground">
              Kun internt. Ikke synlig for søker.
            </div>
            <div className="mt-4 space-y-3">
              <Textarea
                value={internNotat}
                onChange={(e) => setInternNotat(e.target.value)}
                placeholder="Skriv internnotat for planlegging, kontaktpunkter, beslutninger, osv…"
                className="min-h-28"
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-muted-foreground">
                  {state.prosjekt.admin_intern_notat_at
                    ? `Sist lagret: ${formatDato(state.prosjekt.admin_intern_notat_at)}`
                    : ""}
                </div>
                <Button onClick={lagreInternNotat} disabled={savingInternNotat}>
                  {savingInternNotat ? "Lagrer…" : "Lagre internnotat"}
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-6">
            <h2 className="text-lg font-semibold">Logg</h2>
            <div className="mt-4 space-y-2 text-sm">
              {Array.isArray(state.prosjekt.hendelser) && state.prosjekt.hendelser.length ? (
                state.prosjekt.hendelser.slice(0, 50).map((h, idx) => (
                  <div
                    key={h.id ?? `${idx}`}
                    className="flex flex-col gap-1 border-b pb-2 last:border-b-0 last:pb-0"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium">{h.type ?? "hendelse"}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDato(h.created_at) || "—"}
                      </div>
                    </div>
                    <div className="text-muted-foreground">{h.message ?? "—"}</div>
                  </div>
                ))
              ) : (
                <div className="text-muted-foreground">Ingen logg enda.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
