import type { SupabaseClient } from "@supabase/supabase-js"
import { labelForMedlemskapstype, prisForMedlemskapstype } from "@/lib/vervekampanje"

export type MedlemskontingentRad = {
  id: string | number
  medlemsnummer?: number | null
  medlemskap_type?: string | null
  navn?: string | null
  epost?: string | null
  aktiv?: boolean | null
  kontingent_betalt_at?: string | null
  kontingent_gyldig_til?: string | null
}

export const regnskapSchemaFeil =
  "Regnskap-tabellen i Supabase mangler felter. Kjør denne SQL-en i Supabase (SQL Editor), og prøv igjen:\n\n" +
  "create table if not exists public.regnskap_poster (\n" +
  "  id uuid primary key default gen_random_uuid(),\n" +
  "  created_at timestamptz not null default now(),\n" +
  "  dato date not null,\n" +
  "  type text not null,\n" +
  "  belop numeric not null,\n" +
  "  motpart text,\n" +
  "  vare text,\n" +
  "  notat text,\n" +
  "  bilag_path text,\n" +
  "  bilag_ocr_text text,\n" +
  "  kilde text,\n" +
  "  utlegg_medlem_id text,\n" +
  "  utlegg_medlem_navn text,\n" +
  "  utlegg_medlem_epost text,\n" +
  "  utlegg_status text,\n" +
  "  utlegg_utbetalt_at timestamptz\n" +
  ");\n" +
  "alter table public.regnskap_poster add column if not exists bilag_ocr_text text;\n" +
  "alter table public.regnskap_poster add column if not exists kilde text;\n" +
  "alter table public.regnskap_poster add column if not exists utlegg_medlem_id text;\n" +
  "alter table public.regnskap_poster add column if not exists utlegg_medlem_navn text;\n" +
  "alter table public.regnskap_poster add column if not exists utlegg_medlem_epost text;\n" +
  "alter table public.regnskap_poster add column if not exists utlegg_status text;\n" +
  "alter table public.regnskap_poster add column if not exists utlegg_utbetalt_at timestamptz;\n"

export function isRegnskapSchemaError(msg: string) {
  const m = msg.toLowerCase()
  if (m.includes("42p01")) return true
  if (m.includes("schema cache") && m.includes("regnskap_poster")) return true
  if (m.includes("relation") && m.includes("regnskap_poster") && m.includes("does not exist")) return true
  if (m.includes("could not find the table") && m.includes("regnskap_poster")) return true
  if (m.includes("column") && (m.includes("regnskap_poster") || m.includes("kilde"))) return true
  return false
}

