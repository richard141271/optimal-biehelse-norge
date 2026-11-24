import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ ok: false, feil: "Ikke konfigurert." }, { status: 500 })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  const { data: kalendere, error: kalErr } = await admin
    .from("julekalender")
    .select("id, aar, tittel, beskrivelse, pris, status, start_at, end_at")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)

  if (kalErr) {
    if (/julekalender/i.test(String(kalErr.message ?? ""))) {
      return NextResponse.json({ ok: true, kalender: null, luker: [] })
    }
    return NextResponse.json({ ok: false, feil: "Kunne ikke hente kalender." }, { status: 400 })
  }

  const kalender = (kalendere ?? [])[0] as
    | { id: string; aar: number; tittel: string; beskrivelse: string | null; pris: number; status: string; start_at: string | null; end_at: string | null }
    | undefined

  if (!kalender) {
    return NextResponse.json({ ok: true, kalender: null, luker: [] })
  }

  const { data: luker, error: lukErr } = await admin
    .from("julekalender_luker")
    .select("dag, premie_id, premie_tekst, apnet_at, vinner_loddnr, vinner_telefon")
    .eq("kalender_id", kalender.id)
    .order("dag", { ascending: true })

  if (lukErr) {
    return NextResponse.json({ ok: false, feil: "Kunne ikke hente luker." }, { status: 400 })
  }

  const lukerData = (luker ?? []) as {
    dag: number
    premie_id: string | null
    premie_tekst: string | null
    apnet_at: string | null
    vinner_loddnr: number | null
    vinner_telefon: string | null
  }[]

  const premieIds = lukerData.map((l) => l.premie_id).filter((id): id is string => Boolean(id))
  const premierMap: Record<string, { tittel: string; sponsor_navn: string | null; verdi: number | null }> = {}

  if (premieIds.length) {
    const { data: premier } = await admin
      .from("lodd_premier")
      .select("id, tittel, sponsor_navn, verdi")
      .in("id", premieIds)
    for (const p of (premier ?? []) as { id: string; tittel: string; sponsor_navn: string | null; verdi: number | null }[]) {
      premierMap[p.id] = { tittel: p.tittel, sponsor_navn: p.sponsor_navn, verdi: p.verdi }
    }
  }

  const lukerPublic = lukerData.map((l) => {
    const apnet = Boolean(l.apnet_at)
    const premie = l.premie_id ? premierMap[l.premie_id] : null
    return {
      dag: l.dag,
      apnet,
      premie_tittel: apnet ? (premie?.tittel ?? l.premie_tekst ?? null) : null,
      sponsor_navn: apnet ? (premie?.sponsor_navn ?? null) : null,
      verdi: apnet ? (premie?.verdi ?? null) : null,
      vinner_loddnr: apnet ? l.vinner_loddnr : null,
      vinner_telefon: apnet ? l.vinner_telefon : null,
    }
  })

  const { count: solgt } = await admin
    .from("julekalender_kjop")
    .select("*", { count: "exact", head: true })
    .eq("kalender_id", kalender.id)
    .eq("status", "paid")

  return NextResponse.json({
    ok: true,
    kalender: {
      id: kalender.id,
      aar: kalender.aar,
      tittel: kalender.tittel,
      beskrivelse: kalender.beskrivelse,
      pris: kalender.pris,
    },
    luker: lukerPublic,
    solgt: solgt ?? 0,
  })
}
