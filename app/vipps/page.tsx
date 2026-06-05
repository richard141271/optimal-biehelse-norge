import Link from "next/link"
import Image from "next/image"

const vippsNummer = "52387"

export default function VippsPage() {
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
            Betal med Vipps
          </h1>
          <p className="max-w-3xl text-muted-foreground">
            Åpne Vipps og betal manuelt til #{vippsNummer}.
          </p>
        </header>

        <section className="rounded-2xl border bg-card p-6 sm:p-8">
          <div className="text-sm font-medium">Vipps</div>
          <div className="mt-3 space-y-2 text-sm text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">Vipps-nummer:</span> #{vippsNummer}
            </div>
            <div>Åpne Vipps og betal manuelt til #{vippsNummer}.</div>
          </div>

          <div className="mt-5 space-y-2">
            <div className="inline-flex rounded-xl border bg-background p-3">
              <Image
                src="/QR-kode-52387.png"
                alt="Vipps QR-kode #52387"
                width={220}
                height={220}
                className="h-auto w-[160px] sm:w-[200px]"
                priority
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Skann QR-koden med mobilen for å åpne Vipps.
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href="/"
              className="inline-flex h-9 items-center justify-center rounded-lg border bg-background px-4 text-sm font-medium hover:bg-muted"
            >
              Tilbake
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}
