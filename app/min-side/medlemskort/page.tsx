"use client"

import Link from "next/link"
import Image from "next/image"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import QRCode from "qrcode"
import { ShieldCheck } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"

type Medlem = {
  medlemsnummer?: number | null
  medlemskap_type?: string | null
  navn?: string | null
  kontingent_gyldig_til?: string | null
}

type State =
  | { type: "loading" }
  | { type: "error"; message: string; status?: number }
  | { type: "ready"; medlem: Medlem }

function isAktiv(gyldigTil?: string | null) {
  if (!gyldigTil) return false
  const d = new Date(gyldigTil)
  if (Number.isNaN(d.getTime())) return false
  return d.getTime() > Date.now()
}

function formatDate(iso?: string | null) {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("nb-NO", { year: "numeric", month: "2-digit", day: "2-digit" })
}

function labelForType(type: string | null | undefined) {
  if (type === "stotte") return "Støttemedlem"
  if (type === "bedrift") return "Bedriftsmedlem"
  return "Medlem"
}

export default function MedlemskortPage() {
  const router = useRouter()
  const [state, setState] = useState<State>({ type: "loading" })
  const [token, setToken] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [qrFeil, setQrFeil] = useState<string | null>(null)

  const nextPath = useMemo(() => "/min-side/medlemskort", [])
  const qrUrl = useMemo(() => {
    if (!token) return null
    if (typeof window === "undefined") return null
    return `${window.location.origin}/medlemskort/verify?t=${encodeURIComponent(token)}`
  }, [token])

  useEffect(() => {
    let active = true
    fetch(`/api/min-side/me?ts=${Date.now()}`, { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json()) as { ok?: boolean; feil?: string; medlem?: Medlem }
        if (!active) return
        if (res.status === 401) {
          router.push(`/min-side/login?next=${encodeURIComponent(nextPath)}`)
          return
        }
        if (!res.ok || !data.ok || !data.medlem) {
          setState({ type: "error", message: data.feil ?? "Kunne ikke hente medlemsdata.", status: res.status })
          return
        }
        setState({ type: "ready", medlem: data.medlem })
      })
      .catch(() => {
        if (!active) return
        setState({ type: "error", message: "Kunne ikke hente medlemsdata." })
      })
    return () => {
      active = false
    }
  }, [router, nextPath])

  useEffect(() => {
    if (state.type !== "ready") return
    if (!isAktiv(state.medlem.kontingent_gyldig_til ?? null)) return
    let active = true
    fetch(`/api/min-side/medlemskort-token?ts=${Date.now()}`, { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json()) as { ok?: boolean; feil?: string; token?: string }
        if (!active) return
        if (!res.ok || !data.ok || !data.token) {
          setQrFeil(data.feil ?? "Kunne ikke lage QR-kode.")
          return
        }
        setToken(data.token)
        setQrFeil(null)
      })
      .catch(() => {
        if (!active) return
        setQrFeil("Kunne ikke lage QR-kode.")
      })
    return () => {
      active = false
    }
  }, [state])

  useEffect(() => {
    if (!qrUrl) return
    QRCode.toDataURL(qrUrl, {
      width: 320,
      margin: 1,
      color: { dark: "#174B2C", light: "#FFFFFF" },
    })
      .then((dataUrl: string) => setQrDataUrl(dataUrl))
      .catch(() => setQrFeil("Kunne ikke lage QR-kode."))
  }, [qrUrl])

  if (state.type === "loading") {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">Laster…</div>
      </main>
    )
  }

  if (state.type === "error") {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            <Link href="/min-side" className="hover:text-foreground">
              Til Min side
            </Link>
          </div>
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">
            {state.message}
          </div>
        </div>
      </main>
    )
  }

  const medlem = state.medlem
  const aktiv = isAktiv(medlem.kontingent_gyldig_til ?? null)
  const typeLabel = labelForType(medlem.medlemskap_type ?? null)

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <div className="space-y-6">
        <div className="text-sm text-muted-foreground">
          <Link href="/min-side" className="hover:text-foreground">
            Til Min side
          </Link>
        </div>

        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Medlemskort</h1>
          <p className="text-muted-foreground">
            Skann QR-koden for å verifisere aktivt medlemskap.
          </p>
        </header>

        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="bg-gradient-to-br from-[color:oklch(0.96_0.04_88)] via-background to-background p-6 sm:p-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-xs text-muted-foreground">
                  <ShieldCheck className="h-4 w-4" />
                  Optimal Biehelse Norge
                </div>
                <div className="text-2xl font-semibold">{typeLabel}</div>
                <div className="text-sm text-muted-foreground">
                  Status:{" "}
                  <span className={aktiv ? "font-medium text-primary" : "font-medium text-destructive"}>
                    {aktiv ? "Aktiv" : "Ikke aktiv"}
                  </span>
                </div>
                <div className="grid gap-3 pt-2 text-sm sm:grid-cols-2">
                  <div className="rounded-xl border bg-background/70 p-4">
                    <div className="text-xs text-muted-foreground">Navn</div>
                    <div className="font-medium">{medlem.navn || "—"}</div>
                  </div>
                  <div className="rounded-xl border bg-background/70 p-4">
                    <div className="text-xs text-muted-foreground">Medlemsnr.</div>
                    <div className="font-medium">{medlem.medlemsnummer ?? "—"}</div>
                  </div>
                  <div className="rounded-xl border bg-background/70 p-4 sm:col-span-2">
                    <div className="text-xs text-muted-foreground">Gyldig til</div>
                    <div className="font-medium">{formatDate(medlem.kontingent_gyldig_til) || "—"}</div>
                  </div>
                </div>
              </div>

              <div className="w-full max-w-[360px] shrink-0">
                <div className="rounded-2xl border bg-background p-5">
                  {aktiv ? (
                    <>
                      {qrDataUrl ? (
                        <div className="flex justify-center">
                          <Image
                            src={qrDataUrl}
                            alt="QR-kode for verifisering av medlemskap"
                            width={320}
                            height={320}
                            className="h-auto w-[260px] rounded-lg sm:w-[300px]"
                            unoptimized
                          />
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">Lager QR-kode…</div>
                      )}
                      {qrFeil ? (
                        <div className="mt-3 text-sm text-destructive">{qrFeil}</div>
                      ) : null}
                      {qrUrl ? (
                        <div className="mt-4 space-y-2">
                          <a
                            href={qrUrl}
                            target="_blank"
                            rel="noreferrer"
                            className={buttonVariants({ className: "w-full" })}
                          >
                            Åpne verifisering
                          </a>
                          <div className="break-all text-xs text-muted-foreground">
                            {qrUrl}
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-sm text-muted-foreground">
                        Medlemskortet blir aktivt når kontingent er registrert som betalt.
                      </div>
                      <Link href="/#medlemskap" className={buttonVariants({})}>
                        Betal / registrer medlemskap
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
