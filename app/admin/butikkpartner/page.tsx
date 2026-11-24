"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"

type Avtale = {
  innhold: string
  oppdatert_at: string | null
  oppdatert_av: string | null
}

type Bilder = Record<string, string>

type Sponsor = {
  id: string
  navn: string
  logoUrl: string
  sort_order: number
}

type State =
  | { type: "loading" }
  | { type: "ready"; avtale: Avtale; bilder: Bilder }
  | { type: "error"; message: string }

const SLOT_INFO: { slot: string; tittel: string; beskrivelse: string; placeholder: string }[] = [
  {
    slot: "obno_hero",
    tittel: "Hva er OBNO – hovedbilde",
    beskrivelse: "Bildet øverst i «Hva er OBNO»-seksjonen.",
    placeholder: "/prosjekt-pollinatorbed-hero.svg",
  },
  {
    slot: "prosjekt",
    tittel: "Pollinatorprosjekter – bilde",
    beskrivelse: "Bildet i «Våre pollinatorprosjekter»-seksjonen.",
    placeholder: "/prosjekt-pollinatorbed-dugnad.svg",
  },
  {
    slot: "bievenn_qr",
    tittel: "Vi er en Bievenn – QR-kode",
    beskrivelse: "QR-koden i «Vi er en Bievenn»-seksjonen.",
    placeholder: "/QR-kode-OBNO.png",
  },
  {
    slot: "bievenn_bilde",
    tittel: "Vi er en Bievenn – illustrasjon",
    beskrivelse: "Illustrasjonen ved siden av QR-koden.",
    placeholder: "/prosjekt-pollinatorbed-skilt.svg",
  },
  {
    slot: "lek_logo",
    tittel: "LEK-Biens Vokter – logo",
    beskrivelse: "Logoen i LEK-Biens Vokter-kortet (lenket til lekbie.no).",
    placeholder: "/lek-biens-vokter.svg",
  },
]

