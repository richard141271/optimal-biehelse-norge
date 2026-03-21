"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { Button } from "@/components/ui/button"

type State =
  | { type: "loading" }
  | { type: "ready"; epost: string | null }

export function AdminUserMenu() {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const [state, setState] = useState<State>(() =>
    supabase ? { type: "loading" } : { type: "ready", epost: null }
  )

  useEffect(() => {
    if (!supabase) return
    let active = true
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!active) return
        setState({ type: "ready", epost: data.user?.email ?? null })
      })
      .catch(() => {
        if (!active) return
        setState({ type: "ready", epost: null })
      })

    return () => {
      active = false
    }
  }, [supabase])

  async function loggUt() {
    if (!supabase) {
      router.push("/admin/login")
      router.refresh()
      return
    }
    await supabase.auth.signOut()
    router.push("/admin/login")
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
      {state.type === "ready" && !state.epost ? (
        <Button variant="outline" onClick={() => router.push("/admin/login")} disabled={!supabase}>
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
