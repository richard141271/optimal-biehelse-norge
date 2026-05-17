import { MedlemskapForm } from "@/components/landing/medlemskap-form"
import Image from "next/image"
import Link from "next/link"

export default function BliMedlemPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <div className="space-y-10">
        <header className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Bli medlem / støtt OBNO
          </h1>
          <p className="max-w-3xl text-muted-foreground">
            Medlemskap gir oss forutsigbarhet og gjør det mulig å planlegge tiltak.
            Du kan også støtte oss ekstra gjennom støttemedlemskap eller donasjon.
          </p>
        </header>

        <section className="grid items-start gap-10 lg:grid-cols-[1fr_1fr] lg:gap-12">
          <div className="space-y-4">
            <div className="rounded-2xl border bg-card p-6 sm:p-8">
              <div className="text-sm font-medium">Betal med Vipps</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Vipps til <span className="font-medium text-foreground">#52387</span>
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
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
                <Link
                  href="/vipps?type=donasjon"
                  className="inline-flex h-9 items-center justify-center rounded-lg border bg-background px-4 text-sm font-medium hover:bg-muted"
                >
                  Donasjon (valgfritt)
                </Link>
              </div>

              <div className="mt-4 space-y-1 text-sm">
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
                  <span className="font-medium text-foreground">Medlem</span> er vanlig
                  kontingent og gir aktivt medlemskap.{" "}
                  <span className="font-medium text-foreground">Støttemedlem</span> er
                  samme medlemskap, men med høyere kontingent for deg som vil støtte
                  arbeidet vårt ekstra.
                </div>
              </div>

              <div className="mt-4 space-y-1 text-sm text-muted-foreground">
                <div>
                  Bankoverføring:{" "}
                  <span className="font-medium text-foreground">3626 75 74418</span>
                </div>
              </div>

              <div className="mt-4 inline-flex rounded-xl border bg-background p-3">
                <Image
                  src="/qr.png"
                  alt="Vipps QR-kode"
                  width={220}
                  height={220}
                  className="h-auto w-[160px] sm:w-[200px]"
                  priority
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
            <div className="space-y-1">
              <div className="text-sm font-medium">Registrer innlogging</div>
              <p className="text-sm text-muted-foreground">
                Fyll inn info og lag et passord. Etterpå kan du logge inn på Min side.
              </p>
            </div>
            <div className="mt-4">
              <MedlemskapForm />
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

