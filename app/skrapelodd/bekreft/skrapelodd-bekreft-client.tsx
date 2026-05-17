"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

type Status =
  | { type: "loading"; message: string }
  | { type: "error"; message: string }

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export default function SkrapeloddBekreftClient({ refValue }: { refValue: string }) {
  const router = useRouter()
  const ref = String(refValue ?? "").trim()
  const [status, setStatus] = useState<Status>({
    type: "loading",
    message: "Venter på betalingsbekreftelse…",
  })

  useEffect(() => {
    let active = true
    async function run() {
      if (!ref) {
        setStatus({ type: "error", message: "Mangler referanse fra Vipps." })
        return
      }

      setStatus({ type: "loading", message: "Venter på betalingsbekreftelse…" })

      const startedAt = Date.now()
      let attempt = 0

      while (active) {
        attempt += 1
        try {
          const res = await fetch(`/api/skrapelodd/status?ref=${encodeURIComponent(ref)}&ts=${Date.now()}`, {
            cache: "no-store",
          })
          const data = (await res.json()) as {
            ok?: boolean
            feil?: string
            ready?: boolean
          }

          if (data.ok && data.ready) {
            router.replace(`/skrapelodd/${encodeURIComponent(ref)}`)
            return
          }

          if (!res.ok && data.feil) {
            setStatus({ type: "error", message: data.feil })
            return
          }

          const elapsed = Date.now() - startedAt
          if (elapsed > 60_000) {
            setStatus({
              type: "error",
              message:
                "Vi fikk ikke bekreftet betalingen enda. Hvis du har betalt i Vipps, prøv å oppdatere denne siden om litt.",
            })
            return
          }

          const wait = Math.min(2500, 400 + attempt * 150)
          await sleep(wait)
        } catch {
          setStatus({
            type: "error",
            message: "Kunne ikke verifisere betaling. Prøv igjen.",
          })
          return
        }
      }
    }
    run()
    return () => {
      active = false
    }
  }, [ref, router])

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Skrapelodd</h1>
          <p className="text-muted-foreground">Vi sjekker betalingen din hos Vipps.</p>
        </header>

        <div className="rounded-2xl border bg-card p-6 sm:p-8">
          {status.type === "loading" ? (
            <div className="text-sm text-muted-foreground">{status.message}</div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                {status.message}
              </div>
              <div className="flex flex-wrap gap-3 text-sm">
                <Link href="/skrapelodd" className="underline underline-offset-4">
                  Tilbake til skrapelodd
                </Link>
                {ref ? (
                  <button className="underline underline-offset-4" onClick={() => window.location.reload()}>
                    Prøv igjen
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

