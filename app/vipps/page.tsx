import Link from "next/link"
import Image from "next/image"

const vippsNummer = "52387"

function normalizeType(type: string | undefined) {
  const raw = String(type ?? "").trim().toLowerCase()
  if (raw === "lodd" || raw === "loddsalg") return "lodd"
  if (raw === "donasjon" || raw === "donere" || raw === "donate") return "donasjon"
  if (raw === "stottemedlem" || raw === "støttemedlem" || raw === "stotte") {
    return "stottemedlem"
  }
  return "medlemskap"
}

type SearchParams = Record<string, string | string[] | undefined>

function getFirst(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0]
  return value
}

export default function VippsPage({ searchParams }: { searchParams?: SearchParams }) {
  const rawType = getFirst(searchParams?.type)
  const type = normalizeType(rawType)
  const rawBelop = (getFirst(searchParams?.belop) ?? "").trim()
  const ref = (getFirst(searchParams?.ref) ?? "").trim()
  const ticketFrom = (getFirst(searchParams?.ticketFrom) ?? "").trim()
  const ticketTo = (getFirst(searchParams?.ticketTo) ?? "").trim()
  const returnHref = (getFirst(searchParams?.return) ?? "").trim()
  const parsedBelop = Number(rawBelop)
  const belop =
    Number.isFinite(parsedBelop) && parsedBelop > 0 ? Math.round(parsedBelop) : null

  const forslagMelding =
    type === "lodd"
      ? `OBNO Lodd ${ref || ""}`.trim()
      : type === "donasjon"
        ? "OBNO Donasjon"
        : type === "stottemedlem"
          ? "OBNO Støttemedlem"
          : "OBNO Medlemskap"

  const tittel =
    type === "lodd"
      ? "Loddsalg"
      : type === "donasjon"
        ? "Donasjon"
        : type === "stottemedlem"
          ? "Støttemedlem"
          : "Medlemskap"

  const tilbakeHref = returnHref || (type === "lodd" ? "/lodd" : "/bli-medlem")

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
            Denne lenken fungerer i alle nettlesere. På mobil kan du åpne Vipps-appen
            direkte. På PC/Mac viser vi informasjonen du trenger for å betale i Vipps.
          </p>
        </header>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border bg-card p-6 sm:p-8">
            <div className="text-sm font-medium">{tittel}</div>
            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
              {type === "lodd" && ticketFrom && ticketTo ? (
                <div>
                  <span className="font-medium text-foreground">Dine lodd:</span>{" "}
                  {ticketFrom}–{ticketTo}
                </div>
              ) : null}
              <div>
                <span className="font-medium text-foreground">Vipps-nummer:</span>{" "}
                #{vippsNummer}
              </div>
              <div>
                <span className="font-medium text-foreground">Beløp:</span>{" "}
                {belop ? `${belop} kr` : "Velg beløp i Vipps"}
              </div>
              <div>
                <span className="font-medium text-foreground">Melding:</span>{" "}
                {forslagMelding}
              </div>
            </div>

            <div className="mt-5">
              <div className="text-sm font-medium">QR-kode</div>
              <div className="mt-2 inline-flex rounded-xl border bg-background p-3">
                <Image
                  src="/qr.png"
                  alt="Vipps QR-kode"
                  width={220}
                  height={220}
                  className="h-auto w-[180px] sm:w-[220px]"
                  priority
                />
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Skann QR-koden for å åpne Vipps.
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <a
                href="vipps://"
                className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
              >
                Åpne Vipps
              </a>
              <Link
                href={tilbakeHref}
                className="inline-flex h-9 items-center justify-center rounded-lg border bg-background px-4 text-sm font-medium hover:bg-muted"
              >
                Tilbake
              </Link>
            </div>

            <div className="mt-6 space-y-2 text-sm text-muted-foreground">
              <div className="font-medium text-foreground">Slik betaler du:</div>
              <ol className="list-decimal space-y-1 pl-5">
                <li>Åpne Vipps og søk opp #{vippsNummer}.</li>
                <li>
                  Velg beløp (
                  {belop
                    ? `${belop} kr`
                    : type === "lodd"
                      ? "20 kr per lodd (velg antall)"
                      : "100 kr eller 300 kr"}
                  ).
                </li>
                <li>Skriv gjerne meldingen “{forslagMelding}”.</li>
              </ol>
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-6 sm:p-8">
            <div className="text-sm font-medium">Hvis Vipps ikke åpner</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Noen nettlesere/innstillinger kan blokkere app-åpning. Da kan du åpne
              Vipps manuelt og bruke #{vippsNummer}.
            </p>
            <div className="mt-4 space-y-2 text-sm">
              <a
                className="text-primary underline-offset-4 hover:underline"
                href="https://apps.apple.com/no/app/vipps/id984380185"
                target="_blank"
                rel="noreferrer"
              >
                Last ned Vipps (iPhone)
              </a>
              <a
                className="block text-primary underline-offset-4 hover:underline"
                href="https://play.google.com/store/apps/details?id=no.dnb.vipps"
                target="_blank"
                rel="noreferrer"
              >
                Last ned Vipps (Android)
              </a>
            </div>
            <div className="mt-6">
              <Link
                href={tilbakeHref}
                className="inline-flex h-9 items-center justify-center rounded-lg border bg-background px-4 text-sm font-medium hover:bg-muted"
              >
                Tilbake
              </Link>
            </div>
            <div className="mt-4 text-sm text-muted-foreground">
              Spørsmål?{" "}
              <a href="mailto:post@obno.no" className="underline underline-offset-4 hover:text-foreground">
                post@obno.no
              </a>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
