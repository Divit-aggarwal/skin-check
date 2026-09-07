import { createBrowserClient } from "@supabase/ssr";

// Lightweight per Supabase's own docs — createBrowserClient already
// singletons internally, so calling this more than once is safe and cheap.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
