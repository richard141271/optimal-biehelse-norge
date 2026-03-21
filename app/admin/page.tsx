import Link from "next/link"

export default function AdminHomePage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Oversikt</h1>
        <p className="text-muted-foreground">
          Administrer medlemsregister og regnskap.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/admin/medlemmer"
          className="rounded-xl border bg-card p-5 hover:bg-muted/40"
        >
          <div className="text-sm font-medium">Medlemsregister</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Søk, filtrer og få oversikt over registreringer.
          </div>
        </Link>
        <Link
          href="/admin/regnskap"
          className="rounded-xl border bg-card p-5 hover:bg-muted/40"
        >
          <div className="text-sm font-medium">Regnskap</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Registrer inntekter/utgifter og legg ved bilag.
          </div>
        </Link>
      </div>
    </div>
  )
}
