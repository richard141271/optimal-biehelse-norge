"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"

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

export default function VerifiserMedlemskortClient() {
  const sp = useSearchParams()
  const token = String(sp.get("t") ?? "").trim()
  const [result, setResult] = useState<Result>(() =>
    token ? { type: "loading" } : { type: "error", message: "Mangler QR-token." }
  )

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
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Verifisering</h1>
          <p className="text-muted-foreground">Sjekk av aktivt medlemskap.</p>
        </header>

        {result.type === "loading" ? (
          <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">Verifiserer…</div>
        ) : null}

        {result.type === "error" ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">
            {result.message}
          </div>
        ) : null}

        {result.type === "ready" ? (
          <div className="rounded-2xl border bg-card p-6">
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Status</div>
              <div
                className={
                  result.aktiv ? "text-xl font-semibold text-primary" : "text-xl font-semibold text-destructive"
                }
              >
                {result.aktiv ? "Aktivt medlem" : "Ikke aktivt medlemskap"}
              </div>
            </div>

            <div className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-xl border bg-background p-4">
                <div className="text-xs text-muted-foreground">Navn</div>
                <div className="font-medium">{result.medlem.navn || "—"}</div>
              </div>
              <div className="rounded-xl border bg-background p-4">
                <div className="text-xs text-muted-foreground">Medlemsnr.</div>
                <div className="font-medium">{result.medlem.medlemsnummer ?? "—"}</div>
              </div>
              <div className="rounded-xl border bg-background p-4 sm:col-span-2">
                <div className="text-xs text-muted-foreground">Gyldig til</div>
                <div className="font-medium">{formatDate(result.medlem.kontingent_gyldig_til) || "—"}</div>
              </div>
              <div className="rounded-xl border bg-background p-4 sm:col-span-2">
                <div className="text-xs text-muted-foreground">Type</div>
                <div className="font-medium">{labelForType(result.medlem.medlemskap_type ?? null)}</div>
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

