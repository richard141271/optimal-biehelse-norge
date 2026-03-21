"use client"

import Link from "next/link"
import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function AdminLoginPage() {
  const router = useRouter()

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search)
      const raw = (sp.get("next") || "/admin").trim()
      const next = raw.startsWith("/") ? raw : "/admin"
      router.replace(`/min-side/login?next=${encodeURIComponent(next)}`)
    } catch {
      router.replace("/min-side/login")
    }
  }, [router])

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="text-center text-sm text-muted-foreground">
        <Link href="/min-side/login" className="hover:text-foreground">
          Gå til innlogging
        </Link>
      </div>
    </main>
  )
}
