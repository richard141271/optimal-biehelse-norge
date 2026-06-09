import type { SupabaseClient } from "@supabase/supabase-js"

const bucket = "media-bibliotek"

function toSafeStorageKey(v: string) {
  const s = String(v ?? "").trim()
  if (!s) return "x"
  const cleaned = s
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
  return cleaned || "x"
}

function extFromNameAndType(filename: string, type: string) {
  const name = String(filename ?? "").trim()
  const last = name.lastIndexOf(".")
  const ext = last > 0 ? name.slice(last + 1).trim().toLowerCase() : ""
  if (ext && ext.length <= 10) return ext
  const t = String(type ?? "").toLowerCase()
  if (t.includes("png")) return "png"
  if (t.includes("webp")) return "webp"
  if (t.includes("jpeg") || t.includes("jpg")) return "jpg"
  if (t.includes("heic")) return "heic"
  if (t.includes("heif")) return "heif"
  if (t.includes("gif")) return "gif"
  if (t.includes("mp4")) return "mp4"
  if (t.includes("quicktime") || t.includes("mov")) return "mov"
  if (t.includes("webm")) return "webm"
  return "bin"
}

async function ensureBucket(admin: SupabaseClient) {
  const { error } = await admin.storage.createBucket(bucket, { public: false })
  if (!error) return true
  const msg = String((error as { message?: string } | null)?.message ?? "")
  if (/(exists|already|duplicate|conflict|409)/i.test(msg)) return true
  return false
}

export type ArkiverFilInput = {
  name: string
  type?: string | null
  size?: number | null
  bytes: ArrayBuffer
}

export async function arkiverTilMediaBibliotek(admin: SupabaseClient, file: ArkiverFilInput) {
  const ok = await ensureBucket(admin)
  if (!ok) return { ok: false as const }

  const originalName = String(file.name ?? "fil").trim()
  const dot = originalName.lastIndexOf(".")
  const baseName = dot > 0 ? originalName.slice(0, dot) : originalName
  const base = toSafeStorageKey(baseName || "fil")
  const ext = extFromNameAndType(originalName, String(file.type ?? ""))
  const size = Number(file.size ?? file.bytes.byteLength ?? 0)
  const safeSize = Number.isFinite(size) ? Math.max(0, Math.trunc(size)) : 0
  const path = `${base}__${safeSize}.${ext}`

  const { error } = await admin.storage.from(bucket).upload(path, file.bytes, {
    upsert: false,
    contentType: String(file.type ?? "").trim() || undefined,
  })
  if (!error) return { ok: true as const, path }

  const msg = String((error as { message?: unknown } | null)?.message ?? "")
  if (/(exists|already|duplicate|conflict|409)/i.test(msg)) {
    return { ok: true as const, skipped: true as const }
  }

  return { ok: false as const }
}

export function isImageOrVideo(contentType: string, filename?: string | null) {
  const t = String(contentType ?? "").trim().toLowerCase()
  if (t.startsWith("image/") || t.startsWith("video/")) return true
  const name = String(filename ?? "").trim().toLowerCase()
  if (!name) return false
  return /\.(png|jpe?g|webp|gif|heic|heif|mp4|mov|webm)$/i.test(name)
}
