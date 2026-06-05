import Image from "next/image"
import Link from "next/link"

export default function ButikkpartnerPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <div className="space-y-10">
        <section className="overflow-hidden rounded-3xl border bg-gradient-to-b from-[color:oklch(0.97_0.03_88)] via-background to-background p-6 sm:p-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">
                🐝 🌼 🌍 🤝
              </div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Denne butikken støtter bier og natur
              </h1>
              <p className="text-muted-foreground sm:text-lg">
                Takk for at du handler her. Når lokale bedrifter støtter OBNO, blir det flere pollinatorvennlige tiltak,
                mer kunnskap og et sterkere lokalt fellesskap.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/bli-medlem"
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
                >
                  Bli medlem
                </Link>
                <a
                  href="mailto:post@obno.no"
                  className="inline-flex h-10 items-center justify-center rounded-lg border bg-background px-4 text-sm font-medium shadow-sm hover:bg-muted"
                >
                  Kontakt oss
                </a>
                <Link
                  href="/mat-og-miljo"
                  className="inline-flex h-10 items-center justify-center rounded-lg border bg-background px-4 text-sm font-medium shadow-sm hover:bg-muted"
                >
                  Se prosjekter
                </Link>
                <Link
                  href="/butikker-med-bie-eske"
                  className="inline-flex h-10 items-center justify-center rounded-lg border bg-background px-4 text-sm font-medium shadow-sm hover:bg-muted"
                >
                  Se hvilke butikker som har Bie-Eske
                </Link>
              </div>
            </div>

            <div className="flex items-center justify-center">
              <div className="rounded-3xl border bg-background/60 p-6 shadow-sm">
                <Image src="/logo.png" alt="OBNO-logo" width={140} height={140} className="h-auto w-[120px] sm:w-[140px]" />
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border bg-card p-5">
            <div className="text-sm font-medium">Biehelse</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Vi jobber for robuste bifolk og bedre forhold for pollinatorer – med tiltak som merkes lokalt.
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-5">
            <div className="text-sm font-medium">Kunnskap</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Praktisk kunnskap, tydelig informasjon og små grep som hjelper bier, humler og natur.
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-5">
            <div className="text-sm font-medium">Fellesskap</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Samarbeid med bedrifter, frivillige og lokalmiljø gir mer varige resultater.
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-5">
            <div className="text-sm font-medium">Natur</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Vi vil skape blomstrende områder som gir mat og ly til pollinatorene – år etter år.
            </p>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border bg-card p-6 sm:p-8">
            <h2 className="text-xl font-semibold tracking-tight">🐝 Hva er OBNO</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Optimal Biehelse Norge (OBNO) er en frivillig organisasjon som jobber for bedre biehelse, flere pollinatorer
              og et sterkere lokalt engasjement. Vi kombinerer kunnskap og praktiske tiltak for å gjøre det enkelt å bidra.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border bg-background p-4 text-sm text-muted-foreground">
                Plassholder for bilder
              </div>
              <Link
                href="/biehelse#sponsorer"
                className="group rounded-2xl border bg-background p-4 text-sm text-muted-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="font-medium text-foreground">Sponsorer og samarbeidspartnere</div>
                <div className="mt-1">
                  Se hvem som støtter prosjektet
                  <span className="ml-1 underline underline-offset-4 group-hover:text-foreground">på Biehelse</span>
                </div>
              </Link>
            </div>
          </div>

          <div className="rounded-3xl border bg-card p-6 sm:p-8">
            <h2 className="text-xl font-semibold tracking-tight">🌼 Pollinatorprosjekter</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Vi bygger pollinatorvennlige områder der folk bor. Prosjektene handler om blomster, jord, samarbeid og
              små handlinger som gir stor effekt.
            </p>
            <div className="mt-6 rounded-2xl border bg-background p-5">
              <div className="text-sm font-medium">Vårt første prosjekt</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Pollinatorbed ved Fredriksten Festning Camping – et synlig symbol på samarbeid og naturglede.
              </p>
              <div className="mt-4">
                <Link
                  href="/mat-og-miljo"
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
                >
                  Se prosjekter
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border bg-card p-6 sm:p-8">
            <h2 className="text-xl font-semibold tracking-tight">🤝 Bli butikkpartner</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Vil du at butikken din skal være med og støtte bier og natur? Vi gjør det enkelt å bidra – og å fortelle
              kundene at dere hjelper til.
            </p>
            <div className="mt-6 grid gap-3">
              <div className="rounded-2xl border bg-background p-4 text-sm text-muted-foreground">
                Plassholder: sponsorlogoer fra butikkpartnere
              </div>
              <div className="rounded-2xl border bg-background p-4 text-sm text-muted-foreground">
                Plassholder: LEK-Biens Vokter™
              </div>
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href="mailto:post@obno.no?subject=Butikkpartner%20%E2%80%93%20OBNO"
                className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
              >
                Kontakt oss
              </a>
              <Link
                href="/bli-medlem"
                className="inline-flex h-10 items-center justify-center rounded-lg border bg-background px-4 text-sm font-medium shadow-sm hover:bg-muted"
              >
                Bli medlem
              </Link>
            </div>
          </div>

          <div className="rounded-3xl border bg-card p-6 sm:p-8">
            <h2 className="text-xl font-semibold tracking-tight">🌍 Vi er en Bievenn</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Butikker og samarbeidspartnere som støtter OBNO er med på å skape en varmere, grønnere og mer pollinatorvennlig
              hverdag lokalt. Dette er ikke corporate – det er ekte.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border bg-background p-4 text-sm text-muted-foreground">
                Plassholder for merke / badge
              </div>
              <div className="rounded-2xl border bg-background p-4 text-sm text-muted-foreground">
                Plassholder for bilde
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border bg-card p-6 sm:p-8">
          <h2 className="text-xl font-semibold tracking-tight">📬 Kontakt</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border bg-background p-5">
              <div className="text-sm font-medium">E-post</div>
              <a href="mailto:post@obno.no" className="mt-2 inline-flex text-sm underline underline-offset-4 hover:text-foreground">
                post@obno.no
              </a>
            </div>
            <div className="rounded-2xl border bg-background p-5">
              <div className="text-sm font-medium">Se mer</div>
              <div className="mt-2 flex flex-col gap-2 text-sm">
                <Link href="/om-oss" className="underline underline-offset-4 hover:text-foreground">
                  Om oss
                </Link>
                <Link href="/biehelse" className="underline underline-offset-4 hover:text-foreground">
                  Bier og biehelse
                </Link>
                <Link href="/mat-og-miljo" className="underline underline-offset-4 hover:text-foreground">
                  Lokale tiltak / prosjekter
                </Link>
              </div>
            </div>
            <div className="rounded-2xl border bg-background p-5">
              <div className="text-sm font-medium">Bli med</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Støtt arbeidet – bli medlem og hjelp oss å bygge flere pollinatorvennlige områder.
              </p>
              <div className="mt-4">
                <Link
                  href="/bli-medlem"
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
                >
                  Bli medlem
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
