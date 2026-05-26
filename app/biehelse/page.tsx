import Link from "next/link"

type SponsorCard = {
  navn: string
  tekst: string
  href?: string
  logoSrc?: string
  logoAlt?: string
  badge?: "Hovedsponsor" | "Samarbeidspartner" | "Lokal støttespiller"
}

export default function BiehelsePage() {
  const sponsorer: SponsorCard[] = [
    {
      navn: "Plantasjen Svinesundsparken",
      tekst: "Bidrar med blomsterfrø til pollinatorområdene",
      href: "https://www.plantasjen.no",
    },
    {
      navn: "Felleskjøpet",
      tekst: "Bidrar med blomsterfrø til pollinatorområdene",
      href: "https://www.felleskjopet.no",
    },
    {
      navn: "Florea",
      tekst: "Bidrar med pollinatorvennlige frøblandinger",
      href: "https://floreagarden.com/no-no",
    },
    {
      navn: "Store Bjørnstad AS",
      tekst: "Bidrar med stein til bed og uteområder",
    },
    {
      navn: "Kalesje & Industrisøm AS®",
      tekst: "Bidrar med transport og praktisk hjelp",
      href: "https://kias.no",
    },
    {
      navn: "Fredriksten Camping",
      tekst: "Bidrar med område og plass til pollinatorbed",
      href: "https://www.fredrikstencamping.no",
    },
  ]

  const samarbeidspartnere: SponsorCard[] = [
    {
      navn: "Halden kommune",
      tekst: "Stiller med jord til prosjektet",
      href: "https://www.halden.kommune.no",
    },
    {
      navn: "Halden Frivilligsentral",
      tekst: "Bidrar med utlån av utstyr",
      href: "https://frivilligsentral.no",
    },
    {
      navn: "Botanisk verden",
      tekst: "Støtter prosjektet med frøbidrag",
      href: "https://botaniskverden.no",
    },
    {
      navn: "Private givere",
      tekst: "Bidrar med planter, blomster og lokalt engasjement",
    },
  ]

  return (
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
          <div className="rounded-xl border bg-card p-5">
            <div className="text-sm font-medium">Mat og miljø</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Tilgang på variert pollen og nektar, og gode leveområder for ville pollinatorer, er avgjørende.
            </p>
          </div>
          <div className="rounded-xl border bg-card p-5">
            <div className="text-sm font-medium">Kunnskapsdeling</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Vi deler erfaringer og metoder som fungerer, og gjør det enklere å
              ta gode valg lokalt.
            </p>
          </div>
          <Link href="/mat-og-miljo" className="rounded-xl border bg-card p-5 hover:bg-muted/40">
            <div className="text-sm font-medium">Lokale tiltak</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Små grep i hager, parker og kulturlandskap kan gi stor effekt for
              pollinatorer.
            </p>
          </Link>
          <div className="rounded-xl border bg-card p-5">
            <div className="text-sm font-medium">Fellesskap</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Samarbeid mellom frivillige, birøktere og fagmiljø gir bedre
              gjennomføring og mer varig effekt.
            </p>
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-6 sm:p-8">
          <h2 className="text-xl font-semibold tracking-tight">Vil du starte et prosjekt?</h2>
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

        <section className="rounded-2xl border bg-card p-6 sm:p-8">
          <h2 className="text-xl font-semibold tracking-tight">Sponsorer og samarbeidspartnere</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Pollinatorprosjektet hadde ikke vært mulig uten støtte fra lokale bedrifter, organisasjoner, frivillige og
            private givere. Alle bidrag – store og små – hjelper oss med å skape bedre forhold for bier, humler og andre
            pollinatorer.
          </p>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-background p-5">
              <div className="text-sm font-medium">Sponsorer</div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {sponsorer.map((c) =>
                  c.href ? (
                    <a
                      key={c.navn}
                      href={c.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex items-start gap-3">
                        {c.logoSrc ? (
                          <img
                            src={c.logoSrc}
                            alt={c.logoAlt || c.navn}
                            className="h-10 w-10 shrink-0 rounded-md object-contain"
                          />
                        ) : null}
                        <div className="min-w-0">
                          <div className="font-medium leading-snug underline-offset-4 group-hover:underline">
                            {c.navn}
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">{c.tekst}</div>
                        </div>
                      </div>
                    </a>
                  ) : (
                    <div key={c.navn} className="rounded-xl border bg-card p-4">
                      <div className="flex items-start gap-3">
                        {c.logoSrc ? (
                          <img
                            src={c.logoSrc}
                            alt={c.logoAlt || c.navn}
                            className="h-10 w-10 shrink-0 rounded-md object-contain"
                          />
                        ) : null}
                        <div className="min-w-0">
                          <div className="font-medium leading-snug">{c.navn}</div>
                          <div className="mt-1 text-sm text-muted-foreground">{c.tekst}</div>
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>

            <div className="rounded-xl border bg-background p-5">
              <div className="text-sm font-medium">Samarbeidspartnere</div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {samarbeidspartnere.map((c) =>
                  c.href ? (
                    <a
                      key={c.navn}
                      href={c.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex items-start gap-3">
                        {c.logoSrc ? (
                          <img
                            src={c.logoSrc}
                            alt={c.logoAlt || c.navn}
                            className="h-10 w-10 shrink-0 rounded-md object-contain"
                          />
                        ) : null}
                        <div className="min-w-0">
                          <div className="font-medium leading-snug underline-offset-4 group-hover:underline">
                            {c.navn}
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">{c.tekst}</div>
                        </div>
                      </div>
                    </a>
                  ) : (
                    <div key={c.navn} className="rounded-xl border bg-card p-4">
                      <div className="flex items-start gap-3">
                        {c.logoSrc ? (
                          <img
                            src={c.logoSrc}
                            alt={c.logoAlt || c.navn}
                            className="h-10 w-10 shrink-0 rounded-md object-contain"
                          />
                        ) : null}
                        <div className="min-w-0">
                          <div className="font-medium leading-snug">{c.navn}</div>
                          <div className="mt-1 text-sm text-muted-foreground">{c.tekst}</div>
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
