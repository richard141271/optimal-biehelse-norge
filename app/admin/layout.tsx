"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { usePathname } from "next/navigation"
import { AdminUserMenu } from "@/components/admin/admin-user-menu"

type Gate =
  | { type: "loading" }
  | { type: "ready"; role: string | null; email: string | null }

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const pathname = usePathname()
  const hideHeader = pathname === "/admin/login"
  const [gate, setGate] = useState<Gate>({ type: "loading" })
  const shouldCheck = useMemo(() => !hideHeader, [hideHeader])

  useEffect(() => {
    if (!shouldCheck) return
    let active = true
    fetch(`/api/admin/me?ts=${Date.now()}`, { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json()) as {
          ok?: boolean
          role?: string | null
          email?: string | null
        }
        if (!active) return
        setGate({
          type: "ready",
          role: data.role ?? null,
          email: (data.email ?? null) as string | null,
        })
      })
      .catch(() => {
        if (!active) return
        setGate({ type: "ready", role: null, email: null })
      })
    return () => {
      active = false
    }
  }, [shouldCheck])

  const allowed =
    gate.type === "ready" && (gate.role === "admin" || gate.role === "superadmin")

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {hideHeader ? null : (
        <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <Link href="/admin" className="font-semibold">
              Admin
            </Link>
            {allowed ? (
              <nav className="hidden items-center gap-5 text-sm text-muted-foreground sm:flex">
                <Link href="/admin/medlemmer" className="hover:text-foreground">
                  Medlemmer
                </Link>
                <Link href="/admin/prosjekter" className="hover:text-foreground">
                  Prosjekter
                </Link>
                <Link href="/admin/regnskap" className="hover:text-foreground">
                  Regnskap
                </Link>
              </nav>
            ) : (
              <div />
            )}
            <AdminUserMenu />
          </div>
        </header>
      )}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {hideHeader || gate.type === "loading" || allowed ? (
          children
        ) : (
          <div className="space-y-4">
            <h1 className="text-2xl font-semibold tracking-tight">Ingen tilgang</h1>
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">
              Du er innlogget, men har ikke tilgang til admin.
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/min-side"
                className="text-sm underline underline-offset-4"
              >
                Tilbake til Min side
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
