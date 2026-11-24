import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

function normalizePhone(v: unknown) {
  const digits = String(v ?? "").replace(/\D+/g, "")
  if (!digits) return null
  if (digits.length < 8 || digits.length > 15) return "__invalid__"
  return digits
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ ok: false, feil: "Ikke konfigurert." }, { status: 500 })
  }

  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, feil: "Ugyldig forespørsel." }, { status: 400 })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  const telefon = normalizePhone(body.telefon)
  if (telefon === "__invalid__") {
    return NextResponse.json({ ok: false, feil: "Ugyldig telefonnummer." }, { status: 400 })
  }
  if (!telefon) {
    return NextResponse.json({ ok: false, feil: "Mangler telefonnummer." }, { status: 400 })
  }

  const antall = Math.floor(Number(body.antall ?? 1))
  if (!Number.isFinite(antall) || antall < 1 || antall > 50) {
    return NextResponse.json({ ok: false, feil: "Antall må være mellom 1 og 50." }, { status: 400 })
  }

  const { data: kalender, error: kalErr } = await admin
    .from("julekalender")
    .select("id, pris, status")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (kalErr) {
    if (/julekalender/i.test(String(kalErr.message ?? ""))) {
      return NextResponse.json({ ok: false, feil: "Ingen aktiv julekalender." }, { status: 400 })
    }
    return NextResponse.json({ ok: false, feil: "Kunne ikke hente kalender." }, { status: 400 })
  }

  if (!kalender) {
    return NextResponse.json({ ok: false, feil: "Ingen aktiv julekalender akkurat nå." }, { status: 400 })
  }

  const kalenderId = String((kalender as { id: string }).id)
  const pris = Number((kalender as { pris: number }).pris)
  const belop = antall * (Number.isFinite(pris) && pris > 0 ? pris : 50)

  const { data: maxRows } = await admin
    .from("julekalender_kjop")
    .select("lodd_til")
    .eq("kalender_id", kalenderId)
    .order("lodd_til", { ascending: false })
    .limit(1)

  const currentMax =
    Array.isArray(maxRows) && maxRows.length
      ? Number((maxRows[0] as { lodd_til: number }).lodd_til ?? 0)
      : 0
  const loddFra = (Number.isFinite(currentMax) ? currentMax : 0) + 1
  const loddTil = loddFra + antall - 1

  const vippsRef = `jul-${loddFra}-${loddTil}-${crypto.randomUUID().slice(0, 8)}`

  const { data: inserted, error: insErr } = await admin
    .from("julekalender_kjop")
    .insert({
      kalender_id: kalenderId,
      telefon,
      antall,
      belop,
      status: "pending",
      vipps_ref: vippsRef,
      lodd_fra: loddFra,
      lodd_til: loddTil,
    } as unknown as never)
    .select("id, lodd_fra, lodd_til, vipps_ref, belop")
    .maybeSingle()

  if (insErr) {
    return NextResponse.json({ ok: false, feil: "Kunne ikke opprette kjøp." }, { status: 400 })
  }

  const row = inserted as { id: string; lodd_fra: number; lodd_til: number; vipps_ref: string; belop: number } | null
  return NextResponse.json({
    ok: true,
    orderId: row?.id ?? "",
    belop: row?.belop ?? belop,
    vippsRef: row?.vipps_ref ?? vippsRef,
    loddFra: row?.lodd_fra ?? loddFra,
    loddTil: row?.lodd_til ?? loddTil,
  })
}
