"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { usePathname } from "next/navigation"
import { AdminUserMenu } from "@/components/admin/admin-user-menu"

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const pathname = usePathname()
  const hideHeader = pathname === "/admin/login"
  const [hasNav, setHasNav] = useState(false)
  const shouldCheck = useMemo(() => !hideHeader, [hideHeader])

  useEffect(() => {
    if (!shouldCheck) return
    let active = true
    fetch("/api/admin/me", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json()) as { ok?: boolean; role?: string }
        if (!active) return
        setHasNav(Boolean(data.ok && (data.role === "admin" || data.role === "superadmin")))
      })
      .catch(() => {
        if (!active) return
        setHasNav(false)
      })
    return () => {
      active = false
    }
  }, [shouldCheck])

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {hideHeader ? null : (
        <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <Link href="/admin" className="font-semibold">
              Admin
            </Link>
            {hasNav ? (
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
                <Link href="/admin/tilgang" className="hover:text-foreground">
                  Tilgang
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
        {children}
      </main>
    </div>
  )
}
