"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

type Avtale = {
  innhold: string
  oppdatert_at: string | null
  oppdatert_av: string | null
}

type State =
  | { type: "loading" }
  | { type: "ready"; avtale: Avtale }
  | { type: "error"; message: string }

export default function AdminButikkpartnerPage() {
  const [state, setState] = useState<State>({ type: "loading" })
  const [innhold, setInnhold] = useState("")
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: "ok" | "feil"; text: string } | null>(null)

  const load = useCallback(async () => {
    setState({ type: "loading" })
    try {
      const res = await fetch(`/api/admin/butikkpartner?ts=${Date.now()}`, {
        cache: "no-store",
      })
      const data = (await res.json()) as {
        ok?: boolean
        feil?: string
        innhold?: string
        oppdatert_at?: string | null
        oppdatert_av?: string | null
      }
      if (!res.ok || !data.ok) {
        setState({ type: "error", message: data.feil ?? "Kunne ikke hente avtalen." })
        return
      }
      const avtale: Avtale = {
        innhold: data.innhold ?? "",
        oppdatert_at: data.oppdatert_at ?? null,
        oppdatert_av: data.oppdatert_av ?? null,
      }
      setState({ type: "ready", avtale })
      setInnhold(avtale.innhold)
    } catch {
      setState({ type: "error", message: "Kunne ikke hente avtalen." })
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const onSave = useCallback(async () => {
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch("/api/admin/butikkpartner", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ innhold }),
      })
      const data = (await res.json()) as {
        ok?: boolean
        feil?: string
        oppdatert_at?: string | null
        oppdatert_av?: string | null
      }
      if (!res.ok || !data.ok) {
        setMsg({ type: "feil", text: data.feil ?? "Kunne ikke lagre." })
        return
      }
      setMsg({ type: "ok", text: "Butikkpartneravtalen er lagret." })
      setState((prev) =>
        prev.type === "ready"
          ? {
              type: "ready",
              avtale: {
                innhold,
                oppdatert_at: data.oppdatert_at ?? prev.avtale.oppdatert_at,
                oppdatert_av: data.oppdatert_av ?? prev.avtale.oppdatert_av,
              },
            }
          : prev,
      )
    } catch {
      setMsg({ type: "feil", text: "Kunne ikke lagre." })
    } finally {
      setSaving(false)
    }
  }, [innhold])

  const dirty =
    state.type === "ready" && innhold !== state.avtale.innhold

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Butikkpartner</h1>
          <p className="text-sm text-muted-foreground">
            Rediger innholdet på den offentlige Butikkpartner-siden, inkludert Butikkpartneravtalen.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/butikkpartner"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center justify-center rounded-lg border bg-background px-4 text-sm font-medium shadow-sm hover:bg-muted"
          >
            Vis side ↗
          </Link>
        </div>
      </div>

      {state.type === "loading" && (
        <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          Laster…
        </div>
      )}

      {state.type === "error" && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">
          {state.message}
        </div>
      )}

      {state.type === "ready" && (
        <div className="space-y-5">
          {state.avtale.oppdatert_at && (
            <div className="text-xs text-muted-foreground">
              Sist oppdatert{" "}
              {new Date(state.avtale.oppdatert_at).toLocaleString("nb-NO")}
              {state.avtale.oppdatert_av ? ` av ${state.avtale.oppdatert_av}` : ""}.
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="innhold">Butikkpartneravtale (tekst som vises på siden)</Label>
            <Textarea
              id="innhold"
              value={innhold}
              onChange={(e) => setInnhold(e.target.value)}
              placeholder="Skriv Butikkpartneravtalen her…"
              className="min-h-[320px] font-mono text-sm leading-relaxed"
            />
            <p className="text-xs text-muted-foreground">
              Vanlig tekst. Linjeskift vises som linjeskift. Avtalen åpnes via en knapp i feltet
              «Vi er en Bievenn» på{" "}
              <Link href="/butikkpartner" className="underline underline-offset-4">
                Butikkpartner-siden
              </Link>
              .
            </p>
          </div>

          {msg && (
            <div
              className={`rounded-xl border p-4 text-sm ${
                msg.type === "ok"
                  ? "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
              }`}
            >
              {msg.text}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={onSave} disabled={saving || !dirty}>
              {saving ? "Lagrer…" : "Lagre avtale"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setInnhold(state.type === "ready" ? state.avtale.innhold : "")}
              disabled={saving || !dirty}
            >
              Tilbakestill
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
