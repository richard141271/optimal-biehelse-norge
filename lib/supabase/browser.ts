import { createBrowserClient } from "@supabase/ssr"
import { parse, serialize } from "cookie"

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
        const all = parse(document.cookie ?? "")
        return Object.entries(all).map(([name, value]) => ({
          name,
          value: value ?? "",
        }))
      },
      setAll(cookiesToSet) {
        if (typeof document === "undefined") return
        for (const { name, value, options } of cookiesToSet) {
          document.cookie = serialize(name, value, {
            path: "/",
            sameSite: "lax",
            secure,
            httpOnly: false,
            ...options,
          })
        }
      },
    },
  })
}
