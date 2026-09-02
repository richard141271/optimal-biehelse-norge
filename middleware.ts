import { NextResponse, type NextRequest } from "next/server"

function redirectToLogin(request: NextRequest) {
  const url = request.nextUrl.clone()
  const isAdmin =
    request.nextUrl.pathname.startsWith("/admin") &&
    request.nextUrl.pathname !== "/admin/login"
  url.pathname = isAdmin ? "/admin/login" : "/min-side/login"
  url.search = ""
  const pathname = request.nextUrl.pathname
  if (
    pathname !== "/admin/login" &&
    pathname !== "/min-side/login" &&
    pathname !== "/admin/logout" &&
    pathname !== "/min-side/logout"
  ) {
    url.searchParams.set("next", pathname)
  }
  return NextResponse.redirect(url)
}

function hasAnySupabaseAuthCookie(request: NextRequest) {
  for (const c of request.cookies.getAll()) {
    const name = c.name.toLowerCase()
    if (
      name.includes("sb-access-token") ||
      name.includes("sb-refresh-token") ||
      name.includes("supabase-auth-token")
    ) {
      if ((c.value || "").trim()) return true
    }
  }
  return false
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  if (
    pathname === "/min-side/login" ||
    pathname === "/admin/login" ||
    pathname.startsWith("/min-side/logout") ||
    pathname.startsWith("/admin/logout")
  ) {
    return NextResponse.next()
  }

  const needsLogin = pathname.startsWith("/min-side") || pathname.startsWith("/admin")
  if (!needsLogin) return NextResponse.next()

  if (!hasAnySupabaseAuthCookie(request)) {
    return redirectToLogin(request)
  }

  const response = NextResponse.next()
  response.headers.set("x-obno-auth-gate", "cookie")
  return response
}

export const config = {
  matcher: ["/admin/:path*", "/min-side/:path*"],
}
