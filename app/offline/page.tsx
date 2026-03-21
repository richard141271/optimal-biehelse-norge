"use client"

import Link from "next/link"
import { Button, buttonVariants } from "@/components/ui/button"

export default function OfflinePage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="mx-auto w-full max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Du er frakoblet</h1>
        <p className="text-muted-foreground">
          Sjekk nettforbindelsen din og prøv igjen.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link href="/" className={buttonVariants()}>
            Gå til forsiden
          </Link>
          <Button variant="outline" onClick={() => location.reload()}>
            Prøv på nytt
          </Button>
        </div>
      </div>
    </main>
  )
}