export default function AdminButikkpartnerPage() {
  const [state, setState] = useState<State>({ type: "loading" })
  const [innhold, setInnhold] = useState("")
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: "ok" | "feil"; text: string } | null>(null)
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const [bilder, setBilder] = useState<Bilder>({})
  const [sponsorer, setSponsorer] = useState<Sponsor[]>([])
  const [sponsorNavn, setSponsorNavn] = useState("")
  const [sponsorLaster, setSponsorLaster] = useState(false)
  const [sponsorSletter, setSponsorSletter] = useState<Record<string, boolean>>({})
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const sponsorFileRef = useRef<HTMLInputElement | null>(null)

  const load = useCallback(async () => {
    setState({ type: "loading" })
    try {
      const [resAvtale, resSponsorer] = await Promise.all([
        fetch(`/api/admin/butikkpartner?ts=${Date.now()}`, { cache: "no-store" }),
        fetch(`/api/admin/butikkpartner-sponsorer?ts=${Date.now()}`, { cache: "no-store" }),
      ])
      const data = (await resAvtale.json()) as {
        ok?: boolean
        feil?: string
        innhold?: string
        oppdatert_at?: string | null
        oppdatert_av?: string | null
        bilder?: Bilder
      }
      if (!resAvtale.ok || !data.ok) {
        setState({ type: "error", message: data.feil ?? "Kunne ikke hente data." })
        return
      }
      const avtale: Avtale = {
        innhold: data.innhold ?? "",
        oppdatert_at: data.oppdatert_at ?? null,
        oppdatert_av: data.oppdatert_av ?? null,
      }
      const b = data.bilder ?? {}
      setState({ type: "ready", avtale, bilder: b })
      setBilder(b)
      setInnhold(avtale.innhold)

      try {
        const sData = (await resSponsorer.json()) as { ok?: boolean; sponsorer?: Sponsor[] }
        if (resSponsorer.ok && sData.ok) {
          setSponsorer(sData.sponsorer ?? [])
        }
      } catch {
        // ignore sponsor load errors
      }
    } catch {
      setState({ type: "error", message: "Kunne ikke hente data." })
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
              bilder: prev.bilder,
            }
          : prev,
      )
    } catch {
      setMsg({ type: "feil", text: "Kunne ikke lagre." })
    } finally {
      setSaving(false)
    }
  }, [innhold])

  const onUpload = useCallback(async (slot: string, file: File) => {
    setUploading((u) => ({ ...u, [slot]: true }))
    setMsg(null)
    try {
      const form = new FormData()
      form.append("slot", slot)
      form.append("file", file)
      const res = await fetch("/api/admin/butikkpartner", {
        method: "POST",
        body: form,
      })
      const data = (await res.json()) as {
        ok?: boolean
        feil?: string
        imageUrl?: string
      }
      if (!res.ok || !data.ok) {
        setMsg({ type: "feil", text: data.feil ?? "Kunne ikke laste opp bildet." })
        return
      }
      setBilder((b) => ({ ...b, [slot]: data.imageUrl ?? "" }))
      setState((prev) =>
        prev.type === "ready"
          ? { ...prev, bilder: { ...prev.bilder, [slot]: data.imageUrl ?? "" } }
          : prev,
      )
      setMsg({ type: "ok", text: "Bildet er lastet opp og byttet ut på siden." })
    } catch {
      setMsg({ type: "feil", text: "Kunne ikke laste opp bildet." })
    } finally {
      setUploading((u) => ({ ...u, [slot]: false }))
    }
  }, [])

  const onReset = useCallback(async (slot: string) => {
    setUploading((u) => ({ ...u, [slot]: true }))
    setMsg(null)
    try {
      const res = await fetch(`/api/admin/butikkpartner?slot=${encodeURIComponent(slot)}`, {
        method: "DELETE",
      })
      const data = (await res.json()) as { ok?: boolean; feil?: string }
      if (!res.ok || !data.ok) {
        setMsg({ type: "feil", text: data.feil ?? "Kunne ikke tilbakestille bildet." })
        return
      }
      setBilder((b) => {
        const next = { ...b }
        delete next[slot]
        return next
      })
      setState((prev) => {
        if (prev.type !== "ready") return prev
        const next = { ...prev.bilder }
        delete next[slot]
        return { ...prev, bilder: next }
      })
      setMsg({ type: "ok", text: "Bildet er tilbakestilt til standard." })
    } catch {
      setMsg({ type: "feil", text: "Kunne ikke tilbakestille bildet." })
    } finally {
      setUploading((u) => ({ ...u, [slot]: false }))
    }
  }, [])

  const dirty = state.type === "ready" && innhold !== state.avtale.innhold

  const onLeggTilSponsor = useCallback(async (file: File) => {
    setSponsorLaster(true)
    setMsg(null)
    try {
      const form = new FormData()
      form.append("navn", sponsorNavn.trim() || file.name.replace(/\.[^.]+$/, ""))
      form.append("file", file)
      const res = await fetch("/api/admin/butikkpartner-sponsorer", {
        method: "POST",
        body: form,
      })
      const data = (await res.json()) as { ok?: boolean; feil?: string; sponsor?: Sponsor }
      if (!res.ok || !data.ok) {
        setMsg({ type: "feil", text: data.feil ?? "Kunne ikke legge til sponsor." })
        return
      }
      if (data.sponsor) {
        setSponsorer((prev) => [...prev, data.sponsor!])
      }
      setSponsorNavn("")
      setMsg({ type: "ok", text: "Sponsorlogo er lagt til." })
    } catch {
      setMsg({ type: "feil", text: "Kunne ikke legge til sponsor." })
    } finally {
      setSponsorLaster(false)
    }
  }, [sponsorNavn])

  const onSlettSponsor = useCallback(async (id: string) => {
    setSponsorSletter((s) => ({ ...s, [id]: true }))
    setMsg(null)
    try {
      const res = await fetch(`/api/admin/butikkpartner-sponsorer?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      })
      const data = (await res.json()) as { ok?: boolean; feil?: string }
      if (!res.ok || !data.ok) {
        setMsg({ type: "feil", text: data.feil ?? "Kunne ikke slette sponsor." })
        return
      }
      setSponsorer((prev) => prev.filter((s) => s.id !== id))
      setMsg({ type: "ok", text: "Sponsor er fjernet." })
    } catch {
      setMsg({ type: "feil", text: "Kunne ikke slette sponsor." })
    } finally {
      setSponsorSletter((s) => ({ ...s, [id]: false }))
    }
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Sponsor / Butikkpartner</h1>
          <p className="text-sm text-muted-foreground">
            Rediger innholdet på den offentlige Butikkpartner-siden: avtale og bilder.
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
        <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">Laster…</div>
      )}

      {state.type === "error" && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive whitespace-pre-wrap">
          {state.message}
        </div>
      )}

      {state.type === "ready" && (
        <div className="space-y-8">
          <section className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold">Butikkpartneravtale</h2>
              <p className="text-sm text-muted-foreground">
                Teksten som vises i avtale-modalen på Butikkpartner-siden.
              </p>
            </div>

            {state.avtale.oppdatert_at && (
              <div className="text-xs text-muted-foreground">
                Sist oppdatert {new Date(state.avtale.oppdatert_at).toLocaleString("nb-NO")}
                {state.avtale.oppdatert_av ? ` av ${state.avtale.oppdatert_av}` : ""}.
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="innhold">Avtale-tekst</Label>
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
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Bilder på siden</h2>
              <p className="text-sm text-muted-foreground">
                Last opp eller bytt ut bildene som vises på Butikkpartner-siden. Endringene treffer
                i kraft umiddelbart.
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

            <div className="grid gap-4 sm:grid-cols-2">
              {SLOT_INFO.map(({ slot, tittel, beskrivelse, placeholder }) => {
                const current = bilder[slot] || ""
                const src = current || placeholder
                const isUploading = uploading[slot]
                return (
                  <div
                    key={slot}
                    className="flex flex-col gap-3 rounded-xl border bg-card p-4"
                  >
                    <div>
                      <div className="text-sm font-medium">{tittel}</div>
                      <div className="text-xs text-muted-foreground">{beskrivelse}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border bg-muted">
                        <Image
                          src={src}
                          alt={tittel}
                          fill
                          unoptimized={src.startsWith("http") || src.endsWith(".svg")}
                          sizes="80px"
                          className="object-contain"
                        />
                      </div>
                      <div className="flex flex-1 flex-col gap-2">
                        <input
                          ref={(el) => {
                            fileRefs.current[slot] = el
                          }}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) onUpload(slot, f)
                            e.target.value = ""
                          }}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isUploading}
                          onClick={() => fileRefs.current[slot]?.click()}
                        >
                          {isUploading ? "Laster opp…" : current ? "Bytt bilde" : "Last opp bilde"}
                        </Button>
                        {current && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isUploading}
                            onClick={() => onReset(slot)}
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          >
                            Tilbakestill
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Sponsorlogoer</h2>
              <p className="text-sm text-muted-foreground">
                Legg til eller fjern sponsorlogoer som vises i «Våre sponsorer» på Butikkpartner-siden.
              </p>
            </div>

            {sponsorer.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sponsorer.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 rounded-xl border bg-card p-3"
                  >
                    <div className="relative h-12 w-24 shrink-0 overflow-hidden rounded-md border bg-muted">
                      <Image
                        src={s.logoUrl}
                        alt={s.navn}
                        fill
                        unoptimized={s.logoUrl.startsWith("http") || s.logoUrl.endsWith(".svg")}
                        sizes="96px"
                        className="object-contain"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{s.navn}</div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!!sponsorSletter[s.id]}
                      onClick={() => onSlettSponsor(s.id)}
                      className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      {sponsorSletter[s.id] ? "Sletter…" : "Fjern"}
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {sponsorer.length === 0 && (
              <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                Ingen sponsorlogoer lagt til ennå.
              </div>
            )}

            <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor="sponsor-navn">Navn på sponsor (valgfritt)</Label>
                <Input
                  id="sponsor-navn"
                  value={sponsorNavn}
                  onChange={(e) => setSponsorNavn(e.target.value)}
                  placeholder="F.eks. Florea"
                />
              </div>
              <input
                ref={sponsorFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) onLeggTilSponsor(f)
                  e.target.value = ""
                }}
              />
              <Button
                onClick={() => sponsorFileRef.current?.click()}
                disabled={sponsorLaster}
              >
                {sponsorLaster ? "Laster opp…" : "Last opp sponsorlogo"}
              </Button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
