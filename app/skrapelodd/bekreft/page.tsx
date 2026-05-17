import { Suspense } from "react"
import SkrapeloddBekreftClient from "./skrapelodd-bekreft-client"

type SearchParams = Record<string, string | string[] | undefined>

function getFirst(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0]
  return value
}

export default function SkrapeloddBekreftPage({ searchParams }: { searchParams?: SearchParams }) {
  const ref = String(getFirst(searchParams?.ref) ?? "").trim()

  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
          <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
            Venter på betalingsbekreftelse…
          </div>
        </main>
      }
    >
      <SkrapeloddBekreftClient refValue={ref} />
    </Suspense>
  )
}
