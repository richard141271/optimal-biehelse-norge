"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Rolle = {
  email: string
  role: string
  created_at?: string
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

type State =
  | { type: "loading" }
  | { type: "error"; message: string; status?: number }
  | { type: "ready"; roller: Rolle[] }

export default function AdminTilgangPage() {
  const [state, setState] = useState<State>({ type: "loading" })
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<"admin" | "superadmin">("admin")
  const [saving, setSaving] = useState(false)

  const canEdit = useMemo(() => state.type === "ready", [state.type])

  async function hent() {
    setState({ type: "loading" })
    const res = await fetch("/api/admin/roles", { cache: "no-store" })
    if (res.status === 401) {
      setState({ type: "error", message: "Du er ikke innlogget.", status: 401 })
      return
    }
    if (res.status === 403) {
      setState({
        type: "error",
        message: "Du må være superbruker for å administrere tilgang.",
        status: 403,
      })
      return
    }
    const data = (await res.json()) as {
      ok?: boolean
      feil?: string
      roller?: Rolle[]
    }
    if (!res.ok || !data.ok) {
      setState({
        type: "error",
        message: data.feil ?? "Kunne ikke hente roller.",
      })
      return
    }
    setState({ type: "ready", roller: data.roller ?? [] })
  }

  useEffect(() => {
    const id = setTimeout(() => {
      hent()
    }, 0)
    return () => clearTimeout(id)
  }, [])

  async function leggTil() {
    if (saving) return
    const e = email.trim().toLowerCase()
    if (!e) return
    if (!isValidEmail(e)) {
      alert("Skriv inn en gyldig e-post.")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e, role }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { feil?: string }
        alert(data.feil ?? "Kunne ikke lagre rolle.")
        return
      }
      setEmail("")
      await hent()
    } finally {
      setSaving(false)
    }
  }

  async function fjern(e: string) {
    if (saving) return
    setSaving(true)
    try {
      const res = await fetch("/api/admin/roles", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { feil?: string }
        alert(data.feil ?? "Kunne ikke fjerne rolle.")
        return
      }
      await hent()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Tilgang</h1>
        <p className="text-muted-foreground">
          Superbruker kan gi og fjerne admin-rettigheter.
        </p>
      </div>

      {state.type === "loading" ? (
        <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          Laster…
        </div>
      ) : null}

      {state.type === "error" ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">
            {state.message}
          </div>
          {state.status === 401 ? (
            <Link
              href={`/min-side/login?next=${encodeURIComponent("/admin/tilgang")}`}
              className="text-sm underline underline-offset-4"
            >
              Gå til innlogging
            </Link>
          ) : null}
        </div>
      ) : null}

      {state.type === "ready" ? (
        <>
          <div className="rounded-xl border bg-card p-5">
            <div className="grid gap-4 md:grid-cols-[1fr_220px_auto] md:items-end">
              <div className="space-y-2">
                <Label htmlFor="email">E-post</Label>
                <Input
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="navn@obno.no"
                  type="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Rolle</Label>
                <select
                  id="role"
                  value={role}
                  onChange={(e) =>
                    setRole(e.target.value as "admin" | "superadmin")
                  }
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="admin">Admin</option>
                  <option value="superadmin">Superbruker</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button onClick={leggTil} disabled={!canEdit || saving}>
                  Legg til
                </Button>
                <Button variant="outline" onClick={hent} disabled={saving}>
                  Oppdater
                </Button>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">E-post</th>
                    <th className="px-4 py-3 text-left font-medium">Rolle</th>
                    <th className="px-4 py-3 text-right font-medium">Handling</th>
                  </tr>
                </thead>
                <tbody>
                  {state.roller.map((r) => (
                    <tr key={r.email} className="border-t">
                      <td className="px-4 py-3">{r.email}</td>
                      <td className="px-4 py-3">{r.role}</td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="outline"
                          onClick={() => fjern(r.email)}
                          disabled={saving}
                        >
                          Fjern
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {state.roller.length === 0 ? (
                    <tr className="border-t">
                      <td
                        colSpan={3}
                        className="px-4 py-6 text-center text-muted-foreground"
                      >
                        Ingen roller ennå.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
