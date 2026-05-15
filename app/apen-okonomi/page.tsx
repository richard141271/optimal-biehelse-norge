import Link from "next/link"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

const apenOkonomiStartDato = "2026-04-09"

type RegnskapPost = {
  id: string
  dato: string
  type: string
  belop: number | string
  motpart: string | null
  vare: string | null
  notat: string | null
}

function parseIsoDate(value: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const da = Number(m[3])
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(da)) return null
  return new Date(y, mo - 1, da)
}

function formatDato(value: string) {
  const d = parseIsoDate(value)
  if (!d) return value
  return d.toLocaleDateString("nb-NO")
}

function formatKr(value: number) {
  return `${value.toLocaleString("nb-NO")} kr`
}

function toNumber(value: number | string) {
  if (typeof value === "number") return value
  const n = Number(String(value).replace(",", "."))
  if (!Number.isFinite(n)) return 0
  return n
}

function describeRow(p: RegnskapPost) {
  return (p.vare ?? "").trim() || "—"
}

export default async function ApenOkonomiPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const startDatoLabel = formatDato(apenOkonomiStartDato)
  const sistOppdatert = new Date().toLocaleDateString("nb-NO")

  let rows: RegnskapPost[] = []
  let feil: string | null = null

  if (!supabaseUrl || !serviceRoleKey) {
    feil = "Regnskap er ikke konfigurert ennå."
  } else {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    const { data, error } = await admin
      .from("regnskap_poster")
      .select("id, dato, type, belop, motpart, vare, notat")
      .gte("dato", apenOkonomiStartDato)
      .order("dato", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1000)

    if (error) {
      feil = "Kunne ikke hente regnskap."
    } else {
      rows = (data ?? []) as RegnskapPost[]
    }
  }

  const inntekter = rows
    .filter((p) => String(p.type).toLowerCase() === "inntekt")
    .map((p) => ({
      id: p.id,
      dato: formatDato(p.dato),
      beskrivelse: describeRow(p),
      belop: toNumber(p.belop),
    }))

  const utgifter = rows
    .filter((p) => String(p.type).toLowerCase() === "utgift")
    .map((p) => ({
      id: p.id,
      dato: formatDato(p.dato),
      beskrivelse: describeRow(p),
      belop: toNumber(p.belop),
    }))

  const saldo = inntekter.reduce((sum, p) => sum + p.belop, 0) - utgifter.reduce((sum, p) => sum + p.belop, 0)

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
            kontonummer er på plass.
          </p>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Viser regnskapsposter fra og med {startDatoLabel}. Eldre historikk vises ikke her.
          </p>
        </header>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border bg-card p-6 sm:p-8 lg:col-span-2">
            <h2 className="text-lg font-semibold tracking-tight">Status</h2>
            <div className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              <div>
                <div className="font-medium text-foreground">Organisasjon</div>
                <div>Optimal Biehelse Norge (OBNO)</div>
                <div className="text-xs text-muted-foreground">Org.nr. 937 528 191</div>
              </div>
              <div>
                <div className="font-medium text-foreground">Konto</div>
                <div>Kontonummer: 3626 75 74418</div>
              </div>
              <div>
                <div className="font-medium text-foreground">Sist oppdatert</div>
                <div>{sistOppdatert}</div>
              </div>
              <div>
                <div className="font-medium text-foreground">Kontakt</div>
                <a href="mailto:post@obno.no" className="underline underline-offset-4 hover:text-foreground">
                  post@obno.no
                </a>
              </div>
            </div>
            {feil ? (
              <div className="mt-4 text-sm text-muted-foreground">{feil}</div>
            ) : null}
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
                      <tr key={p.id} className="border-b">
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
                      <tr key={p.id} className="border-b">
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
            <div className="font-medium text-foreground">Innbetalinger</div>
            <p>
              OBNO har organisasjonsnummer (937 528 191) og kontonummer 3626 75 74418.
              Alle innbetalinger og utbetalinger dokumenteres her.
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}
