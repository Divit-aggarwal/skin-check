"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { LoadingState } from "@/components/ui/page";

// "/" (TD-24 (3)): Home after sign-in, the start of a check otherwise. Anyone
// arriving from the Shopify storefront lands somewhere useful either way.
export default function Root() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading) router.replace(user ? "/dashboard" : "/skin-check");
  }, [user, loading, router]);
  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 pt-12 sm:px-6 lg:px-8">
      <LoadingState label="Loading…" blocks={["h-24"]} />
    </main>
  );
}
