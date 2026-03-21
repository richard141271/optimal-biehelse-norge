"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { Button } from "@/components/ui/button"

type State =
  | { type: "loading" }
  | { type: "ready"; epost: string | null }

export function AdminUserMenu() {
  const router = useRouter()
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const [state, setState] = useState<State>({ type: "loading" })

  useEffect(() => {
    if (!supabase) {
      setState({ type: "ready", epost: null })
      return
    }
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

  return (
    <div className="flex items-center gap-3">
      {state.type === "ready" && state.epost ? (
        <div className="hidden text-sm text-muted-foreground sm:block">
          {state.epost}
        </div>
      ) : null}
      <Button variant="outline" onClick={loggUt} disabled={!supabase}>
        Logg ut
      </Button>
    </div>
  )
}
