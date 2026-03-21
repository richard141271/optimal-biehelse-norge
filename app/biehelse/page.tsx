import Link from "next/link"

export default function BiehelsePage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <div className="space-y-8">
        <header className="space-y-3">
          <div className="text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground">
              Til forsiden
            </Link>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Bier og biehelse
          </h1>
          <p className="max-w-3xl text-muted-foreground">
            Vi jobber for robuste bifolk og flere pollinatorer gjennom kunnskap,
            forebygging og praktiske tiltak. Her finner du en kort oversikt over
            det vi mener er viktigst.
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border bg-card p-5">
            <div className="text-sm font-medium">Forebygging</div>
            <p className="mt-2 text-sm text-muted-foreground">
              God drift, rutiner og oppfølging gjennom sesongen gir sterkere
              bifolk og færre tap.
            </p>
          </div>
          <div className="rounded-xl border bg-card p-5">
            <div className="text-sm font-medium">Smitte og sykdom</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Tidlig oppdagelse og riktig håndtering reduserer spredning og gjør
              det enklere å holde bifolk friske.
            </p>
          </div>
          <div className="rounded-xl border bg-card p-5">
            <div className="text-sm font-medium">Mat og miljø</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Tilgang på variert pollen og nektar, og gode leveområder for ville
              pollinatorer, er avgjørende.
            </p>
          </div>
          <div className="rounded-xl border bg-card p-5">
            <div className="text-sm font-medium">Kunnskapsdeling</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Vi deler erfaringer og metoder som fungerer, og gjør det enklere å
              ta gode valg lokalt.
            </p>
          </div>
          <div className="rounded-xl border bg-card p-5">
            <div className="text-sm font-medium">Lokale tiltak</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Små grep i hager, parker og kulturlandskap kan gi stor effekt for
              pollinatorer.
            </p>
          </div>
          <div className="rounded-xl border bg-card p-5">
            <div className="text-sm font-medium">Fellesskap</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Samarbeid mellom frivillige, birøktere og fagmiljø gir bedre
              gjennomføring og mer varig effekt.
            </p>
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-6 sm:p-8">
          <h2 className="text-xl font-semibold tracking-tight">
            Vil du starte et prosjekt?
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Medlemmer kan foreslå prosjekter for bier og pollinatorer. Vi kan
            vurdere støtte, utstyr eller veiledning når prosjektet passer med
            formålet vårt.
          </p>
          <div className="mt-4">
            <Link
              href="/prosjekter"
              className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              Gå til prosjekter
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}
