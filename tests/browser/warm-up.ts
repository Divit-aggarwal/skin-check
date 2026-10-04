// Fetches each route once, so next dev compiles it before the first test.
// Without it, the first test on a fresh stack saw Firebase Auth never report
// (stuck on "Loading…") while next dev was still compiling (report §2).
export default async function warmUp() {
  const base = `http://localhost:${process.env.PW_PORT}`;
  for (const path of ["/dashboard", "/account", "/skin-check", "/echo", "/routine"]) {
    await fetch(base + path).catch(() => undefined);
  }
}
