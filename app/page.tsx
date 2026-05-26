import Link from "next/link"

export default function Home() {
  return (
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
              <p className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Optimal Biehelse Norge (OBNO) er en frivillig organisasjon som jobber
                for robuste bifolk, trygge økosystemer og mer kunnskap i hele landet.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/bli-medlem"
                  className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
                >
                  Bli medlem / støtt oss
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
          <Link
            href="/mat-og-miljo"
            className="group mb-6 block rounded-2xl border bg-card p-6 transition-colors hover:bg-muted/40"
          >
            <div className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">
              Lokale tiltak
            </div>
            <div className="mt-3 text-lg font-semibold tracking-tight">
              Vårt første pollinatorprosjekt
            </div>
            <div className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Se hva vi bygger lokalt – pollinatorbed for bier, humler og naturen.
            </div>
            <div className="mt-4 inline-flex text-sm font-medium underline underline-offset-4 group-hover:text-foreground">
              Åpne prosjektet
            </div>
          </Link>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Link
              href="/bli-medlem"
              className="rounded-2xl border bg-card p-6 hover:bg-muted/40"
            >
              <div className="text-sm font-medium">Bli medlem</div>
              <div className="mt-2 text-sm text-muted-foreground">
                Registrer medlemskap og finn Vipps/bankinfo.
              </div>
            </Link>
            <Link href="/biehelse" className="rounded-2xl border bg-card p-6 hover:bg-muted/40">
              <div className="text-sm font-medium">Biehelse</div>
              <div className="mt-2 text-sm text-muted-foreground">
                Kunnskap, forebygging og tiltak.
              </div>
            </Link>
            <Link href="/om-oss" className="rounded-2xl border bg-card p-6 hover:bg-muted/40">
              <div className="text-sm font-medium">Om oss</div>
              <div className="mt-2 text-sm text-muted-foreground">
                Hvem vi er og hva vi jobber for.
              </div>
            </Link>
            <Link href="/min-side" className="rounded-2xl border bg-card p-6 hover:bg-muted/40">
              <div className="text-sm font-medium">Min side</div>
              <div className="mt-2 text-sm text-muted-foreground">
                Logg inn, se medlemskort og registrer premier.
              </div>
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
