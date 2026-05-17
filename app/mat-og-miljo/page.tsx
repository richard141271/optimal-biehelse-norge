import Image from "next/image"
import Link from "next/link"

export default function MatOgMiljoPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <div className="space-y-10">
        <header className="space-y-3">
          <div className="text-sm text-muted-foreground">
            <Link href="/biehelse" className="hover:text-foreground">
              Tilbake til Biehelse
            </Link>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            🌼 Vårt første prosjekt
          </h1>
          <p className="max-w-3xl text-muted-foreground">
            Pollinatorbed for bier, humler og naturen
          </p>
        </header>

          <section className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border bg-card p-3">
              <Image
                src="/prosjekt-pollinatorbed-hero.svg"
                alt="Pollinatorbed"
                width={960}
                height={640}
                className="h-auto w-full rounded-xl"
                priority
              />
            </div>
            <div className="rounded-2xl border bg-card p-3">
              <Image
                src="/prosjekt-pollinatorbed-dugnad.svg"
                alt="Dugnad og samarbeid"
                width={960}
                height={640}
                className="h-auto w-full rounded-xl"
              />
            </div>
            <div className="rounded-2xl border bg-card p-3">
              <Image
                src="/prosjekt-pollinatorbed-skilt.svg"
                alt="Informasjonsskilt og læring"
                width={960}
                height={640}
                className="h-auto w-full rounded-xl"
              />
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground sm:p-8">
            <div className="space-y-5">
              <p>
                Vi i Optimal Biehelse Norge (OBNO) ønsker å skape levende områder som
                gir mat, ly og trygghet til bier, humler og andre pollinatorer.
                Derfor starter vi nå vårt aller første prosjekt:
              </p>

              <div className="text-base font-semibold text-foreground">
                🐝 Et pollinatorbed ved Fredriksten Festning Camping
              </div>

              <p>
                Dette skal bli mer enn bare et blomsterbed. Det skal bli et synlig
                symbol på samarbeid, naturglede og handling.
              </p>

              <div className="text-base font-semibold text-foreground">
                🌱 Hvorfor gjør vi dette?
              </div>

              <p>
                Pollinatorer er avgjørende for naturmangfold, matproduksjon og
                økosystemene våre. Likevel forsvinner stadig flere naturlige
                leveområder.
              </p>
              <p>Med små tiltak kan vi gjøre en stor forskjell.</p>
              <p>
                Ved å plante pollinatorvennlige blomster og skape trygge områder
                for bier og insekter:
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>styrker vi naturen lokalt</li>
                <li>hjelper vi pollinatorene</li>
                <li>skaper vi læring og engasjement</li>
                <li>inspirerer vi andre til å gjøre det samme</li>
              </ul>

              <div className="text-base font-semibold text-foreground">
                🌼 Hva skal prosjektet inneholde?
              </div>

              <p>Prosjektet vil blant annet bestå av:</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>pollinatorvennlige blomster og planter</li>
                <li>informasjonsskilt om bier og natur</li>
                <li>frivillig dugnad og lokalt samarbeid</li>
                <li>aktiviteter for barn og familier</li>
                <li>mulighet for videre utvidelse flere steder i Østfold</li>
              </ul>

              <div className="text-base font-semibold text-foreground">
                🤝 Dette ønsker vi hjelp til
              </div>

              <p>Vi ønsker å samle mennesker, bedrifter og frivillige som vil bidra.</p>
              <p>Du kan hjelpe ved å:</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>bli medlem</li>
                <li>delta på dugnad</li>
                <li>bidra med blomster, jord eller utstyr</li>
                <li>støtte prosjektet økonomisk</li>
                <li>dele prosjektet videre</li>
                <li>tipse oss om samarbeidspartnere</li>
              </ul>

              <div className="text-base font-semibold text-foreground">🌍 Målet vårt</div>

              <p>Dette er bare starten.</p>
              <p>
                Målet er å skape mange pollinatorvennlige områder i Halden,
                Fredrikstad og resten av Østfold – og samtidig bygge et sterkt
                fellesskap rundt bier, natur og bærekraft.
              </p>

              <div className="text-base font-semibold text-foreground">
                💛 Sammen kan vi gjøre en forskjell
              </div>

              <p>
                Små handlinger i dag kan skape store endringer i morgen.
              </p>

              <div className="text-base font-semibold text-foreground">
                🐝 For biene · 🌼 For naturen · 🌍 For fremtiden
              </div>
            </div>
          </section>
      </div>
    </main>
  )
}
