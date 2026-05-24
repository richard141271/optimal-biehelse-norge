"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Status =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "error"; message: string }

export default function SkrapeloddNyPage() {
  const router = useRouter()
  const [status, setStatus] = useState<Status>({ type: "idle" })
  const [telefon, setTelefon] = useState("")

  async function start() {
    setStatus({ type: "loading" })
    try {
      const res = await fetch("/api/skrapelodd-ny/new", {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ telefon }),
      })
      const data = (await res.json()) as { ok?: boolean; feil?: string; nextUrl?: string | null }
      const nextUrl = String(data.nextUrl ?? "").trim()
      if (!res.ok || !data.ok || !nextUrl) {
        setStatus({ type: "error", message: data.feil ?? "Kunne ikke hente skrapelodd." })
        return
      }
      router.push(nextUrl)
      router.refresh()
    } catch {
      setStatus({ type: "error", message: "Kunne ikke hente skrapelodd." })
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10">
      <div className="space-y-2">
        <div className="text-sm text-muted-foreground">
          <Link href="/admin" className="underline underline-offset-4">
            Tilbake
          </Link>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Skrapelodd (ny)</h1>
        <p className="text-muted-foreground">Hent et skrapelodd og skrap frem resultatet.</p>
      </div>

      {status.type === "error" ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {status.message}
        </div>
      ) : null}

      <div className="max-w-sm space-y-2">
        <Label htmlFor="telefon">Telefonnummer</Label>
        <Input
          id="telefon"
          value={telefon}
          onChange={(e) => setTelefon(e.target.value)}
          placeholder="8 siffer"
          inputMode="tel"
          autoComplete="tel"
        />
      </div>

      <button
        onClick={start}
        disabled={status.type === "loading"}
        className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-60"
      >
        {status.type === "loading" ? "Henter…" : "Hent skrapelodd"}
      </button>
    </div>
  )
}
