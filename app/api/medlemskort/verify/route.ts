import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import crypto from "crypto"

function isAktivKontingent(gyldigTil?: string | null) {
  if (!gyldigTil) return false
  const d = new Date(gyldigTil)
  if (Number.isNaN(d.getTime())) return false
  return d.getTime() > Date.now()
}

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

function verifyToken(secret: string, token: string) {
  const parts = token.split(".")
  if (parts.length !== 3) return { ok: false as const, feil: "Ugyldig token." }
  const [h, p, sig] = parts
  if (!h || !p || !sig) return { ok: false as const, feil: "Ugyldig token." }
  const data = `${h}.${p}`
  const expected = crypto.createHmac("sha256", secret).update(data).digest("base64url")
  if (!safeEqual(expected, sig)) return { ok: false as const, feil: "Ugyldig token." }
  let payload: unknown
  try {
    payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"))
  } catch {
    return { ok: false as const, feil: "Ugyldig token." }
  }
  const pl = payload as { sub?: unknown; exp?: unknown; mid?: unknown }
  const sub = typeof pl.sub === "string" ? pl.sub : null
  const exp = typeof pl.exp === "number" && Number.isFinite(pl.exp) ? pl.exp : null
  const mid = typeof pl.mid === "number" && Number.isFinite(pl.mid) ? pl.mid : null
  if (!sub || !exp) return { ok: false as const, feil: "Ugyldig token." }
  if (Math.floor(Date.now() / 1000) > exp) return { ok: false as const, feil: "Token er utløpt." }
  return { ok: true as const, sub, exp, mid }
}

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const token = String(url.searchParams.get("t") ?? "").trim()
  if (!token) return NextResponse.json({ ok: false, feil: "Mangler token." }, { status: 400 })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const signingSecret = process.env.MEDLEMSKORT_SIGNING_SECRET

  if (!signingSecret) {
    return NextResponse.json(
      { ok: false, feil: "Medlemskort er ikke konfigurert." },
      { status: 500 }
    )
  }

  const verified = verifyToken(signingSecret, token)
  if (!verified.ok) return NextResponse.json({ ok: false, feil: verified.feil }, { status: 400 })

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { ok: false, feil: "Verifisering er ikke konfigurert." },
      { status: 500 }
    )
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const byUser = await admin
    .from("medlemmer")
    .select("navn, medlemsnummer, medlemskap_type, aktiv, kontingent_gyldig_til")
    .eq("user_id", verified.sub)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (byUser.error) {
    return NextResponse.json({ ok: false, feil: "Kunne ikke verifisere medlemskap." }, { status: 400 })
  }

  let medlem = byUser.data

  if (!medlem && verified.mid != null) {
    const byNr = await admin
      .from("medlemmer")
      .select("navn, medlemsnummer, medlemskap_type, aktiv, kontingent_gyldig_til")
      .eq("medlemsnummer", verified.mid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (byNr.error) {
      return NextResponse.json({ ok: false, feil: "Kunne ikke verifisere medlemskap." }, { status: 400 })
    }
    medlem = byNr.data
  }

  const aktiv =
    !!medlem &&
    medlem.aktiv !== false &&
    isAktivKontingent((medlem as { kontingent_gyldig_til?: string | null } | null)?.kontingent_gyldig_til ?? null)

  return NextResponse.json({
    ok: true,
    aktiv,
    medlem: {
      navn: (medlem as { navn?: string | null } | null)?.navn ?? null,
      medlemsnummer: (medlem as { medlemsnummer?: number | null } | null)?.medlemsnummer ?? verified.mid ?? null,
      medlemskap_type: (medlem as { medlemskap_type?: string | null } | null)?.medlemskap_type ?? null,
      kontingent_gyldig_til: (medlem as { kontingent_gyldig_til?: string | null } | null)?.kontingent_gyldig_til ?? null,
    },
  })
}
