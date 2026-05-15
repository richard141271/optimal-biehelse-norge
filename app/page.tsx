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
                  <div className="text-sm font-medium">Betal kontingent med Vipps</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Vipps til #52387:
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      href="/vipps?belop=100&type=medlemskap"
                      className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
                    >
                      Medlemskap 100 kr
                    </Link>
                    <Link
                      href="/vipps?belop=300&type=stottemedlem"
                      className="inline-flex h-9 items-center justify-center rounded-lg border bg-background px-4 text-sm font-medium hover:bg-muted"
                    >
                      Støttemedlem 300 kr
                    </Link>
                  </div>
                  <div className="mt-3 space-y-1 text-sm">
                    <div>
                      <span className="font-medium">Medlemskap:</span> 100 kr / år
                    </div>
                    <div>
                      <span className="font-medium">Støttemedlem:</span> 300 kr / år
                    </div>
                  </div>
                  <div className="mt-4 rounded-xl border bg-muted/30 p-4 text-sm">
                    <div className="font-medium">Hva er forskjellen?</div>
                    <div className="mt-2 text-muted-foreground">
                      <span className="font-medium text-foreground">Medlem</span> er vanlig kontingent og gir aktivt medlemskap.
                      <span className="ml-1 font-medium text-foreground">Støttemedlem</span> er samme medlemskap, men med høyere
                      kontingent for deg som vil støtte arbeidet vårt ekstra.
                    </div>
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <p>Skann QR-koden eller søk opp #52387 i Vipps.</p>
                    <p>
                      Bankoverføring:{" "}
                      <span className="font-medium text-foreground">
                        3626 75 74418
                      </span>
                    </p>
                  </div>
                  <div className="mt-3 inline-flex rounded-xl border bg-background p-3">
                    <Image
                      src="/qr.png"
                      alt="Vipps QR-kode"
                      width={220}
                      height={220}
                      className="h-auto w-[160px] sm:w-[200px]"
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    <Link href="/apen-okonomi" className="underline underline-offset-4">
                      Se Åpen økonomi
                    </Link>
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
                  biehelse og pollinatorer. Du kan støtte oss med Vipps eller bankoverføring.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border bg-card p-5">
                  <div className="text-sm font-medium">Vipps</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Vipps-nummer:{" "}
                    <span className="font-medium text-foreground">
                      #52387
                    </span>
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      href="/vipps?belop=100&type=medlemskap"
                      className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
                    >
                      Medlemskap 100 kr
                    </Link>
                    <Link
                      href="/vipps?belop=300&type=stottemedlem"
                      className="inline-flex h-9 items-center justify-center rounded-lg border bg-background px-4 text-sm font-medium hover:bg-muted"
                    >
                      Støttemedlem 300 kr
                    </Link>
                  </div>
                  <div className="mt-3 space-y-1 text-sm">
                    <div>
                      <span className="font-medium">Medlemskap:</span> 100 kr / år
                    </div>
                    <div>
                      <span className="font-medium">Støttemedlem:</span> 300 kr / år
                    </div>
                  </div>
                  <div className="mt-3 inline-flex rounded-xl border bg-background p-3">
                    <Image
                      src="/qr.png"
                      alt="Vipps QR-kode"
                      width={220}
                      height={220}
                      className="h-auto w-[160px] sm:w-[200px]"
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    <Link href="/apen-okonomi" className="underline underline-offset-4">
                      Se Åpen økonomi
                    </Link>
                  </p>
                </div>
                <div className="rounded-xl border bg-card p-5">
                  <div className="text-sm font-medium">Bankoverføring</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Kontonummer:{" "}
                    <span className="font-medium text-foreground">
                      3626 75 74418
                    </span>
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
          <p>
            Kontakt:{" "}
            <a href="mailto:post@obno.no" className="underline underline-offset-4 hover:text-foreground">
              post@obno.no
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
