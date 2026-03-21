"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { Button } from "@/components/ui/button"

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
  | { type: "error"; message: string }
  | { type: "ready"; medlem: Medlem }

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

export default function MinSidePage() {
  const router = useRouter()
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const [state, setState] = useState<State>({ type: "loading" })
  const [adminRole, setAdminRole] = useState<"admin" | "superadmin" | null>(null)
  const [info, setInfo] = useState<string | null>(null)

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

        try {
          const sp = new URLSearchParams(window.location.search)
          const feil = (sp.get("feil") ?? "").trim()
          if (feil === "ingen-admin") {
            setInfo(
              "Du er innlogget, men har ikke tilgang til admin. Tilgang gis av en administrator inne i Adminpanelet."
            )
          } else {
            setInfo(null)
          }
        } catch {
          setInfo(null)
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
          })
          return
        }
        setState({ type: "ready", medlem: data.medlem })

        try {
          const adminRes = await fetch("/api/admin/me", { cache: "no-store" })
          if (!adminRes.ok) {
            setAdminRole(null)
            return
          }
          const adminData = (await adminRes.json()) as { ok?: boolean; role?: string | null }
          const role = adminData.role ?? null
          if (adminData.ok && (role === "admin" || role === "superadmin")) {
            setAdminRole(role)
          } else {
            setAdminRole(null)
          }
        } catch {
          setAdminRole(null)
        }
      })()
    }, 0)
    return () => clearTimeout(id)
  }, [router, supabase])

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
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-14 sm:py-20">
        <div className="space-y-4">
          <h1 className="text-3xl font-semibold tracking-tight">Min side</h1>
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">
            {state.message}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push("/min-side/login")}>
              Gå til innlogging
            </Button>
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
          {adminRole ? (
            <Button variant="outline" onClick={() => router.push("/admin")}>
              Adminpanel
            </Button>
          ) : null}
          <Button variant="outline" onClick={loggUt} disabled={!supabase}>
            Logg ut
          </Button>
        </div>
      </div>

      {info ? (
        <div className="mt-6 rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">
          {info}
        </div>
      ) : null}

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
                {adminRole ? (
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
    </main>
  )
}
