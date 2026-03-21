"use client"

import { useEffect } from "react"

export function RegisterServiceWorker() {
  useEffect(() => {
    ;(async () => {
      try {
        if (!("serviceWorker" in navigator)) return
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map((r) => r.unregister()))
      } catch {}

      try {
        if (!("caches" in window)) return
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      } catch {}
    })()
  }, [])

  return null
}
