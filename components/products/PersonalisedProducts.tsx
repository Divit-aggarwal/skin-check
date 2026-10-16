"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { EchoPage } from "@/components/skin-check/EchoPage";
import { DashboardPage } from "@/components/dashboard/DashboardPage";

// H36: with the personalisation consent withdrawn, Echo's product opening and
// every product entry point are hidden (the server already refuses them:
// ECHO_PRODUCTS_OFF, products: []). Read from GET /api/account/consents. Until
// it answers, and on any failure or when signed out, products are off; Echo
// itself is not affected. Cached per user for the page's life.

const cache = new Map<string, Promise<boolean>>();
export function personalisationOn(uid: string, token: () => Promise<string>): Promise<boolean> {
  let p = cache.get(uid);
  if (!p) {
    p = token()
      .then((t) => fetch("/api/account/consents", { headers: { authorization: `Bearer ${t}` }, cache: "no-store" }))
      .then((r) => (r.ok ? (r.json() as Promise<{ consents?: { purpose: string; granted: boolean }[] }>) : null))
      .then((b) => b?.consents?.find((c) => c.purpose === "personalisation")?.granted === true)
      .catch(() => false);
    p.then((on) => !on && cache.delete(uid)); // a later page asks again after an "off" or a failure
    cache.set(uid, p);
  }
  return p;
}

export function usePersonalisation(): boolean {
  const { user } = useAuth();
  const [on, setOn] = useState<{ uid: string; on: boolean } | null>(null);
  useEffect(() => {
    if (!user) return;
    let active = true;
    void personalisationOn(user.uid, () => user.getIdToken()).then((v) => active && setOn({ uid: user.uid, on: v }));
    return () => {
      active = false;
    };
  }, [user]);
  return Boolean(user && on?.uid === user.uid && on.on);
}

export function EchoWithConsent({ echoOn, productsOn }: { echoOn: boolean; productsOn: boolean }) {
  const personal = usePersonalisation();
  return <EchoPage echoOn={echoOn} productsOn={productsOn && personal} />;
}

export function DashboardWithConsent({ productsOn }: { productsOn: boolean }) {
  const personal = usePersonalisation();
  return <DashboardPage productsOn={productsOn && personal} />;
}
