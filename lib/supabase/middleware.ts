import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase session cookie on every request so Server
// Components never have to. This runs regardless of route — even fully
// public pages need it, because it's what keeps a signed-in user's session
// alive across page loads, not an access-control gate by itself.
//
// No route is redirected here today. Project Skin has no account-only route
// yet (public quiz/scan/Echo, `/account` shows either the sign-in form or
// the signed-in state) — inventing a protected path just to exercise this
// would be exactly the "don't invent a route to justify middleware" trap.
// When a real protected route exists, add its check where marked below.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Do not add code between createServerClient and getClaims() — a stray
  // await here can make the session look randomly logged out. getClaims()
  // (not getSession()) validates the JWT signature against the project's
  // published keys, which is why it's safe to trust for authorization.
  await supabase.auth.getClaims();

  // Future protected-route check goes here, e.g.:
  //   if (!user && request.nextUrl.pathname.startsWith("/account/orders")) {
  //     return NextResponse.redirect(new URL("/account", request.url));
  //   }

  return supabaseResponse;
}
