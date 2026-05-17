"use client"

import Link from "next/link"
import Image from "next/image"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import QRCode from "qrcode"
import { ShieldCheck, Sparkles } from "lucide-react"
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

function BeeMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 420 420"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M210 124c-39 0-71 31-71 70 0 34 23 62 54 69v34c0 9 8 17 17 17s17-8 17-17v-34c31-7 54-35 54-69 0-39-32-70-71-70Z"
        fill="currentColor"
        opacity="0.9"
      />
      <path
        d="M143 211c-18 0-33 13-37 31-3 18 7 36 24 43l41 17v-38l-32-13c-7-3-11-10-9-17 2-7 8-12 15-12h26v-11c0-6 1-12 2-18h-30Zm134 0h-30c1 6 2 12 2 18v11h26c7 0 13 5 15 12 2 7-2 14-9 17l-32 13v38l41-17c17-7 27-25 24-43-4-18-19-31-37-31Z"
        fill="currentColor"
        opacity="0.45"
      />
      <path
        d="M170 168c13-12 26-18 40-18s27 6 40 18l-9 9c-10-10-20-14-31-14s-21 4-31 14l-9-9Z"
        fill="currentColor"
        opacity="0.45"
      />
      <path
        d="M210 94c25 0 48 10 64 27l16-16c-20-20-48-32-80-32s-60 12-80 32l16 16c16-17 39-27 64-27Z"
        fill="currentColor"
        opacity="0.25"
      />
      <path
        d="M196 210h28v12h-28v-12Zm0 23h28v12h-28v-12Zm0 23h28v12h-28v-12Z"
        fill="currentColor"
        opacity="0.28"
      />
    </svg>
  )
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
  const qrConfigMissing =
    typeof qrFeil === "string" &&
    (qrFeil.includes("MEDLEMSKORT_SIGNING_SECRET") || qrFeil.includes("MEDLEMSKORT_SIGNING"))

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
              <div className="w-full max-w-[520px]">
                <div className="relative overflow-hidden rounded-2xl border bg-background/60 p-6">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_10%,rgba(250,204,21,0.28),transparent_55%),radial-gradient(circle_at_80%_40%,rgba(34,197,94,0.18),transparent_50%),radial-gradient(circle_at_20%_85%,rgba(2,132,199,0.16),transparent_55%)]" />
                  <div className="absolute inset-0 opacity-[0.16] [mask-image:radial-gradient(circle_at_30%_30%,black,transparent_70%)]">
                    <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" className="h-full w-full">
                      <defs>
                        <pattern id="honey" width="12" height="10.392" patternUnits="userSpaceOnUse">
                          <path
                            d="M6 0 12 3.464v3.464L6 10.392 0 6.928V3.464L6 0Z"
                            stroke="currentColor"
                            strokeWidth="0.8"
                            fill="none"
                          />
                        </pattern>
                      </defs>
                      <rect width="120" height="120" fill="url(#honey)" />
                    </svg>
                  </div>
                  <BeeMark className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 text-foreground/10" />
                  <BeeMark className="pointer-events-none absolute -bottom-12 -left-10 h-72 w-72 rotate-[-18deg] text-foreground/10" />

                  <div className="relative space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-xs text-muted-foreground">
                        <ShieldCheck className="h-4 w-4" />
                        Optimal Biehelse Norge
                      </div>
                      <div className="inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-xs text-muted-foreground">
                        <Sparkles className="h-4 w-4" />
                        Premium medlemskort
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="text-2xl font-semibold tracking-tight">{typeLabel}</div>
                      <div className="text-sm text-muted-foreground">
                        Status:{" "}
                        <span className={aktiv ? "font-medium text-primary" : "font-medium text-destructive"}>
                          {aktiv ? "Aktiv" : "Ikke aktiv"}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        For deg som vil gjøre alt for pollinatorene.
                      </div>
                    </div>

                    <div className="grid gap-3 pt-1 text-sm sm:grid-cols-2">
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
                        <div className="space-y-3">
                          <div className="text-sm text-muted-foreground">Lager QR-kode…</div>
                          <div className="relative overflow-hidden rounded-lg border bg-muted/30 p-6">
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_15%,rgba(250,204,21,0.18),transparent_55%)]" />
                            <BeeMark className="relative mx-auto h-24 w-24 text-foreground/20" />
                          </div>
                        </div>
                      )}
                      {qrFeil ? (
                        <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                          {qrConfigMissing ? (
                            <div className="space-y-1">
                              <div className="font-medium">QR-verifisering er ikke aktivert</div>
                              <div>Sett MEDLEMSKORT_SIGNING_SECRET i miljøvariabler, og last siden på nytt.</div>
                            </div>
                          ) : (
                            qrFeil
                          )}
                        </div>
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
                      <Link href="/bli-medlem" className={buttonVariants({})}>
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