function formatKr(value: number) {
  return new Intl.NumberFormat("nb-NO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function paymentDato(iso?: string | null) {
  const value = String(iso ?? "").trim()
  if (!value) return null
  return value.includes("T") ? value.slice(0, 10) : value
}

function paymentYear(iso?: string | null) {
  const dato = paymentDato(iso)
  if (!dato || dato.length < 4) return null
  return dato.slice(0, 4)
}

function kildeForMember(member: MedlemskontingentRad) {
  const year = paymentYear(member.kontingent_betalt_at)
  if (!year) return null
  return `medlemskontingent:${String(member.id)}:${year}`
}

function regnskapPayload(member: MedlemskontingentRad) {
  const dato = paymentDato(member.kontingent_betalt_at)
  if (!dato) return null
  const belop = prisForMedlemskapstype(member.medlemskap_type)
  const typeLabel = labelForMedlemskapstype(member.medlemskap_type)
  const motpart =
    String(member.navn ?? "").trim() ||
    String(member.epost ?? "").trim() ||
    (member.medlemsnummer != null ? `Medlem #${member.medlemsnummer}` : "Medlem")
  const vare = `Medlemskontingent ${typeLabel}`
  const notat = [
    `Medlemskontingent ${typeLabel} · ${formatKr(belop)} kr`,
    member.medlemsnummer != null ? `Medlemsnummer: ${member.medlemsnummer}` : null,
    String(member.navn ?? "").trim() ? `Navn: ${String(member.navn ?? "").trim()}` : null,
    String(member.epost ?? "").trim() ? `E-post: ${String(member.epost ?? "").trim()}` : null,
    `Betalt: ${dato}`,
  ]
    .filter(Boolean)
    .join("\n")
  return { dato, belop, motpart, vare, notat }
}

export async function ensureRegnskapForMembership(
  admin: SupabaseClient,
  member: MedlemskontingentRad
) {
  const kilde = kildeForMember(member)
  const payload = regnskapPayload(member)
  if (!kilde || !payload) return { ok: true as const }

  const { data: existing, error: existingError } = await admin
    .from("regnskap_poster")
    .select("id")
    .eq("kilde", kilde)
    .limit(1)
    .maybeSingle()

  if (existingError) {
    const msg = String((existingError as { message?: string } | null)?.message ?? "")
    if (isRegnskapSchemaError(msg)) {
      return { ok: false as const, status: 500 as const, feil: regnskapSchemaFeil }
    }
    return { ok: false as const, status: 400 as const, feil: "Kunne ikke sjekke regnskap." }
  }

  if (existing?.id) {
    const { error: updateError } = await admin
      .from("regnskap_poster")
      .update({
        dato: payload.dato,
        type: "inntekt",
        belop: payload.belop,
        motpart: payload.motpart,
        vare: payload.vare,
        notat: payload.notat,
        bilag_path: null,
      })
      .eq("id", existing.id)

    if (updateError) {
      const msg = String((updateError as { message?: string } | null)?.message ?? "")
      if (isRegnskapSchemaError(msg)) {
        return { ok: false as const, status: 500 as const, feil: regnskapSchemaFeil }
      }
      return { ok: false as const, status: 400 as const, feil: "Kunne ikke oppdatere regnskap." }
    }

    return { ok: true as const }
  }

  const { error: insertError } = await admin.from("regnskap_poster").insert({
    dato: payload.dato,
    type: "inntekt",
    belop: payload.belop,
    motpart: payload.motpart,
    vare: payload.vare,
    notat: payload.notat,
    bilag_path: null,
    kilde,
  })

  if (insertError) {
    const msg = String((insertError as { message?: string } | null)?.message ?? "")
    if (isRegnskapSchemaError(msg)) {
      return { ok: false as const, status: 500 as const, feil: regnskapSchemaFeil }
    }
    return { ok: false as const, status: 400 as const, feil: "Kunne ikke opprette regnskapspost." }
  }

  return { ok: true as const }
}

export async function removeRegnskapForMembership(
  admin: SupabaseClient,
  member: MedlemskontingentRad
) {
  const kilde = kildeForMember(member)
  if (!kilde) return { ok: true as const }

  const { error } = await admin.from("regnskap_poster").delete().eq("kilde", kilde)
  if (error) {
    const msg = String((error as { message?: string } | null)?.message ?? "")
    if (isRegnskapSchemaError(msg)) {
      return { ok: false as const, status: 500 as const, feil: regnskapSchemaFeil }
    }
    return { ok: false as const, status: 400 as const, feil: "Kunne ikke fjerne regnskapspost." }
  }

  return { ok: true as const }
}

export async function syncPaidMembersToRegnskap(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("medlemmer")
    .select("id, medlemsnummer, medlemskap_type, navn, epost, aktiv, kontingent_betalt_at, kontingent_gyldig_til")
    .or("aktiv.is.null,aktiv.eq.true")
    .not("kontingent_betalt_at", "is", null)
    .limit(5000)

  if (error) {
    return { ok: false as const, status: 400 as const, feil: "Kunne ikke hente medlemsbetalinger." }
  }

  for (const row of (data ?? []) as MedlemskontingentRad[]) {
    const ensured = await ensureRegnskapForMembership(admin, row)
    if (!ensured.ok) return ensured
  }

  return { ok: true as const }
}
