// Development-only guard (tracker B01): `next dev` must never talk to
// production. next.config.js calls assertDevEnvSafe() in the dev-server
// phase, so a dev environment that names the production Firebase project,
// engine or image bucket refuses to start. Reports variable NAMES only, never
// values. CommonJS because next.config.js requires it.

const PROD_FIREBASE_PROJECT = "projectskin-a202c";
const PROD_ENGINE_HOSTS = ["api.theprojectskin.com", "skin-scan-alb-1856657532.ap-south-1.elb.amazonaws.com"];
const PROD_BUCKET = "projectskin-skin-originals-prod";

const lower = (v) => String(v ?? "").trim().toLowerCase();

function hostOf(value) {
  try {
    return new URL(String(value).trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Names of env vars that point at production, each with a short reason. */
function findProductionTargets(env) {
  const hits = new Map();
  const flag = (name, reason) => hits.has(name) || hits.set(name, reason);

  for (const name of ["NEXT_PUBLIC_FIREBASE_PROJECT_ID", "FIREBASE_PROJECT_ID", "GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT"]) {
    if (lower(env[name]) === PROD_FIREBASE_PROJECT) flag(name, "production Firebase project");
  }
  if (lower(env.FIREBASE_CLIENT_EMAIL).endsWith(`@${PROD_FIREBASE_PROJECT}.iam.gserviceaccount.com`)) {
    flag("FIREBASE_CLIENT_EMAIL", "production Firebase service account");
  }
  if (env.SKIN_SCAN_API_URL) {
    const host = hostOf(env.SKIN_SCAN_API_URL);
    if (host === null) flag("SKIN_SCAN_API_URL", "not a valid URL");
    else if (PROD_ENGINE_HOSTS.includes(host)) flag("SKIN_SCAN_API_URL", "production engine");
  }
  if (lower(env.S3_SKIN_IMAGES_BUCKET) === PROD_BUCKET) flag("S3_SKIN_IMAGES_BUCKET", "production image bucket");

  // Catch-all for names not listed above: any value that mentions a
  // production identifier.
  const needles = [PROD_FIREBASE_PROJECT, PROD_BUCKET, ...PROD_ENGINE_HOSTS];
  for (const [name, value] of Object.entries(env)) {
    const v = lower(value);
    if (v && needles.some((n) => v.includes(n))) flag(name, "mentions a production identifier");
  }
  return [...hits].map(([name, reason]) => ({ name, reason }));
}

function assertDevEnvSafe(env) {
  const hits = findProductionTargets(env);
  if (hits.length === 0) return;
  const lines = hits.map((h) => `  - ${h.name}: ${h.reason}`).join("\n");
  throw new Error(
    `Refusing to start the dev server: these variables point at production:\n${lines}\n` +
      "Use the local stack instead: npm run dev:local (see .env.development.example)."
  );
}

module.exports = { findProductionTargets, assertDevEnvSafe };
