import Image from "next/image"
import Link from "next/link"
import { createClient } from "@supabase/supabase-js"
import { ButikkpartnerAvtale } from "@/components/butikkpartner-avtale"

export const dynamic = "force-dynamic"

async function fetchAvtale(): Promise<string> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return ""

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { data, error } = await admin
    .from("butikkpartner_avtale")
    .select("innhold")
    .eq("id", 1)
    .maybeSingle()

  if (error) return ""
  return String((data as { innhold?: string } | null)?.innhold ?? "")
}

export default async function ButikkpartnerPage() {
  const avtale = await fetchAvtale()

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
              <div className="overflow-hidden rounded-2xl border bg-background">
                <Image
                  src="/prosjekt-pollinatorbed-hero.svg"
                  alt="Pollinatorbed ved Fredriksten Festning Camping"
                  width={600}
                  height={300}
                  className="h-full w-full object-cover"
                />
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
            <div className="mt-6 overflow-hidden rounded-2xl border bg-background">
              <Image
                src="/prosjekt-pollinatorbed-dugnad.svg"
                alt="Dugnad for pollinatorbed"
                width={600}
                height={300}
                className="h-auto w-full object-cover"
              />
              <div className="p-5">
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
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border bg-card p-6 sm:p-8">
            <h2 className="text-xl font-semibold tracking-tight">🤝 Bli sponsor</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Vil du at butikken eller bedriften din skal støtte bier og natur? Vi gjør det enkelt å bidra – og å fortelle
              kundene at dere hjelper til.
            </p>
            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border bg-background p-4">
                <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Våre sponsorer
                </div>
                <div className="flex flex-wrap items-center gap-5">
                  <Image
                    src="/sponsor-logos/florea.png"
                    alt="Florea"
                    width={90}
                    height={40}
                    className="h-10 w-auto object-contain opacity-90"
                  />
                  <Image
                    src="/sponsor-logos/kalesje-industrisom.png"
                    alt="Kalesje & Industrisøm AS"
                    width={110}
                    height={40}
                    className="h-10 w-auto object-contain opacity-90"
                  />
                  <Image
                    src="/sponsor-logos/botanisk-verden.png"
                    alt="Botanisk verden"
                    width={110}
                    height={40}
                    className="h-10 w-auto object-contain opacity-90"
                  />
                </div>
              </div>
              <a
                href="https://lekbie.no"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-4 rounded-2xl border bg-background p-4 transition-colors hover:bg-muted/40"
              >
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-primary/5">
                  <Image
                    src="/lek-biens-vokter.svg"
                    alt="LEK-Biens Vokter logo"
                    width={56}
                    height={56}
                    className="h-14 w-auto"
                  />
                </div>
                <div>
                  <div className="text-sm font-medium">LEK-Biens Vokter™</div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Et initiativ for å vokte og beskytte lokale bier og pollinatorer.
                  </p>
                  <div className="mt-1 text-xs font-medium text-primary">
                    lekbie.no ↗
                  </div>
                </div>
              </a>
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href="mailto:post@obno.no?subject=Sponsor%20%E2%80%93%20OBNO"
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
              <div className="flex flex-col items-center gap-2 rounded-2xl border bg-background p-4 text-center">
                <Image
                  src="/QR-kode-OBNO.png"
                  alt="QR-kode for OBNO"
                  width={96}
                  height={96}
                  className="h-24 w-24 object-contain"
                />
                <div className="text-xs text-muted-foreground">Skann for å lære mer</div>
              </div>
              <div className="overflow-hidden rounded-2xl border bg-background">
                <Image
                  src="/prosjekt-pollinatorbed-skilt.svg"
                  alt="Skilt for pollinatorbed"
                  width={300}
                  height={160}
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
            <div className="mt-6">
              <ButikkpartnerAvtale innhold={avtale} />
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
