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

        <section className="rounded-2xl border bg-card p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold tracking-tight">Virksomhetsinformasjon</h2>
              <p className="text-sm text-muted-foreground">
                Offisielle opplysninger fra Brønnøysundregistrene.
              </p>
            </div>
            <a
              href="https://w2.brreg.no/enhet/sok/detalj.jsp?orgnr=937528191"
              target="_blank"
              rel="noreferrer"
              className="text-sm underline underline-offset-4"
            >
              Se i Brønnøysundregistrene
            </a>
          </div>

          <div className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-xl border bg-background/70 p-4">
              <div className="text-xs text-muted-foreground">Organisasjonsnummer</div>
              <div className="font-medium">937 528 191</div>
            </div>
            <div className="rounded-xl border bg-background/70 p-4">
              <div className="text-xs text-muted-foreground">Organisasjonsform</div>
              <div className="font-medium">Forening/lag/innretning</div>
            </div>
            <div className="rounded-xl border bg-background/70 p-4 sm:col-span-2">
              <div className="text-xs text-muted-foreground">Forretningsadresse</div>
              <div className="font-medium">
                Fredriksrydveien 2, 1792 Tistedal
              </div>
            </div>
            <div className="rounded-xl border bg-background/70 p-4">
              <div className="text-xs text-muted-foreground">Kommune / land</div>
              <div className="font-medium">3101 Halden, Norge</div>
            </div>
            <div className="rounded-xl border bg-background/70 p-4">
              <div className="text-xs text-muted-foreground">Næringskode</div>
              <div className="font-medium">94.992 – Aktiviteter i andre medlemsorganisasjoner ellers</div>
            </div>
            <div className="rounded-xl border bg-background/70 p-4">
              <div className="text-xs text-muted-foreground">Stiftelsesdato</div>
              <div className="font-medium">5. april 2026</div>
            </div>
            <div className="rounded-xl border bg-background/70 p-4">
              <div className="text-xs text-muted-foreground">Registrert i Enhetsregisteret</div>
              <div className="font-medium">21. april 2026</div>
            </div>
            <div className="rounded-xl border bg-background/70 p-4">
              <div className="text-xs text-muted-foreground">Institusjonell sektorkode</div>
              <div className="font-medium">7000 – Ideelle organisasjoner</div>
            </div>
            <div className="rounded-xl border bg-background/70 p-4">
              <div className="text-xs text-muted-foreground">Målform</div>
              <div className="font-medium">Bokmål</div>
            </div>
            <div className="rounded-xl border bg-background/70 p-4 sm:col-span-2">
              <div className="text-xs text-muted-foreground">Aktivitet</div>
              <div className="font-medium">
                Foreningen arbeider for å forbedre helse og levevilkår for honningbier og ville pollinatorer.
                Dette gjøres gjennom informasjonsarbeid, kunnskapsdeling, støtte til tiltak og samarbeid med fagmiljøer.
                Arbeidet er ideelt og uten økonomisk formål.
              </div>
            </div>
            <div className="rounded-xl border bg-background/70 p-4 sm:col-span-2">
              <div className="text-xs text-muted-foreground">Antall ansatte</div>
              <div className="font-medium">Ingen registrerte ansatte</div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
