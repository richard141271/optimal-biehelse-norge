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
