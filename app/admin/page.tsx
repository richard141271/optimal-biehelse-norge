"use client"

import Link from "next/link"

export default function AdminHomePage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Oversikt</h1>
        <p className="text-muted-foreground">
          Administrer medlemsregister, prosjekter, regnskap, loddsalg og skrapelodd.
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
          href="/admin/prosjekter"
          className="rounded-xl border bg-card p-5 hover:bg-muted/40"
        >
          <div className="text-sm font-medium">Prosjekter</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Se innsendte prosjektforslag fra medlemmer.
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
        <Link
          href="/admin/lodd"
          className="rounded-xl border bg-card p-5 hover:bg-muted/40"
        >
          <div className="text-sm font-medium">Loddsalg</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Administrer premiearkiv, lotteri og trekking.
          </div>
        </Link>
        <Link
          href="/admin/redd-1-bie-eske"
          className="rounded-xl border bg-card p-5 hover:bg-muted/40"
        >
          <div className="text-sm font-medium">🐝 Redd 1 Bie-Eske</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Registrer runder, påfylling, bilder og GPS ute i felt.
          </div>
        </Link>
        <Link
          href="/admin/skrapelodd"
          className="rounded-xl border bg-card p-5 hover:bg-muted/40"
        >
          <div className="text-sm font-medium">Skrapelodd</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Administrer forhåndsdefinerte skrapelodd og vinnere.
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Link href="/lodd" className="underline underline-offset-4">
              Åpne loddsalg
            </Link>
            <Link href="/skrapelodd" className="underline underline-offset-4">
              Åpne skrapelodd
            </Link>
          </div>
        </Link>
      </div>
    </div>
  )
}
