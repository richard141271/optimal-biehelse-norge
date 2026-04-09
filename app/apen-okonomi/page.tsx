import Link from "next/link"

type Post = {
  dato: string
  beskrivelse: string
  belop: number
}

const inntekter: Post[] = []
const utgifter: Post[] = []

function formatKr(value: number) {
  return `${value.toLocaleString("nb-NO")} kr`
}

export default function ApenOkonomiPage() {
  const saldo =
    inntekter.reduce((sum, p) => sum + p.belop, 0) - utgifter.reduce((sum, p) => sum + p.belop, 0)
  const sistOppdatert = new Date().toLocaleDateString("nb-NO")

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
            OBNO – Åpen økonomi
          </h1>
          <p className="max-w-3xl text-muted-foreground">
            Full åpenhet: Alle midler tilhører OBNO og dokumenteres løpende. I en
            overgangsperiode kan innbetalinger gå til en midlertidig løsning frem til
            organisasjonsnummer og kontonummer er på plass.
          </p>
        </header>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border bg-card p-6 sm:p-8 lg:col-span-2">
            <h2 className="text-lg font-semibold tracking-tight">Status</h2>
            <div className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              <div>
                <div className="font-medium text-foreground">Organisasjon</div>
                <div>OBNO (under etablering)</div>
              </div>
              <div>
                <div className="font-medium text-foreground">Konto</div>
                <div>Midlertidig løsning (privat forvalter)</div>
              </div>
              <div>
                <div className="font-medium text-foreground">Sist oppdatert</div>
                <div>{sistOppdatert}</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-6 sm:p-8">
            <h2 className="text-lg font-semibold tracking-tight">Saldo</h2>
            <div className="mt-4 rounded-xl border bg-background p-5">
              <div className="text-2xl font-semibold tracking-tight">{formatKr(saldo)}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Sum inntekter minus utgifter.
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border bg-card p-6 sm:p-8">
            <h2 className="text-lg font-semibold tracking-tight">Inntekter</h2>
            <div className="mt-4 overflow-hidden rounded-xl border bg-background">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Dato</th>
                    <th className="px-4 py-3 font-medium">Beskrivelse</th>
                    <th className="px-4 py-3 font-medium">Beløp</th>
                  </tr>
                </thead>
                <tbody>
                  {inntekter.length === 0 ? (
                    <tr className="border-b">
                      <td className="px-4 py-6 text-muted-foreground" colSpan={3}>
                        Ingen registreringer ennå.
                      </td>
                    </tr>
                  ) : (
                    inntekter.map((p) => (
                      <tr key={`${p.dato}-${p.beskrivelse}`} className="border-b">
                        <td className="px-4 py-3">{p.dato}</td>
                        <td className="px-4 py-3">{p.beskrivelse}</td>
                        <td className="px-4 py-3">{formatKr(p.belop)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-6 sm:p-8">
            <h2 className="text-lg font-semibold tracking-tight">Utgifter</h2>
            <div className="mt-4 overflow-hidden rounded-xl border bg-background">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Dato</th>
                    <th className="px-4 py-3 font-medium">Beskrivelse</th>
                    <th className="px-4 py-3 font-medium">Beløp</th>
                  </tr>
                </thead>
                <tbody>
                  {utgifter.length === 0 ? (
                    <tr className="border-b">
                      <td className="px-4 py-6 text-muted-foreground" colSpan={3}>
                        Ingen registreringer ennå.
                      </td>
                    </tr>
                  ) : (
                    utgifter.map((p) => (
                      <tr key={`${p.dato}-${p.beskrivelse}`} className="border-b">
                        <td className="px-4 py-3">{p.dato}</td>
                        <td className="px-4 py-3">{p.beskrivelse}</td>
                        <td className="px-4 py-3">{formatKr(p.belop)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground sm:p-8">
          <div className="space-y-2">
            <div className="font-medium text-foreground">Midlertidig løsning</div>
            <p>
              Frem til OBNO har eget organisasjonsnummer og bankkonto, kan innbetalinger
              gå til en midlertidig forvaltning. Alle innbetalinger og utbetalinger
              dokumenteres her.
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}

