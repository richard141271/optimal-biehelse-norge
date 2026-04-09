"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { BadgeCheck, Crown, ShieldAlert, Sparkles } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"

type Result =
  | { type: "loading" }
  | { type: "error"; message: string }
  | {
      type: "ready"
      aktiv: boolean
      medlem: {
        navn?: string | null
        medlemsnummer?: number | null
        medlemskap_type?: string | null
        kontingent_gyldig_til?: string | null
      }
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

function gradForType(type: string | null | undefined) {
  if (type === "bedrift") return { label: "Bedriftsalliert", tone: "text-foreground" }
  if (type === "stotte") return { label: "Støttespiller", tone: "text-foreground" }
  return { label: "Grunnmedlem", tone: "text-foreground" }
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

export default function VerifiserMedlemskortClient() {
  const sp = useSearchParams()
  const token = String(sp.get("t") ?? "").trim()
  const [result, setResult] = useState<Result>(() =>
    token ? { type: "loading" } : { type: "error", message: "Mangler QR-token." }
  )
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!token) return
    let active = true
    fetch(`/api/medlemskort/verify?t=${encodeURIComponent(token)}&ts=${Date.now()}`, { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json()) as
          | { ok?: boolean; feil?: string }
          | {
              ok: true
              aktiv: boolean
              medlem: {
                navn?: string | null
                medlemsnummer?: number | null
                medlemskap_type?: string | null
                kontingent_gyldig_til?: string | null
              }
            }

        if (!active) return
        if (!res.ok || !(data as { ok?: boolean }).ok) {
          setResult({ type: "error", message: (data as { feil?: string }).feil ?? "Kunne ikke verifisere." })
          return
        }
        const payload = data as {
          ok: true
          aktiv: boolean
          medlem: {
            navn?: string | null
            medlemsnummer?: number | null
            medlemskap_type?: string | null
            kontingent_gyldig_til?: string | null
          }
        }
        setResult({ type: "ready", aktiv: payload.aktiv, medlem: payload.medlem })
      })
      .catch(() => {
        if (!active) return
        setResult({ type: "error", message: "Kunne ikke verifisere." })
      })
    return () => {
      active = false
    }
  }, [token])

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-10">
      <div className="space-y-6">
        <div className="relative overflow-hidden rounded-2xl border bg-card">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_14%,rgba(250,204,21,0.30),transparent_55%),radial-gradient(circle_at_85%_30%,rgba(34,197,94,0.18),transparent_52%),radial-gradient(circle_at_30%_90%,rgba(2,132,199,0.16),transparent_58%)]" />
          <BeeMark className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 text-foreground/10" />
          <div className="relative p-6 sm:p-8">
            <div className="inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-xs text-muted-foreground">
              <Sparkles className="h-4 w-4" />
              Medlemskort-verifisering
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">OBNO</h1>
            <p className="mt-1 text-muted-foreground">
              Skanningen gir en rask sjekk av aktivt medlemskap.
            </p>
          </div>
        </div>

        {result.type === "loading" ? (
          <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">Verifiserer…</div>
        ) : null}

        {result.type === "error" ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">
            {result.message}
          </div>
        ) : null}

        {result.type === "ready" ? (
          <div className="relative overflow-hidden rounded-2xl border bg-card">
            <div className="absolute inset-0 opacity-[0.14] [mask-image:radial-gradient(circle_at_45%_25%,black,transparent_70%)]">
              <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" className="h-full w-full">
                <defs>
                  <pattern id="honey-verify" width="12" height="10.392" patternUnits="userSpaceOnUse">
                    <path
                      d="M6 0 12 3.464v3.464L6 10.392 0 6.928V3.464L6 0Z"
                      stroke="currentColor"
                      strokeWidth="0.8"
                      fill="none"
                    />
                  </pattern>
                </defs>
                <rect width="120" height="120" fill="url(#honey-verify)" />
              </svg>
            </div>
            <BeeMark className="pointer-events-none absolute -right-10 -bottom-16 h-72 w-72 rotate-[12deg] text-foreground/10" />

            <div className="relative p-6 sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">OFFISIELT DOKUMENT</div>
                  <div className="text-2xl font-semibold tracking-tight">Verifisert medlem</div>
                  <div className="text-sm text-muted-foreground">Optimal Biehelse Norge</div>
                </div>
                <div className={result.aktiv ? "rounded-xl border bg-primary/10 p-3 text-primary" : "rounded-xl border bg-destructive/10 p-3 text-destructive"}>
                  {result.aktiv ? <BadgeCheck className="h-6 w-6" /> : <ShieldAlert className="h-6 w-6" />}
                </div>
              </div>

              <div className="mt-6 rounded-2xl border bg-background/70 p-6">
                <div className="text-sm text-muted-foreground">Det bekreftes herved at</div>
                <div className="mt-2 text-3xl font-semibold tracking-tight">
                  {result.medlem.navn ? result.medlem.navn : `Medlem #${result.medlem.medlemsnummer ?? "—"}`}
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  har oppnådd status som{" "}
                  <span className={result.aktiv ? "font-semibold text-primary" : "font-semibold text-destructive"}>
                    {result.aktiv ? "AKTIVT MEDLEM" : "IKKE AKTIVT MEDLEM"}
                  </span>
                </div>

                <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                  <div className="rounded-xl border bg-background p-4">
                    <div className="text-xs text-muted-foreground">Medlemsnr.</div>
                    <div className="font-medium">{result.medlem.medlemsnummer ?? "—"}</div>
                  </div>
                  <div className="rounded-xl border bg-background p-4">
                    <div className="text-xs text-muted-foreground">Type</div>
                    <div className="font-medium">{labelForType(result.medlem.medlemskap_type ?? null)}</div>
                  </div>
                  <div className="rounded-xl border bg-background p-4">
                    <div className="text-xs text-muted-foreground">Grad</div>
                    <div className="inline-flex items-center gap-2 font-medium">
                      <Crown className="h-4 w-4 text-muted-foreground" />
                      <span className={gradForType(result.medlem.medlemskap_type ?? null).tone}>
                        {gradForType(result.medlem.medlemskap_type ?? null).label}
                      </span>
                    </div>
                  </div>
                  <div className="rounded-xl border bg-background p-4">
                    <div className="text-xs text-muted-foreground">Gyldig til</div>
                    <div className="font-medium">{formatDate(result.medlem.kontingent_gyldig_til) || "—"}</div>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={buttonVariants({})}
                    onClick={() => window.print()}
                  >
                    Skriv ut / lagre PDF
                  </button>
                  <button
                    type="button"
                    className={buttonVariants({ variant: "outline" })}
                    onClick={async () => {
                      try {
                        const url = window.location.href
                        if (navigator.share) {
                          await navigator.share({ title: "OBNO – verifisert medlem", url })
                        } else {
                          await navigator.clipboard.writeText(url)
                          setCopied(true)
                          setTimeout(() => setCopied(false), 1500)
                        }
                      } catch {
                        setCopied(false)
                      }
                    }}
                  >
                    {copied ? "Lenke kopiert" : "Del lenke"}
                  </button>
                </div>

                <div className="mt-4 text-xs text-muted-foreground">
                  Dokumentet vises ved scanning av medlemskortets QR-kode, og er digitalt verifisert.
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="text-sm text-muted-foreground">
          <Link href="/" className="underline underline-offset-4">
            Til forsiden
          </Link>
        </div>
      </div>
    </main>
  )
}
