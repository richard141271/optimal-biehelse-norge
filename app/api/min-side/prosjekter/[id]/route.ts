import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { arkiverTilMediaBibliotek, isImageOrVideo } from "@/lib/media-bibliotek-arkiv"

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

function describeError(error: unknown) {
  const msg = String((error as { message?: unknown } | null)?.message ?? "").trim()
  return msg || null
}

export const dynamic = "force-dynamic"

const MAX_VEDLEGG_PER_UPLOAD = 10
const MAX_TOTAL_VEDLEGG = 30
const MAX_VEDLEGG_BYTES = 15 * 1024 * 1024
const DEBUG_UPLOAD_URL = "http://192.168.0.196:7777/event"
const DEBUG_UPLOAD_SESSION = "project-upload-images"

function reportProjectUploadApiDebug(
  hypothesisId: "B" | "C" | "D",
  msg: string,
  data: Record<string, unknown>,
  traceId?: string | null
) {
  // #region debug-point B:api-report
  fetch(DEBUG_UPLOAD_URL, {
    method: "POST",
    body: JSON.stringify({
      sessionId: DEBUG_UPLOAD_SESSION,
      runId: "pre-fix",
      hypothesisId,
      location: "app/api/min-side/prosjekter/[id]/route.ts",
      msg: `[DEBUG] ${msg}`,
      data,
      traceId,
      ts: Date.now(),
    }),
  }).catch(() => {})
  // #endregion
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

const bucket = "prosjekt-vedlegg"

function schemaFeil() {
  return (
    "Prosjekt-tabellen i Supabase mangler felter. Kjør denne SQL-en i Supabase (SQL Editor), og prøv igjen:\n\n" +
    "alter table public.prosjekt_soknader add column if not exists status text;\n" +
    "alter table public.prosjekt_soknader add column if not exists admin_svar text;\n" +
    "alter table public.prosjekt_soknader add column if not exists admin_svar_at timestamptz;\n" +
    "alter table public.prosjekt_soknader add column if not exists admin_svar_sent_at timestamptz;\n" +
    "\n" +
    "create table if not exists public.prosjekt_hendelser (\n" +
    "  id uuid primary key default gen_random_uuid(),\n" +
    "  created_at timestamptz not null default now(),\n" +
    "  prosjekt_id uuid not null references public.prosjekt_soknader(id) on delete cascade,\n" +
    "  actor_email text,\n" +
    "  type text not null,\n" +
    "  message text\n" +
    ");\n" +
    "create index if not exists prosjekt_hendelser_prosjekt_id_idx on public.prosjekt_hendelser(prosjekt_id);\n"
  )
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
    const msg = String((medlemError as { message?: string } | null)?.message ?? "")
    if (/column/i.test(msg) && /user_id/i.test(msg)) {
      return {
        ok: false as const,
        response: NextResponse.json(
          {
            ok: false,
            feil:
              "Medlemsregister-tabellen mangler feltet user_id. Kjør dette i Supabase (SQL Editor):\n\n" +
              "alter table public.medlemmer add column if not exists user_id uuid;",
          },
          { status: 500 }
        ),
      }
    }
    if (/column/i.test(msg) && /(kontingent_gyldig_til|aktiv)/i.test(msg)) {
      return {
        ok: false as const,
        response: NextResponse.json(
          {
            ok: false,
            feil:
              "Medlemsregister-tabellen mangler feltet aktiv/kontingent_gyldig_til. Kjør dette i Supabase (SQL Editor):\n\n" +
              "alter table public.medlemmer add column if not exists aktiv boolean not null default true;\n" +
              "alter table public.medlemmer add column if not exists kontingent_gyldig_til date;",
          },
          { status: 500 }
        ),
      }
    }
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, feil: "Kunne ikke verifisere medlemskap." }, { status: 400 }),
    }
  }

  const medlemRow = (medlem as { aktiv?: boolean | null; kontingent_gyldig_til?: string | null } | null) ?? null
  if (!medlemRow || medlemRow.aktiv === false || !isAktivKontingent(medlemRow.kontingent_gyldig_til ?? null)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, feil: "Prosjekter er kun tilgjengelig for aktive medlemmer." },
        { status: 403 }
      ),
    }
  }

  return { ok: true as const }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { ok: false, feil: "Supabase er ikke konfigurert." },
      { status: 500 }
    )
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

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const verified = await verifyActiveMember(admin, auth.userId)
  if (!verified.ok) return verified.response

  const baseSelect =
    "id, created_at, medlemsnummer, navn, epost, telefon, tittel, sted, budsjett, beskrivelse, status"
  const fullSelect = `${baseSelect}, vedlegg_paths, admin_svar, admin_svar_at, admin_svar_sent_at`

  let schemaWarning: string | null = null
  let row: Record<string, unknown> | null = null

  const full = await admin
    .from("prosjekt_soknader")
    .select(fullSelect)
    .eq("id", prosjektId)
    .eq("epost", auth.email)
    .maybeSingle()

  if (full.error) {
    const msg = String((full.error as { message?: string } | null)?.message ?? "")
    if (/column/i.test(msg) && /admin_svar/i.test(msg)) {
      schemaWarning = schemaFeil()
    }
    let fallbackSelect = `${baseSelect}, vedlegg_paths`
    if (/admin_svar_sent_at/i.test(msg)) {
      fallbackSelect = `${baseSelect}, vedlegg_paths, admin_svar, admin_svar_at`
    } else if (/admin_svar_at/i.test(msg)) {
      fallbackSelect = `${baseSelect}, vedlegg_paths, admin_svar`
    }

    const fallback = await admin
      .from("prosjekt_soknader")
      .select(fallbackSelect)
      .eq("id", prosjektId)
      .eq("epost", auth.email)
      .maybeSingle()

    if (fallback.error) {
      const msg2 = String((fallback.error as { message?: string } | null)?.message ?? "")
      if ((/relation/i.test(msg2) && /prosjekt_soknader/i.test(msg2)) || /42p01/i.test(msg2)) {
        return NextResponse.json({ ok: false, feil: schemaFeil() }, { status: 500 })
      }
      return NextResponse.json({ ok: false, feil: "Kunne ikke hente prosjekt." }, { status: 400 })
    }
    row = (fallback.data as unknown as Record<string, unknown> | null) ?? null
  } else {
    row = (full.data as unknown as Record<string, unknown> | null) ?? null
  }

  if (!row) {
    return NextResponse.json({ ok: false, feil: "Fant ikke prosjekt." }, { status: 404 })
  }

  const paths = Array.isArray(row.vedlegg_paths) ? (row.vedlegg_paths as string[]) : []
  const signed = await Promise.all(
    paths.slice(0, MAX_TOTAL_VEDLEGG).map(async (p) => {
      const { data } = await admin.storage.from(bucket).createSignedUrl(p, 60)
      return data?.signedUrl ? { path: p, url: data.signedUrl } : null
    })
  )

  let hendelser: Record<string, unknown>[] | null = null
  const logRes = await admin
    .from("prosjekt_hendelser")
    .select("id, created_at, type, message")
    .eq("prosjekt_id", prosjektId)
    .order("created_at", { ascending: false })
    .limit(50)

  if (logRes.error) {
    const msg = String((logRes.error as { message?: string } | null)?.message ?? "")
    if ((/relation/i.test(msg) && /prosjekt_hendelser/i.test(msg)) || /42p01/i.test(msg)) {
      schemaWarning = schemaFeil()
    }
  } else {
    hendelser = (logRes.data as unknown as Record<string, unknown>[] | null) ?? null
  }

  return NextResponse.json({
    ok: true,
    prosjekt: {
      ...row,
      vedlegg: signed.filter(Boolean),
      hendelser: hendelser ?? [],
    },
    schemaWarning,
  })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
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
  const traceId = String(request.headers.get("x-debug-trace-id") ?? "").trim() || null
  const batchNumber = String(request.headers.get("x-debug-batch-number") ?? "").trim() || null
  const batchBytesHeader = String(request.headers.get("x-debug-batch-bytes") ?? "").trim() || null
  if (!isUuid(prosjektId)) {
    return NextResponse.json({ ok: false, feil: "Ugyldig id." }, { status: 400 })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const verified = await verifyActiveMember(admin, auth.userId)
  if (!verified.ok) return verified.response

  let form: FormData
  try {
    // #region debug-point B:before-formdata
    reportProjectUploadApiDebug(
      "B",
      "API mottok opplastingsrequest",
      {
        prosjektId,
        batchNumber,
        contentLength: request.headers.get("content-length"),
        contentType: request.headers.get("content-type"),
        batchBytesHeader,
      },
      traceId
    )
    // #endregion
    form = await request.formData()
  } catch (error) {
    // #region debug-point B:formdata-error
    reportProjectUploadApiDebug(
      "B",
      "API feilet i request.formData()",
      {
        prosjektId,
        batchNumber,
        error: error instanceof Error ? error.message : String(error),
      },
      traceId
    )
    // #endregion
    return NextResponse.json(
      {
        ok: false,
        feil: "Kunne ikke lese filene. Prøv færre bilder om gangen (eller mindre filer).",
      },
      { status: 400 }
    )
  }

  const kommentar = String(form.get("kommentar") ?? "").trim()
  const skipLog = String(form.get("skipLog") ?? "").trim() === "1"
  const totalCountRaw = String(form.get("totalCount") ?? "").trim()
  const totalCount = /^\d+$/.test(totalCountRaw) ? Math.max(1, Math.min(50, Number(totalCountRaw))) : null
  const files = form.getAll("vedlegg").filter((v): v is File => v instanceof File && v.size > 0)
  // #region debug-point B:after-formdata
  reportProjectUploadApiDebug(
    "B",
    "API leste multipart-data",
    {
      prosjektId,
      batchNumber,
      fileCount: files.length,
      files: files.map((file) => ({
        name: file.name,
        size: file.size,
        type: file.type,
      })),
      skipLog,
      totalCount,
      kommentarLength: kommentar.length,
    },
    traceId
  )
  // #endregion
  if (!files.length) {
    return NextResponse.json({ ok: false, feil: "Velg minst én fil." }, { status: 400 })
  }
  if (files.length > MAX_VEDLEGG_PER_UPLOAD) {
    return NextResponse.json(
      { ok: false, feil: `Maks ${MAX_VEDLEGG_PER_UPLOAD} filer per opplasting.` },
      { status: 400 }
    )
  }

  const { data: row, error } = await admin
    .from("prosjekt_soknader")
    .select("id, epost, vedlegg_paths")
    .eq("id", prosjektId)
    .eq("epost", auth.email)
    .maybeSingle()

  if (error) {
    const msg = String((error as { message?: string } | null)?.message ?? "")
    if ((/relation/i.test(msg) && /prosjekt_soknader/i.test(msg)) || /42p01/i.test(msg) || /vedlegg_paths/i.test(msg)) {
      return NextResponse.json({ ok: false, feil: schemaFeil() }, { status: 500 })
    }
    return NextResponse.json({ ok: false, feil: "Kunne ikke hente prosjekt." }, { status: 400 })
  }
  if (!row) {
    return NextResponse.json({ ok: false, feil: "Fant ikke prosjekt." }, { status: 404 })
  }

  const existingPaths = Array.isArray(row.vedlegg_paths) ? (row.vedlegg_paths as string[]) : []
  if (existingPaths.length + files.length > MAX_TOTAL_VEDLEGG) {
    return NextResponse.json(
      { ok: false, feil: `Prosjektet kan maks ha ${MAX_TOTAL_VEDLEGG} vedlegg totalt.` },
      { status: 400 }
    )
  }

  const { error: createBucketError } = await admin.storage.createBucket(bucket, { public: false })
  if (createBucketError) {
    const msg = String((createBucketError as { message?: string } | null)?.message ?? "")
    if (!/exists/i.test(msg) && !/already/i.test(msg)) {
      return NextResponse.json(
        { ok: false, feil: "Lagring av vedlegg er ikke satt opp i Supabase Storage." },
        { status: 500 }
      )
    }
  }

  const uploadedPaths: string[] = []
  try {
    for (const f of files) {
      if (f.size > MAX_VEDLEGG_BYTES) {
        return NextResponse.json(
          { ok: false, feil: `${f.name || "Filen"} er for stor. Hver fil kan maks være 15 MB.` },
          { status: 400 }
        )
      }
      const safeName = (f.name || "vedlegg")
        .replace(/[^\p{L}\p{N}._-]+/gu, "-")
        .replace(/-+/g, "-")
        .slice(0, 100)
      const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName}`
      const body = await f.arrayBuffer()
      // #region debug-point C:before-storage-upload
      reportProjectUploadApiDebug(
        "C",
        "API starter storage-upload",
        {
          prosjektId,
          batchNumber,
          fileName: f.name,
          fileSize: f.size,
          fileType: f.type,
          path,
        },
        traceId
      )
      // #endregion
      const { error: uploadError } = await admin.storage
        .from(bucket)
        .upload(path, body, { upsert: false, contentType: f.type || undefined })
      if (uploadError) {
        // #region debug-point C:storage-upload-error
        reportProjectUploadApiDebug(
          "C",
          "API fikk storage-feil",
          {
            prosjektId,
            batchNumber,
            fileName: f.name,
            fileSize: f.size,
            path,
            error: describeError(uploadError),
          },
          traceId
        )
        // #endregion
        if (uploadedPaths.length) await admin.storage.from(bucket).remove(uploadedPaths)
        const msg = describeError(uploadError)
        return NextResponse.json(
          {
            ok: false,
            feil: msg ? `Kunne ikke laste opp vedlegg: ${msg}` : "Kunne ikke laste opp vedlegg.",
          },
          { status: 400 }
        )
      }
      // #region debug-point C:storage-upload-ok
      reportProjectUploadApiDebug(
        "C",
        "API fullforte storage-upload",
        {
          prosjektId,
          batchNumber,
          fileName: f.name,
          path,
        },
        traceId
      )
      // #endregion
      if (isImageOrVideo(String(f.type || ""), f.name)) {
        try {
          // #region debug-point D:archive-start
          reportProjectUploadApiDebug(
            "D",
            "API starter arkivering til media-bibliotek",
            {
              prosjektId,
              batchNumber,
              fileName: f.name,
              fileSize: f.size,
              path,
            },
            traceId
          )
          // #endregion
          await arkiverTilMediaBibliotek(admin, { name: f.name, type: f.type, size: f.size, bytes: body })
          // #region debug-point D:archive-ok
          reportProjectUploadApiDebug(
            "D",
            "API fullforte arkivering til media-bibliotek",
            {
              prosjektId,
              batchNumber,
              fileName: f.name,
              path,
            },
            traceId
          )
          // #endregion
        } catch (error) {
          // #region debug-point D:archive-error
          reportProjectUploadApiDebug(
            "D",
            "API fikk arkiveringsfeil",
            {
              prosjektId,
              batchNumber,
              fileName: f.name,
              path,
              error: error instanceof Error ? error.message : String(error),
            },
            traceId
          )
          // #endregion
        }
      }
      uploadedPaths.push(path)
    }

    const nextPaths = [...existingPaths, ...uploadedPaths]
    const { error: updateError } = await admin
      .from("prosjekt_soknader")
      .update({ vedlegg_paths: nextPaths })
      .eq("id", prosjektId)
      .eq("epost", auth.email)

    if (updateError) {
      const msg = String((updateError as { message?: string } | null)?.message ?? "")
      if ((/relation|column/i.test(msg) && /prosjekt_soknader/i.test(msg)) || /42p01/i.test(msg) || /vedlegg_paths/i.test(msg)) {
        if (uploadedPaths.length) await admin.storage.from(bucket).remove(uploadedPaths)
        return NextResponse.json({ ok: false, feil: schemaFeil() }, { status: 500 })
      }
      if (uploadedPaths.length) await admin.storage.from(bucket).remove(uploadedPaths)
      return NextResponse.json({ ok: false, feil: "Kunne ikke lagre vedlegg på prosjektet." }, { status: 400 })
    }

    if (!skipLog) {
      const antall = totalCount ?? files.length
      const logMessage = kommentar
        ? `${antall} vedlegg lastet opp av søker. Kommentar: ${kommentar}`
        : `${antall} vedlegg lastet opp av søker.`
      await admin.from("prosjekt_hendelser").insert({
        prosjekt_id: prosjektId,
        actor_email: auth.email,
        type: "vedlegg_lastet_opp",
        message: logMessage,
      })
    }

    // #region debug-point C:request-success
    reportProjectUploadApiDebug(
      "C",
      "API fullforte hele opplastingen",
      {
        prosjektId,
        batchNumber,
        uploadedCount: uploadedPaths.length,
      },
      traceId
    )
    // #endregion
    return NextResponse.json({ ok: true })
  } catch (error) {
    // #region debug-point C:request-error
    reportProjectUploadApiDebug(
      "C",
      "API fikk uventet opplastingsfeil",
      {
        prosjektId,
        batchNumber,
        uploadedCount: uploadedPaths.length,
        error: error instanceof Error ? error.message : String(error),
      },
      traceId
    )
    // #endregion
    if (uploadedPaths.length) await admin.storage.from(bucket).remove(uploadedPaths)
    return NextResponse.json({ ok: false, feil: "Kunne ikke laste opp vedlegg akkurat nå." }, { status: 400 })
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
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

  const url = new URL(request.url)
  const path = String(url.searchParams.get("path") ?? "").trim()
  if (!path || path.includes("..")) {
    return NextResponse.json({ ok: false, feil: "Ugyldig vedlegg." }, { status: 400 })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const verified = await verifyActiveMember(admin, auth.userId)
  if (!verified.ok) return verified.response

  const { data: row, error } = await admin
    .from("prosjekt_soknader")
    .select("id, epost, vedlegg_paths")
    .eq("id", prosjektId)
    .eq("epost", auth.email)
    .maybeSingle()

  if (error) {
    const msg = String((error as { message?: string } | null)?.message ?? "")
    if ((/relation/i.test(msg) && /prosjekt_soknader/i.test(msg)) || /42p01/i.test(msg) || /vedlegg_paths/i.test(msg)) {
      return NextResponse.json({ ok: false, feil: schemaFeil() }, { status: 500 })
    }
    return NextResponse.json({ ok: false, feil: "Kunne ikke hente prosjekt." }, { status: 400 })
  }

  if (!row) {
    return NextResponse.json({ ok: false, feil: "Fant ikke prosjekt." }, { status: 404 })
  }

  const existingPaths = Array.isArray(row.vedlegg_paths) ? (row.vedlegg_paths as string[]) : []
  if (!existingPaths.includes(path)) {
    return NextResponse.json({ ok: false, feil: "Fant ikke vedlegget." }, { status: 404 })
  }

  const nextPaths = existingPaths.filter((item) => item !== path)
  const { error: updateError } = await admin
    .from("prosjekt_soknader")
    .update({ vedlegg_paths: nextPaths })
    .eq("id", prosjektId)
    .eq("epost", auth.email)

  if (updateError) {
    return NextResponse.json({ ok: false, feil: "Kunne ikke oppdatere vedlegg." }, { status: 400 })
  }

  try {
    await admin.storage.from(bucket).remove([path])
  } catch {}

  try {
    await admin.from("prosjekt_hendelser").insert({
      prosjekt_id: prosjektId,
      actor_email: auth.email,
      type: "vedlegg_slettet",
      message: "Søker slettet et vedlegg.",
    })
  } catch {}

  return NextResponse.json({ ok: true })
}
