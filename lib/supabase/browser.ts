import { createBrowserClient } from "@supabase/ssr"

function parseCookieHeader(header: string): Array<{ name: string; value: string }> {
  if (!header) return []
  const pairs = header.split(";")
  const out: Array<{ name: string; value: string }> = []
  for (const p of pairs) {
    const idx = p.indexOf("=")
    if (idx === -1) continue
    try {
      const name = decodeURIComponent(p.slice(0, idx).trim())
      const value = decodeURIComponent(p.slice(idx + 1).trim())
      if (name) out.push({ name, value })
    } catch {}
  }
  return out
}

function serializeCookie(
  name: string,
  value: string,
  options: {
    path?: string
    domain?: string
    expires?: Date
    maxAge?: number
    httpOnly?: boolean
    secure?: boolean
    sameSite?: true | false | "lax" | "strict" | "none"
  } = {}
): string {
  const parts: string[] = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`]
  const p = options.path ?? "/"
  if (p) parts.push(`Path=${p}`)
  if (options.domain) parts.push(`Domain=${options.domain}`)
  if (options.maxAge && Number.isFinite(options.maxAge)) {
    parts.push(`Max-Age=${Math.floor(options.maxAge)}`)
  }
  if (options.expires && options.expires instanceof Date) {
    parts.push(`Expires=${options.expires.toUTCString()}`)
  }
  const isSecure = options.secure ?? (typeof window !== "undefined" && window.location.protocol === "https:")
  if (isSecure) parts.push("Secure")
  if (options.httpOnly) parts.push("HttpOnly")
  const ss = options.sameSite
  if (ss === "strict") parts.push("SameSite=Strict")
  else if (ss === "none") parts.push("SameSite=None")
  else parts.push("SameSite=Lax")
  return parts.join("; ")
}

function isSecureContext() {
  if (typeof window === "undefined") return false
  try {
    if (window.location.protocol === "https:") return true
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") return false
    return false
  } catch {
    return false
  }
}

export function createSupabaseBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return null
  }

  const secure = isSecureContext()

  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        if (typeof document === "undefined") return []
        try {
          return parseCookieHeader(document.cookie ?? "")
        } catch {
          return []
        }
      },
      setAll(cookiesToSet) {
        if (typeof document === "undefined") return
        for (const { name, value, options } of cookiesToSet) {
          try {
            document.cookie = serializeCookie(name, value, {
              path: "/",
              sameSite: "lax",
              secure,
              httpOnly: false,
              ...options,
            })
          } catch {}
        }
      },
    },
  })
}

