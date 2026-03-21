"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { Button, buttonVariants } from "@/components/ui/button"

type State =
  | { type: "loading" }
  | { type: "ready"; epost: string | null; innlogget: boolean }

export function AdminUserMenu() {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const [state, setState] = useState<State>(() =>
    supabase ? { type: "loading" } : { type: "ready", epost: null, innlogget: false }
  )

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch("/api/admin/me", { cache: "no-store" })
        if (!active) return
        if (!res.ok) {
          setState({ type: "ready", epost: null, innlogget: false })
          return
        }
        const data = (await res.json()) as { ok?: boolean; email?: string | null }
        if (!data.ok) {
          setState({ type: "ready", epost: null, innlogget: false })
          return
        }
        const epost = (data.email ?? "").trim()
        setState({ type: "ready", epost: epost || null, innlogget: true })
      } catch {
        if (!active) return
        setState({ type: "ready", epost: null, innlogget: false })
      }
    })()

    return () => {
      active = false
    }
  }, [pathname])

  async function loggUt() {
    if (!supabase) {
      router.push("/min-side/login")
      router.refresh()
      return
    }
    await supabase.auth.signOut()
    router.push("/min-side/login")
    router.refresh()
  }

  if (pathname === "/admin/login") return null

  return (
    <div className="flex items-center gap-3">
      {state.type === "ready" && state.epost ? (
        <div className="hidden text-sm text-muted-foreground sm:block">
          {state.epost}
        </div>
      ) : null}
      <Link href="/min-side" className={buttonVariants({ variant: "outline" })}>
        Min side
      </Link>
      {state.type === "ready" && !state.innlogget ? (
        <Button
          variant="outline"
          onClick={() =>
            router.push(`/min-side/login?next=${encodeURIComponent(pathname || "/admin")}`)
          }
          disabled={!supabase}
        >
          Logg inn
        </Button>
      ) : (
        <Button variant="outline" onClick={loggUt} disabled={!supabase}>
          Logg ut
        </Button>
      )}
    </div>
  )
}
