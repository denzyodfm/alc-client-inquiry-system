import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const session = request.cookies.get("alc_session")?.value;
  const isLogin = request.nextUrl.pathname === "/login";

  if (!session && !isLogin && !request.nextUrl.pathname.startsWith("/api/auth")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|branding/|favicon.ico).*)"]
};
