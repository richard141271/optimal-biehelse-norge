import { createBrowserClient } from "@supabase/ssr"
import { parse, serialize } from "cookie"

export function createSupabaseBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return null
  }

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
            ...options,
          })
        }
      },
    },
  })
}
