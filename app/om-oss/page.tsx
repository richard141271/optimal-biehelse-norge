import Image from "next/image"
import Link from "next/link"

export default function OmOssPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <div className="space-y-10">
        <header className="space-y-3">
          <div className="text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground">
              Til forsiden
            </Link>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Om oss
          </h1>
          <p className="max-w-3xl text-muted-foreground">
            Optimal Biehelse Norge (OBNO) er en frivillig organisasjon som jobber
            for bedre biehelse og flere pollinatorer gjennom kunnskap, tiltak og
            samarbeid.
          </p>
        </header>

        <section className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-start">
          <div className="rounded-2xl border bg-card p-6 sm:p-8">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold tracking-tight">Vår logo</h2>
              <p className="text-sm text-muted-foreground">
                Logoen er laget for å fungere både som app-ikon på mobilen og
                som tydelig logo på nettsiden.
              </p>
            </div>

            <div className="mt-6 rounded-xl border bg-background p-5">
              <Image
                src="/logo.png"
                alt="OBNO-logo"
                width={960}
                height={360}
                className="h-auto w-full"
                priority
              />
            </div>

            <div className="mt-6 space-y-3 text-sm text-muted-foreground">
              <div className="font-medium text-foreground">
                Logoen skal være:
              </div>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  Enkel og ikonisk: Den må se bra ut både som liten app-ikon og
                  stor logo.
                </li>
                <li>
                  Moderne, men organisk: Den viser balansen mellom natur og
                  seriøsitet.
                </li>
                <li>
                  Inkluderende: Den hinter til mer enn bare én klassisk
                  “stripebie”.
                </li>
              </ul>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border bg-card p-6 sm:p-8">
              <h2 className="text-xl font-semibold tracking-tight">
                Logo-konsept: “Hjertet av pollinering”
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Konseptet smelter sammen tre elementer: en stilisert bie, en
                dråpe (honning, sunnhet og vitalitet) og en hjerteform (omsorg og
                frivillighet).
              </p>

              <div className="mt-5 space-y-3 text-sm text-muted-foreground">
                <div className="font-medium text-foreground">
                  Slik er ikonet bygget opp:
                </div>
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    Dråpen: Honningfarget dråpe som symboliserer vitalitet og det
                    optimale i biehelse.
                  </li>
                  <li>
                    Vingene: Åpne, geometriske former som peker opp og frem og
                    indikerer bevegelse og fremgang.
                  </li>
                  <li>
                    Inkludering: Åpne former som favner alle typer bier og
                    pollinatorer.
                  </li>
                  <li>
                    Kroppen/bakpart: Subtil antydning til en hjerteform som
                    viser omsorg og frivillighet.
                  </li>
                </ul>
              </div>
            </div>

            <div className="rounded-2xl border bg-card p-6 sm:p-8">
              <h2 className="text-xl font-semibold tracking-tight">
                For lokallag og samarbeid
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                For gjenkjennelighet og et samlet uttrykk skal samme logo brukes
                av lokallag, samarbeidspartnere og i kommunikasjon knyttet til
                OBNO.
              </p>
              <div className="mt-4">
                <a
                  href="/logo.png"
                  className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
                >
                  Last ned logo (PNG)
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

