"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type Medlem = {
  created_at?: string
  medlemsnummer?: number | null
  medlemskap_type?: string | null
  navn?: string | null
  adresse?: string | null
  postnr?: string | null
  sted?: string | null
  epost?: string | null
  telefon?: string | null
  kontingent_betalt_at?: string | null
  kontingent_gyldig_til?: string | null
}

type State =
  | { type: "loading" }
  | { type: "error"; message: string; status?: number }
  | { type: "ready"; medlem: Medlem }

type Prosjekt = {
  id: string
  created_at?: string
  tittel?: string | null
  sted?: string | null
  budsjett?: number | null
  status?: string | null
}

type ProsjekterState =
  | { type: "loading" }
  | { type: "error"; message: string }
  | { type: "ready"; prosjekter: Prosjekt[] }

type SendStatus =
  | { type: "idle" }
  | { type: "sending" }
  | { type: "success" }
  | { type: "error"; message: string }

function formatDate(iso?: string | null) {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("nb-NO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
}

function prisForType(type: string | null | undefined) {
  if (type === "stotte") return 300
  if (type === "bedrift") return 1000
  return 100
}

function labelForType(type: string | null | undefined) {
  if (type === "stotte") return "Støttemedlem"
  if (type === "bedrift") return "Bedriftsmedlem"
  return "Medlem"
}

function isAktiv(gyldigTil?: string | null) {
  if (!gyldigTil) return false
  const d = new Date(gyldigTil)
  if (Number.isNaN(d.getTime())) return false
  return d.getTime() > Date.now()
}

function formatBelop(value?: number | null) {
  if (value === null || value === undefined) return "—"
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
  }).format(value)
}

