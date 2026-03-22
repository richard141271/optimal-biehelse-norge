import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function isAdminPath(pathname: string) {
  if (!pathname.startsWith("/admin")) return false
  if (pathname === "/admin/login") return false
  if (pathname.startsWith("/admin/login/")) return false
  return true
}

function isMemberPath(pathname: string) {
  if (!pathname.startsWith("/min-side")) return false
  if (pathname === "/min-side/login") return false
  if (pathname.startsWith("/min-side/login/")) return false
  return true
}

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next()
  }

  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (isAdminPath(request.nextUrl.pathname) && !user) {
    const url = request.nextUrl.clone()
    url.pathname = "/min-side/login"
    url.searchParams.set("next", request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  if (isAdminPath(request.nextUrl.pathname) && user) {
    const email = String(user.email ?? "").trim().toLowerCase()
    if (!serviceRoleKey || !email || !isValidEmail(email)) {
      const url = request.nextUrl.clone()
      url.pathname = "/min-side"
      return NextResponse.redirect(url)
    }

    const medlemUrl = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/medlemmer?select=role&epost=eq.${encodeURIComponent(email)}&limit=1`
    try {
      const medlemRes = await fetch(medlemUrl, {
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
          accept: "application/json",
        },
      })
      const medlemRows = (await medlemRes.json()) as Array<{ role?: string | null }>
      const role = String(medlemRows?.[0]?.role ?? "")
      if (role !== "admin" && role !== "superadmin") {
        const url = request.nextUrl.clone()
        url.pathname = "/min-side"
        return NextResponse.redirect(url)
      }
    } catch {
      const url = request.nextUrl.clone()
      url.pathname = "/min-side"
      return NextResponse.redirect(url)
    }
  }

  if (isMemberPath(request.nextUrl.pathname) && !user) {
    const url = request.nextUrl.clone()
    url.pathname = "/min-side/login"
    url.searchParams.set("next", request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: ["/admin/:path*", "/min-side/:path*"],
}
