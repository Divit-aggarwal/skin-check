import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { findProductionTargets, assertDevEnvSafe } = require("../lib/dev-env-guard.cjs");
const nextConfig = require("../next.config.js");
const { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } = require("next/constants");

const LOCAL = {
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-skin-check",
  FIREBASE_PROJECT_ID: "demo-skin-check",
  FIREBASE_CLIENT_EMAIL: "local-dev@demo-skin-check.iam.gserviceaccount.com",
  SKIN_SCAN_API_URL: "http://127.0.0.1:3107",
  S3_SKIN_IMAGES_BUCKET: "skin-originals-dev",
};
const names = (env: Record<string, string>) => findProductionTargets(env).map((h: { name: string }) => h.name);

describe("dev env guard", () => {
  it("accepts the local stack values", () => {
    expect(names(LOCAL)).toEqual([]);
    expect(() => assertDevEnvSafe(LOCAL)).not.toThrow();
  });

  it.each([
    ["NEXT_PUBLIC_FIREBASE_PROJECT_ID", "projectskin-a202c"],
    ["FIREBASE_PROJECT_ID", " ProjectSkin-A202C "],
    ["FIREBASE_CLIENT_EMAIL", "firebase-adminsdk-x@projectskin-a202c.iam.gserviceaccount.com"],
    ["SKIN_SCAN_API_URL", "https://api.theprojectskin.com"],
    ["SKIN_SCAN_API_URL", "HTTPS://API.THEPROJECTSKIN.COM/scan"],
    ["SKIN_SCAN_API_URL", "http://skin-scan-alb-1856657532.ap-south-1.elb.amazonaws.com"],
    ["SKIN_SCAN_API_URL", "not a url"],
    ["S3_SKIN_IMAGES_BUCKET", "projectskin-skin-originals-prod"],
    ["NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "projectskin-a202c.firebaseapp.com"],
    ["SOME_OTHER_NAME", "gs://projectskin-skin-originals-prod/x"],
  ])("refuses %s = %s", (name, value) => {
    expect(names({ ...LOCAL, [name]: value })).toEqual([name]);
    expect(() => assertDevEnvSafe({ ...LOCAL, [name]: value })).toThrow(name);
  });

  it("never puts a value in the error", () => {
    const email = "firebase-adminsdk-x@projectskin-a202c.iam.gserviceaccount.com";
    let message = "";
    try { assertDevEnvSafe({ ...LOCAL, FIREBASE_CLIENT_EMAIL: email }); } catch (e) { message = (e as Error).message; }
    expect(message).toContain("FIREBASE_CLIENT_EMAIL");
    expect(message).not.toContain(email);
  });

  it("next.config refuses `next dev` with production values, and leaves builds alone", () => {
    const saved = process.env.FIREBASE_PROJECT_ID;
    process.env.FIREBASE_PROJECT_ID = "projectskin-a202c";
    try {
      expect(() => nextConfig(PHASE_DEVELOPMENT_SERVER)).toThrow("FIREBASE_PROJECT_ID");
      expect(() => nextConfig(PHASE_PRODUCTION_BUILD)).not.toThrow();
    } finally {
      if (saved === undefined) delete process.env.FIREBASE_PROJECT_ID; else process.env.FIREBASE_PROJECT_ID = saved;
    }
  });
});
