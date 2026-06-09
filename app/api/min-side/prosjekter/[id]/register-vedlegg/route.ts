import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { arkiverTilMediaBibliotek, isImageOrVideo } from "@/lib/media-bibliotek-arkiv"

export const dynamic = "force-dynamic"

const bucket = "prosjekt-vedlegg"
const MAX_TOTAL_VEDLEGG = 30

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
}

function isAktivKontingent(gyldigTil?: string | null) {
  if (!gyldigTil) return false
  const d = new Date(gyldigTil)
  if (Number.isNaN(d.getTime())) return false
  return d.getTime() > Date.now()
}

async function getAuth() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) return null

  const cookieStore = await cookies()
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options)
        }
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const userId = user?.id ?? null
  const email = String(user?.email ?? "").trim().toLowerCase()
  if (!userId || !email || !isValidEmail(email)) return null
  return { userId, email }
}

async function verifyActiveMember(admin: unknown, userId: string) {
  const client = admin as ReturnType<typeof createClient>
  const { data: medlem, error: medlemError } = await client
    .from("medlemmer")
    .select("aktiv, kontingent_gyldig_til")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (medlemError) {
    return { ok: false as const, status: 400 as const, feil: "Kunne ikke verifisere medlemskap." }
  }

  const medlemRow = (medlem as { aktiv?: boolean | null; kontingent_gyldig_til?: string | null } | null) ?? null
  if (!medlemRow || medlemRow.aktiv === false || !isAktivKontingent(medlemRow.kontingent_gyldig_til ?? null)) {
    return {
      ok: false as const,
      status: 403 as const,
      feil: "Prosjekter er kun tilgjengelig for aktive medlemmer.",
    }
  }

  return { ok: true as const }
}

type Item = {
  path?: string
  name?: string
  type?: string
  size?: number
}

type Payload = {
  items?: Item[]
  kommentar?: string
  skipLog?: boolean
  totalCount?: number
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ ok: false, feil: "Supabase er ikke konfigurert." }, { status: 500 })
  }

  const auth = await getAuth()
  if (!auth) {
    return NextResponse.json({ ok: false, feil: "Ikke innlogget." }, { status: 401 })
  }

  if (!serviceRoleKey) {
    return NextResponse.json(
      { ok: false, feil: "Mine prosjekter krever SUPABASE_SERVICE_ROLE_KEY i miljøvariabler." },
      { status: 500 }
    )
  }

  const { id } = await context.params
  const prosjektId = String(id ?? "").trim()
  if (!isUuid(prosjektId)) {
    return NextResponse.json({ ok: false, feil: "Ugyldig id." }, { status: 400 })
  }

  let payload: Payload
  try {
    payload = (await request.json()) as Payload
  } catch {
    return NextResponse.json({ ok: false, feil: "Ugyldig forespørsel." }, { status: 400 })
  }

  const items = Array.isArray(payload.items) ? payload.items : []
  const normalized = items
    .map((i) => ({
      path: String(i.path ?? "").trim(),
      name: String(i.name ?? "vedlegg").trim() || "vedlegg",
      type: String(i.type ?? "").trim(),
      size: Number(i.size ?? 0),
    }))
    .filter((i) => i.path && !i.path.includes(".."))

  if (!normalized.length) {
    return NextResponse.json({ ok: false, feil: "Mangler vedlegg." }, { status: 400 })
  }

  const kommentar = String(payload.kommentar ?? "").trim()
  const skipLog = Boolean(payload.skipLog)
  const totalCount = Number.isFinite(payload.totalCount)
    ? Math.max(1, Math.min(50, Number(payload.totalCount)))
    : null

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const verified = await verifyActiveMember(admin, auth.userId)
  if (!verified.ok) {
    return NextResponse.json({ ok: false, feil: verified.feil }, { status: verified.status })
  }

  const { data: row, error } = await admin
    .from("prosjekt_soknader")
    .select("id, epost, vedlegg_paths")
    .eq("id", prosjektId)
    .eq("epost", auth.email)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ ok: false, feil: "Kunne ikke hente prosjekt." }, { status: 400 })
  }
  if (!row?.id) {
    return NextResponse.json({ ok: false, feil: "Fant ikke prosjekt." }, { status: 404 })
  }

  const existingPaths = Array.isArray(row.vedlegg_paths) ? (row.vedlegg_paths as string[]) : []
  const newPaths = normalized.map((i) => i.path)
  if (existingPaths.length + newPaths.length > MAX_TOTAL_VEDLEGG) {
    return NextResponse.json(
      { ok: false, feil: `Prosjektet kan maks ha ${MAX_TOTAL_VEDLEGG} vedlegg totalt.` },
      { status: 400 }
    )
  }

  const nextPaths = [...existingPaths, ...newPaths]
  const { error: updateError } = await admin
    .from("prosjekt_soknader")
    .update({ vedlegg_paths: nextPaths })
    .eq("id", prosjektId)
    .eq("epost", auth.email)

  if (updateError) {
    try {
      await admin.storage.from(bucket).remove(newPaths)
    } catch {}
    return NextResponse.json({ ok: false, feil: "Kunne ikke lagre vedlegg på prosjektet." }, { status: 400 })
  }

  if (!skipLog) {
    const antall = totalCount ?? newPaths.length
    const logMessage = kommentar
      ? `${antall} vedlegg lastet opp av søker. Kommentar: ${kommentar}`
      : `${antall} vedlegg lastet opp av søker.`
    try {
      await admin.from("prosjekt_hendelser").insert({
        prosjekt_id: prosjektId,
        actor_email: auth.email,
        type: "vedlegg_lastet_opp",
        message: logMessage,
      })
    } catch {}
  }

  void (async () => {
    for (const item of normalized) {
      if (!isImageOrVideo(item.type, item.name)) continue
      try {
        const { data, error: downloadError } = await admin.storage.from(bucket).download(item.path)
        if (downloadError || !data) continue
        const arrayBuffer = await data.arrayBuffer()
        await arkiverTilMediaBibliotek(admin, {
          name: item.name,
          type: item.type,
          size: item.size,
          bytes: arrayBuffer,
        })
      } catch {}
    }
  })()

  return NextResponse.json({ ok: true })
}

