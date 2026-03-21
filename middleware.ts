import { createServerClient } from "@supabase/ssr"
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
    url.pathname = "/min-side/login"
    url.searchParams.set("next", request.nextUrl.pathname)
    return NextResponse.redirect(url)
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
