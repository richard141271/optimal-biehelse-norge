import Link from "next/link"

type SearchParams = Record<string, string | string[] | undefined>

function getFirst(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0]
  return value
}

export default async function LoddSuksessPage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>
}) {
  const sp = ((await Promise.resolve(searchParams)) ?? {}) as SearchParams
  const fromRaw = String(getFirst(sp.from) ?? "").trim()
  const toRaw = String(getFirst(sp.to) ?? "").trim()
  const ref = String(getFirst(sp.ref) ?? "").trim()
  const amountRaw = String(getFirst(sp.amount) ?? "").trim()

  const from = Number(fromRaw)
  const to = Number(toRaw)
  const amount = Number(amountRaw)

  const hasRange = Number.isFinite(from) && from > 0 && Number.isFinite(to) && to >= from
  const hasAmount = Number.isFinite(amount) && amount > 0

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Takk for støtten!</h1>
          <p className="text-muted-foreground">
            {hasRange ? `Dine lodd: ${from}–${to}` : "Dine lodd er registrert."}
          </p>
        </header>

        <div className="rounded-2xl border bg-card p-6 text-sm">
          <div>
            <span className="font-medium">Vippsreferanse registrert:</span>{" "}
            <span className="break-all">{ref || "—"}</span>
          </div>
          {hasAmount ? (
            <div className="mt-2">
              <span className="font-medium">Beløp:</span> {Math.round(amount)} kr
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/lodd"
            className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
          >
            Tilbake til loddsalg
          </Link>
        </div>
      </div>
    </main>
  )
}

