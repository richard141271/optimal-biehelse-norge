"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"

export function MobileNavMenu() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return
    const onScroll = () => setOpen(false)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [open])

  return (
    <div className="relative md:hidden">
      <button
        type="button"
        className="inline-flex h-9 items-center justify-center rounded-lg border bg-background px-3 text-sm font-medium shadow-sm hover:bg-muted"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        Meny
      </button>
      {open ? (
        <div className="absolute right-0 mt-2 w-52 overflow-hidden rounded-xl border bg-background shadow-lg">
          <div className="flex flex-col p-1 text-sm">
            <Link href="/om-oss" className="rounded-lg px-3 py-2 hover:bg-muted" onClick={() => setOpen(false)}>
              Om oss
            </Link>
            <Link href="/biehelse" className="rounded-lg px-3 py-2 hover:bg-muted" onClick={() => setOpen(false)}>
              Biehelse
            </Link>
            <Link href="/bli-medlem" className="rounded-lg px-3 py-2 hover:bg-muted" onClick={() => setOpen(false)}>
              Bli medlem
            </Link>
            <Link href="/lodd" className="rounded-lg px-3 py-2 hover:bg-muted" onClick={() => setOpen(false)}>
              Lotteri
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}

