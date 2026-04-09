import { Suspense } from "react"
import Client from "./client"

export default function VerifiserMedlemskortPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-xl flex-1 px-4 py-10">
          <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
            Verifiserer…
          </div>
        </main>
      }
    >
      <Client />
    </Suspense>
  )
}
