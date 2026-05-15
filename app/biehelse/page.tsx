import Link from "next/link"
import Image from "next/image"

export default function BiehelsePage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Image
              src="/logo.png"
              alt="Optimal Biehelse Norge (OBNO)"
              width={128}
              height={128}
              className="h-10 w-auto"
              priority
            />
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <Link href="/om-oss" className="hover:text-foreground">
              Om oss
            </Link>
            <Link href="/biehelse" className="hover:text-foreground">
              Biehelse
            </Link>
            <Link href="/#medlemskap" className="hover:text-foreground">
              Bli medlem
            </Link>
            <Link href="/#stott-oss" className="hover:text-foreground">
              Støtt oss
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/min-side"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              Min side
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <div className="space-y-8">
          <header className="space-y-3">
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
          <Link
            href="/mat-og-miljo"
            className="group rounded-xl border bg-card p-5 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium">Mat og miljø</div>
              <div className="text-xs text-muted-foreground group-hover:text-foreground">
                Se prosjekt
              </div>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Tilgang på variert pollen og nektar, og gode leveområder for ville
              pollinatorer, er avgjørende.
            </p>
          </Link>
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
              href="/min-side"
              className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              Logg inn som medlem
            </Link>
          </div>
        </section>
      </div>
    </main>
    </div>
  )
}
