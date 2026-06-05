import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

type Shop = {
  id: string
  name: string
  address: string | null
  locationType: string | null
  updatedAt: string | null
  imageUrl: string | null
}

const bucket = "bie-eske-system"

function asString(v: unknown) {
  return String(v ?? "").trim()
}

function formatWhen(iso: string | null) {
  const s = String(iso ?? "").trim()
  if (!s) return ""
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("nb-NO", { year: "numeric", month: "2-digit", day: "2-digit" })
}

async function fetchShops(): Promise<{ ok: true; shops: Shop[] } | { ok: false; feil: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl) return { ok: false, feil: "Supabase er ikke konfigurert." }
  if (!serviceRoleKey) return { ok: false, feil: "Mangler SUPABASE_SERVICE_ROLE_KEY." }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  const { data: saldoRows, error: saldoErr } = await admin
    .from("lek_v2_lager_saldo")
    .select("lager_id, qty")
    .eq("item", "bie_eske")
    .gt("qty", 0)
    .limit(5000)

  if (saldoErr) return { ok: false, feil: "Kunne ikke hente lokasjoner." }

  const locationIds = (saldoRows ?? [])
    .map((r) => asString((r as { lager_id?: unknown }).lager_id))
    .filter(Boolean)

  if (!locationIds.length) return { ok: true, shops: [] }

  const { data: locations, error: locErr } = await admin
    .from("lek_v2_lager")
    .select("id, name, address, location_type, updated_at, active")
    .eq("kind", "location")
    .eq("active", true)
    .in("id", locationIds)
    .limit(5000)

  if (locErr) return { ok: false, feil: "Kunne ikke hente lokasjoner." }

  const locationsClean = (locations ?? [])
    .map((l) => l as Record<string, unknown>)
    .map((l) => ({
      id: asString(l.id),
      name: asString(l.name),
      address: asString(l.address) || null,
      locationType: asString(l.location_type) || null,
      updatedAt: asString(l.updated_at) || null,
    }))
    .filter((l) => l.id && l.name)

  if (!locationsClean.length) return { ok: true, shops: [] }

  const { data: events, error: evErr } = await admin
    .from("lek_v2_lokasjon_hendelser")
    .select("location_lager_id, created_at, image1_path, image2_path, image3_path")
    .in(
      "location_lager_id",
      locationsClean.map((l) => l.id)
    )
    .order("created_at", { ascending: false })
    .limit(5000)

  if (evErr) return { ok: false, feil: "Kunne ikke hente bilder." }

  const imagePathByLoc = new Map<string, string>()
  for (const e of (events ?? []) as Array<Record<string, unknown>>) {
    const locId = asString(e.location_lager_id)
    if (!locId || imagePathByLoc.has(locId)) continue
    const paths = [e.image1_path, e.image2_path, e.image3_path].map(asString).filter(Boolean)
    if (paths.length) imagePathByLoc.set(locId, paths[0])
  }

  const imageUrlByLoc = new Map<string, string>()
  for (const l of locationsClean) {
    const path = imagePathByLoc.get(l.id) ?? ""
    if (!path) continue
    const { data } = await admin.storage.from(bucket).createSignedUrl(path, 60 * 10)
    const url = asString((data as { signedUrl?: unknown } | null)?.signedUrl)
    if (url) imageUrlByLoc.set(l.id, url)
  }

  const shops: Shop[] = locationsClean
    .map((l) => ({
      id: l.id,
      name: l.name,
      address: l.address,
      locationType: l.locationType,
      updatedAt: l.updatedAt,
      imageUrl: imageUrlByLoc.get(l.id) ?? null,
    }))
    .sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? ""), "nb-NO"))

  return { ok: true, shops }
}

export default async function ButikkerMedBieEskePage() {
  const res = await fetchShops()

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Butikker med Bie-Eske</h1>
          <p className="text-sm text-muted-foreground">
            Automatisk oversikt over aktive lokasjoner som har registrert Bie-Eske. Når esken hentes inn, forsvinner butikken herfra.
          </p>
        </header>

        {!res.ok ? (
          <div className="rounded-2xl border bg-card p-6 text-sm">{res.feil}</div>
        ) : res.shops.length ? (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {res.shops.map((s) => (
              <div key={s.id} className="overflow-hidden rounded-2xl border bg-card">
                <div className="h-44 w-full bg-muted/30">
                  {s.imageUrl ? (
                    <a href={s.imageUrl} target="_blank" rel="noreferrer" className="block h-full w-full">
                      <img src={s.imageUrl} alt={s.name} className="h-full w-full object-cover" />
                    </a>
                  ) : null}
                </div>
                <div className="space-y-1 p-4">
                  <div className="text-base font-semibold">{s.name}</div>
                  <div className="text-sm text-muted-foreground">{s.address || "Ukjent adresse"}</div>
                  <div className="text-xs text-muted-foreground">
                    {(s.locationType || "Ukjent type") + (s.updatedAt ? ` · Oppdatert ${formatWhen(s.updatedAt)}` : "")}
                  </div>
                </div>
              </div>
            ))}
          </section>
        ) : (
          <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">Ingen butikker registrert enda.</div>
        )}
      </div>
    </main>
  )
}