export default function MinSidePage() {
  const router = useRouter()
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const [state, setState] = useState<State>({ type: "loading" })
  const [isAdmin, setIsAdmin] = useState(false)
  const [prosjekterState, setProsjekterState] = useState<ProsjekterState>({
    type: "loading",
  })

  const [redigerOpen, setRedigerOpen] = useState(false)
  const [redigerNavn, setRedigerNavn] = useState("")
  const [redigerTelefon, setRedigerTelefon] = useState("")
  const [redigerAdresse, setRedigerAdresse] = useState("")
  const [redigerPostnr, setRedigerPostnr] = useState("")
  const [redigerSted, setRedigerSted] = useState("")
  const [nyttPassord, setNyttPassord] = useState("")
  const [nyttPassord2, setNyttPassord2] = useState("")
  const [redigerStatus, setRedigerStatus] = useState<
    | { type: "idle" }
    | { type: "saving" }
    | { type: "success"; message: string }
    | { type: "error"; message: string }
  >({ type: "idle" })

  const [medlemsnummer, setMedlemsnummer] = useState("")
  const [navn, setNavn] = useState("")
  const [epost, setEpost] = useState("")
  const [telefon, setTelefon] = useState("")
  const [tittel, setTittel] = useState("")
  const [sted, setSted] = useState("")
  const [budsjett, setBudsjett] = useState("")
  const [beskrivelse, setBeskrivelse] = useState("")
  const [vedlegg, setVedlegg] = useState<File[]>([])
  const [sendStatus, setSendStatus] = useState<SendStatus>({ type: "idle" })

  useEffect(() => {
    const id = setTimeout(() => {
      ;(async () => {
        if (!supabase) {
          setState({
            type: "error",
            message: "Supabase er ikke konfigurert (mangler miljøvariabler).",
          })
          return
        }

        const res = await fetch("/api/min-side/me", { cache: "no-store" })
        if (res.status === 401) {
          router.push("/min-side/login")
          router.refresh()
          return
        }
        const data = (await res.json()) as {
          ok?: boolean
          feil?: string
          medlem?: Medlem
        }
        if (!res.ok || !data.ok || !data.medlem) {
          setState({
            type: "error",
            message: data.feil ?? "Kunne ikke hente medlemsdata.",
            status: res.status,
          })
          return
        }
        setState({ type: "ready", medlem: data.medlem })
        setMedlemsnummer((prev) =>
          prev ? prev : data.medlem?.medlemsnummer != null ? String(data.medlem.medlemsnummer) : ""
        )
        setNavn((prev) => (prev ? prev : String(data.medlem?.navn ?? "")))
        setEpost((prev) => (prev ? prev : String(data.medlem?.epost ?? "")))
        setTelefon((prev) => (prev ? prev : String(data.medlem?.telefon ?? "")))

        try {
          const roleRes = await fetch(`/api/admin/me?ts=${Date.now()}`, { cache: "no-store" })
          const roleData = (await roleRes.json()) as { ok?: boolean; role?: string | null }
          const role = roleData.role ?? null
          setIsAdmin(role === "admin" || role === "superadmin")
        } catch {
          setIsAdmin(false)
        }
      })()
    }, 0)
    return () => clearTimeout(id)
  }, [router, supabase])

  useEffect(() => {
    if (state.type !== "ready") return
    const id = setTimeout(() => {
      ;(async () => {
        const res = await fetch(`/api/min-side/prosjekter?ts=${Date.now()}`, {
          cache: "no-store",
        })
        const payload = (await res.json()) as {
          ok?: boolean
          feil?: string
          prosjekter?: Prosjekt[]
        }
        if (!res.ok || !payload.ok) {
          setProsjekterState({
            type: "error",
            message: payload.feil ?? "Kunne ikke hente prosjekter.",
          })
          return
        }
        setProsjekterState({
          type: "ready",
          prosjekter: payload.prosjekter ?? [],
        })
      })()
    }, 0)
    return () => clearTimeout(id)
  }, [state.type])

  async function loggUt() {
    if (!supabase) return
    await supabase.auth.signOut()
    router.push("/")
    router.refresh()
  }

  if (state.type === "loading") {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-14 sm:py-20">
        <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          Laster…
        </div>
      </main>
    )
  }

  if (state.type === "error") {
    const manglerMedlem = state.status === 404
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-14 sm:py-20">
        <div className="space-y-4">
          <h1 className="text-3xl font-semibold tracking-tight">Min side</h1>
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">
            {state.message}
          </div>
          <div className="flex gap-2">
            {manglerMedlem ? (
              <Button variant="outline" onClick={() => router.push("/#medlemskap")}>
                Registrer medlemskap
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => router.push("/min-side/login")}
              >
                Gå til innlogging
              </Button>
            )}
            <Button variant="outline" onClick={() => router.push("/")}>
              Til forsiden
            </Button>
          </div>
        </div>
      </main>
    )
  }

  const medlem = state.medlem
  const betaltAt = medlem.kontingent_betalt_at ?? null
  const gyldigTil = medlem.kontingent_gyldig_til ?? null
  const aktiv = isAktiv(gyldigTil)
  const pris = prisForType(medlem.medlemskap_type ?? null)
  const typeLabel = labelForType(medlem.medlemskap_type ?? null)

  function åpneRedigering() {
    setRedigerNavn(String(medlem.navn ?? ""))
    setRedigerTelefon(String(medlem.telefon ?? ""))
    setRedigerAdresse(String(medlem.adresse ?? ""))
    setRedigerPostnr(String(medlem.postnr ?? ""))
    setRedigerSted(String(medlem.sted ?? ""))
    setNyttPassord("")
    setNyttPassord2("")
    setRedigerStatus({ type: "idle" })
    setRedigerOpen(true)
  }

  async function lagreRedigering() {
    if (!supabase) return
    const navnTrim = redigerNavn.trim()
    if (!navnTrim) {
      setRedigerStatus({ type: "error", message: "Navn kan ikke være tomt." })
      return
    }
    const pass1 = nyttPassord.trim()
    const pass2 = nyttPassord2.trim()
    if (pass1 || pass2) {
      if (pass1.length < 8) {
        setRedigerStatus({ type: "error", message: "Passord må være minst 8 tegn." })
        return
      }
      if (pass1 !== pass2) {
        setRedigerStatus({ type: "error", message: "Passordene er ikke like." })
        return
      }
    }

    setRedigerStatus({ type: "saving" })
    try {
      const res = await fetch("/api/min-side/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          navn: navnTrim,
          telefon: redigerTelefon.trim() || null,
          adresse: redigerAdresse.trim() || null,
          postnr: redigerPostnr.trim() || null,
          sted: redigerSted.trim() || null,
        }),
      })
      const data = (await res.json()) as { ok?: boolean; feil?: string; medlem?: Medlem }
      if (!res.ok || !data.ok || !data.medlem) {
        setRedigerStatus({ type: "error", message: data.feil ?? "Kunne ikke lagre opplysninger." })
        return
      }

      setState({ type: "ready", medlem: data.medlem })
      setNavn(navnTrim)
      setTelefon(String(data.medlem.telefon ?? ""))

      if (pass1) {
        const { error } = await supabase.auth.updateUser({ password: pass1 })
        if (error) {
          setRedigerStatus({ type: "error", message: "Opplysninger lagret, men passord kunne ikke endres." })
          return
        }
      }

      setRedigerStatus({ type: "success", message: "Opplysninger lagret." })
      setTimeout(() => setRedigerOpen(false), 500)
    } catch {
      setRedigerStatus({ type: "error", message: "Noe gikk galt. Prøv igjen." })
    }
  }

  async function sendProsjekt(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSendStatus({ type: "sending" })
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
        setSendStatus({
          type: "error",
          message: data.feil ?? "Noe gikk galt. Prøv igjen.",
        })
        return
      }

      setSendStatus({ type: "success" })
      setTittel("")
      setSted("")
      setBudsjett("")
      setBeskrivelse("")
      setVedlegg([])

      setProsjekterState({ type: "loading" })
      const res = await fetch(`/api/min-side/prosjekter?ts=${Date.now()}`, {
        cache: "no-store",
      })
      const payload = (await res.json()) as {
        ok?: boolean
        feil?: string
        prosjekter?: Prosjekt[]
      }
      if (res.ok && payload.ok) {
        setProsjekterState({
          type: "ready",
          prosjekter: payload.prosjekter ?? [],
        })
      } else {
        setProsjekterState({
          type: "error",
          message: payload.feil ?? "Kunne ikke hente prosjekter.",
        })
      }
    } catch {
      setSendStatus({ type: "error", message: "Noe gikk galt. Prøv igjen." })
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-14 sm:py-20">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Min side</h1>
          <p className="text-muted-foreground">
            Oversikt over medlemskapet ditt og medlemskort.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push("/")}>
            Til forsiden
          </Button>
          {isAdmin ? (
            <Button variant="outline" onClick={() => router.push("/admin")}>
              Adminpanel
            </Button>
          ) : null}
          <Button variant="outline" onClick={loggUt} disabled={!supabase}>
            Logg ut
          </Button>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border bg-card p-6">
          <h2 className="text-lg font-semibold">Medlemsinfo</h2>
          {redigerOpen ? (
            <div className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="rediger_navn">Navn</Label>
                  <Input
                    id="rediger_navn"
                    value={redigerNavn}
                    onChange={(e) => setRedigerNavn(e.target.value)}
                    autoComplete="name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rediger_telefon">Telefon</Label>
                  <Input
                    id="rediger_telefon"
                    value={redigerTelefon}
                    onChange={(e) => setRedigerTelefon(e.target.value)}
                    autoComplete="tel"
                    inputMode="tel"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rediger_adresse">Adresse</Label>
                <Input
                  id="rediger_adresse"
                  value={redigerAdresse}
                  onChange={(e) => setRedigerAdresse(e.target.value)}
                  autoComplete="street-address"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="rediger_postnr">Postnr</Label>
                  <Input
                    id="rediger_postnr"
                    value={redigerPostnr}
                    onChange={(e) => setRedigerPostnr(e.target.value)}
                    inputMode="numeric"
                    autoComplete="postal-code"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rediger_sted">Sted</Label>
                  <Input
                    id="rediger_sted"
                    value={redigerSted}
                    onChange={(e) => setRedigerSted(e.target.value)}
                    autoComplete="address-level2"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="nytt_passord">Nytt passord</Label>
                  <Input
                    id="nytt_passord"
                    type="password"
                    value={nyttPassord}
                    onChange={(e) => setNyttPassord(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nytt_passord_2">Gjenta passord</Label>
                  <Input
                    id="nytt_passord_2"
                    type="password"
                    value={nyttPassord2}
                    onChange={(e) => setNyttPassord2(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm">
                  {redigerStatus.type === "error" ? (
                    <span className="text-destructive">{redigerStatus.message}</span>
                  ) : redigerStatus.type === "success" ? (
                    <span className="text-foreground">{redigerStatus.message}</span>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setRedigerOpen(false)
                      setRedigerStatus({ type: "idle" })
                    }}
                    disabled={redigerStatus.type === "saving"}
                  >
                    Avbryt
                  </Button>
                  <Button
                    type="button"
                    onClick={lagreRedigering}
                    disabled={redigerStatus.type === "saving"}
                  >
                    {redigerStatus.type === "saving" ? "Lagrer…" : "Lagre"}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <dl className="mt-4 grid gap-3 text-sm">
                <div className="flex items-start justify-between gap-4 border-b pb-3">
                  <dt className="text-muted-foreground">Navn</dt>
                  <dd className="text-right">{medlem.navn || "—"}</dd>
                </div>
                <div className="flex items-start justify-between gap-4 border-b pb-3">
                  <dt className="text-muted-foreground">E-post</dt>
                  <dd className="text-right">{medlem.epost || "—"}</dd>
                </div>
                <div className="flex items-start justify-between gap-4 border-b pb-3">
                  <dt className="text-muted-foreground">Telefon</dt>
                  <dd className="text-right">{medlem.telefon || "—"}</dd>
                </div>
                <div className="flex items-start justify-between gap-4 border-b pb-3">
                  <dt className="text-muted-foreground">Adresse</dt>
                  <dd className="text-right">
                    {medlem.adresse
                      ? `${medlem.adresse}${medlem.postnr || medlem.sted ? ", " : ""}${[
                          medlem.postnr,
                          medlem.sted,
                        ]
                          .filter(Boolean)
                          .join(" ")}`
                      : "—"}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-muted-foreground">Medlemskap</dt>
                  <dd className="text-right">
                    <div>{typeLabel}</div>
                    {isAdmin ? (
                      <div className="text-xs text-muted-foreground">Administrator</div>
                    ) : null}
                  </dd>
                </div>
              </dl>
              <div className="mt-4 flex justify-end">
                <Button type="button" variant="outline" onClick={åpneRedigering}>
                  Rediger opplysninger
                </Button>
              </div>
            </>
          )}
        </div>

        <div className="rounded-2xl border bg-card p-6">
          <h2 className="text-lg font-semibold">Medlemskort</h2>
          <div className="mt-4 rounded-xl border bg-background p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Optimal Biehelse Norge</div>
                <div className="mt-1 text-xl font-semibold">{typeLabel}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Status: {aktiv ? "Aktiv" : "Ikke aktiv"}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Medlemsnr.</div>
                <div className="text-lg font-semibold">
                  {medlem.medlemsnummer ?? "—"}
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Navn</div>
                <div className="font-medium">{medlem.navn || "—"}</div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Kontingent</div>
                <div className="font-medium">{pris} kr / år</div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Gyldig fra</div>
                <div className="font-medium">
                  {aktiv ? formatDate(betaltAt) || "—" : "—"}
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">Gyldig til</div>
                <div className="font-medium">
                  {aktiv ? formatDate(gyldigTil) || "—" : "—"}
                </div>
              </div>
            </div>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            {aktiv
              ? "Medlemskortet er aktivt frem til gyldighetsdato."
              : "Medlemskortet blir aktivt når kontingent er registrert som betalt."}
          </p>
        </div>
      </div>

      <div className="mt-10 space-y-6">
        <section className="rounded-2xl border bg-card p-6">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Mine prosjekter</h2>
            <p className="text-sm text-muted-foreground">
              Prosjektforslag du har sendt inn, og status.
            </p>
          </div>

          {prosjekterState.type === "loading" ? (
            <div className="mt-4 text-sm text-muted-foreground">Laster…</div>
          ) : null}

          {prosjekterState.type === "error" ? (
            <div className="mt-4 text-sm text-destructive">
              {prosjekterState.message}
            </div>
          ) : null}

          {prosjekterState.type === "ready" ? (
            prosjekterState.prosjekter.length ? (
              <div className="mt-4 overflow-hidden rounded-xl border bg-background">
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr>
                        <th className="whitespace-nowrap px-4 py-3 text-left font-medium">
                          Dato
                        </th>
                        <th className="px-4 py-3 text-left font-medium">Tittel</th>
                        <th className="whitespace-nowrap px-4 py-3 text-left font-medium">
                          Status
                        </th>
                        <th className="whitespace-nowrap px-4 py-3 text-left font-medium">
                          Ønsket støtte
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {prosjekterState.prosjekter.map((p) => (
                        <tr key={p.id} className="border-t">
                          <td className="whitespace-nowrap px-4 py-3">
                            {formatDate(p.created_at ?? null) || "—"}
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              href={`/min-side/prosjekter/${encodeURIComponent(p.id)}`}
                              className="underline underline-offset-4 hover:text-foreground"
                            >
                              {p.tittel ?? "—"}
                            </Link>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {p.status ?? "mottatt"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {formatBelop(p.budsjett)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="mt-4 text-sm text-muted-foreground">
                Du har ikke sendt inn noen prosjekter ennå.
              </div>
            )
          ) : null}
        </section>

        <section className="rounded-2xl border bg-card p-6">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Søk om prosjekt</h2>
            <p className="text-sm text-muted-foreground">
              Send inn et prosjektforslag direkte fra Min side.
            </p>
          </div>

          <form onSubmit={sendProsjekt} className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="medlemsnummer">Medlemsnummer</Label>
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
              <Button type="submit" disabled={sendStatus.type === "sending"}>
                {sendStatus.type === "sending" ? "Sender…" : "Send inn"}
              </Button>
              {sendStatus.type === "success" ? (
                <p className="text-sm text-foreground">
                  Takk! Vi har mottatt prosjektforslaget ditt.
                </p>
              ) : null}
              {sendStatus.type === "error" ? (
                <p className="text-sm text-destructive">{sendStatus.message}</p>
              ) : null}
            </div>
          </form>
        </section>
      </div>
    </main>
  )
}
