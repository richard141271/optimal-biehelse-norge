import { createServerClient } from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"
import { NextResponse, type NextRequest } from "next/server"

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
    url.pathname = "/admin/login"
    url.searchParams.set("next", request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  if (isAdminPath(request.nextUrl.pathname) && user) {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const email = (user.email ?? "").trim().toLowerCase()
    if (serviceRoleKey && email) {
      try {
        const admin = createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false },
        })
        const { data, error } = await admin
          .from("admin_roles")
          .select("role")
          .eq("email", email)
          .maybeSingle()
        const role = (data?.role ?? null) as string | null
        if (error || (role !== "admin" && role !== "superadmin")) {
          const url = request.nextUrl.clone()
          url.pathname = "/admin/login"
          url.searchParams.set("feil", "ingen-tilgang")
          url.searchParams.set("next", request.nextUrl.pathname)
          return NextResponse.redirect(url)
        }
      } catch {
        const url = request.nextUrl.clone()
        url.pathname = "/admin/login"
        url.searchParams.set("feil", "ingen-tilgang")
        url.searchParams.set("next", request.nextUrl.pathname)
        return NextResponse.redirect(url)
      }
    } else {
      const url = request.nextUrl.clone()
      url.pathname = "/admin/login"
      url.searchParams.set("feil", "ingen-tilgang")
      url.searchParams.set("next", request.nextUrl.pathname)
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
