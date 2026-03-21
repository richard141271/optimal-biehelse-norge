import { MedlemskapForm } from "@/components/landing/medlemskap-form"
import Link from "next/link"
import Image from "next/image"

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Image
              src="/logo.png"
              alt="Optimal Biehelse Norge (OBNO)"
              width={220}
              height={64}
              className="h-8 w-auto"
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
            <Link href="/prosjekter" className="hover:text-foreground">
              Prosjekter
            </Link>
            <a href="#medlemskap" className="hover:text-foreground">
              Bli medlem
            </a>
            <a href="#stott-oss" className="hover:text-foreground">
              Støtt oss
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/min-side"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              Min side
            </Link>
            <a
              href="#medlemskap"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              Bli medlem
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="border-b bg-gradient-to-b from-[color:oklch(0.97_0.03_88)] via-background to-background">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
            <div className="grid items-start gap-10">
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">
                  Fokus på biehelse, honningbier og ville pollinatorer
                </div>
                <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
                  Bedre biehelse.
                  <span className="text-primary"> Sterkere natur.</span>
                </h1>
                <p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                  Optimal Biehelse Norge er en frivillig organisasjon som jobber
                  for robuste bifolk, trygge økosystemer og mer kunnskap i hele
                  landet.
                </p>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <a
                    href="#medlemskap"
                    className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
                  >
                    Registrer medlemskap
                  </a>
                  <a
                    href="#stott-oss"
                    className="inline-flex h-9 items-center justify-center rounded-lg border bg-background px-4 text-sm font-medium hover:bg-muted"
                  >
                    Støtt arbeidet vårt
                  </a>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-4 sm:grid-cols-3">
                  <div className="rounded-xl border bg-background p-4">
                    <div className="text-sm font-medium">Kunnskap</div>
                    <div className="text-xs text-muted-foreground">
                      Kurs og veiledning
                    </div>
                  </div>
                  <div className="rounded-xl border bg-background p-4">
                    <div className="text-sm font-medium">Tiltak</div>
                    <div className="text-xs text-muted-foreground">
                      Praktisk oppfølging
                    </div>
                  </div>
                  <div className="rounded-xl border bg-background p-4">
                    <div className="text-sm font-medium">Fellesskap</div>
                    <div className="text-xs text-muted-foreground">
                      Frivillige og medlemmer
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="om-oss" className="border-b">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
            <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
              <div className="space-y-3">
                <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  Hva vi jobber for
                </h2>
                <p className="text-muted-foreground">
                  Vi ønsker å gjøre det enklere å ta gode valg for bier og
                  pollinatorer, både for birøktere og for alle som vil bidra i
                  nærmiljøet.
                </p>
                <div>
                  <Link
                    href="/om-oss"
                    className="inline-flex h-9 items-center justify-center rounded-lg border bg-background px-4 text-sm font-medium hover:bg-muted"
                  >
                    Les mer om oss
                  </Link>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border bg-card p-5">
                  <div className="text-sm font-medium">Forebygging</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Fokus på helse, miljø og rutiner som gir robuste bifolk.
                  </p>
                </div>
                <div className="rounded-xl border bg-card p-5">
                  <div className="text-sm font-medium">Samarbeid</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Vi bygger nettverk mellom frivillige, fagmiljø og lokallag.
                  </p>
                </div>
                <div className="rounded-xl border bg-card p-5">
                  <div className="text-sm font-medium">Kunnskapsdeling</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Tilgjengelige ressurser, tips og oppdateringer gjennom året.
                  </p>
                </div>
                <div className="rounded-xl border bg-card p-5">
                  <div className="text-sm font-medium">Pollinatorvennlig</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Tiltak for ville pollinatorer i hager, parker og kulturlandskap.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="medlemskap" className="border-b">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
            <div className="grid items-start gap-10 lg:grid-cols-[1fr_1fr] lg:gap-12">
              <div className="space-y-3">
                <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  Medlemsregistrering
                </h2>
                <p className="text-muted-foreground">
                  Medlemskap gir oss forutsigbarhet og gjør det mulig å planlegge
                  tiltak. Du kan når som helst be oss slette informasjonen din.
                </p>
                <div className="rounded-xl border bg-card p-5">
                  <div className="text-sm font-medium">Hva skjer etterpå?</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Vi sender praktisk info om kontingent og hvordan du kan bidra.
                  </p>
                </div>
              </div>
              <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
                <MedlemskapForm />
              </div>
            </div>
          </div>
        </section>

        <section id="stott-oss">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
            <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-12">
              <div className="space-y-3">
                <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  Støtt oss
                </h2>
                <p className="text-muted-foreground">
                  Bidrag går til kunnskapsarbeid, utstyr og aktiviteter som styrker
                  biehelse og pollinatorer. Betalingsinformasjon legges inn her.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border bg-card p-5">
                  <div className="text-sm font-medium">Vipps</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Plassholder for Vipps-nummer.
                  </p>
                </div>
                <div className="rounded-xl border bg-card p-5">
                  <div className="text-sm font-medium">Bankoverføring</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Plassholder for kontonummer/IBAN.
                  </p>
                </div>
                <div className="rounded-xl border bg-card p-5">
                  <div className="text-sm font-medium">Bedriftsstøtte</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Plassholder for samarbeid og spons.
                  </p>
                </div>
                <div className="rounded-xl border bg-card p-5">
                  <div className="text-sm font-medium">Gave</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Plassholder for gavebrev og støttealternativer.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Optimal Biehelse Norge (OBNO)</p>
          <p>Frivillig organisasjon for bier og pollinatorer</p>
        </div>
      </footer>
    </div>
  );
}
