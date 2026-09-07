import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// A new client per request, not a module-level singleton — required because
// each request carries its own cookies. Server Components can't write
// cookies (setAll's try/catch below silently no-ops there); middleware is
// what actually persists a refreshed session.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — safe to ignore since
            // middleware.ts refreshes the session on every request.
          }
        },
      },
    }
  );
}
