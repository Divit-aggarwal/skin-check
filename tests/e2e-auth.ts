// Shared by the end-to-end tests (run by npm run test:local against the stack).
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const PROJECT = process.env.FIREBASE_PROJECT_ID;

// Phone sign-in through the Auth emulator's REST API: a fresh auth_time, as
// the erase route requires.
export async function emulatorPhoneSignIn(phoneNumber: string): Promise<{ idToken: string; localId: string }> {
  const idp = `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1`;
  const sent = await fetch(`${idp}/accounts:sendVerificationCode?key=demo-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phoneNumber, recaptchaToken: "emulator" }),
  }).then((r) => r.json() as Promise<{ sessionInfo: string }>);
  const codes = await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT}/verificationCodes`).then(
    (r) => r.json() as Promise<{ verificationCodes: { sessionInfo: string; code: string }[] }>
  );
  const code = codes.verificationCodes.find((c) => c.sessionInfo === sent.sessionInfo)!.code;
  return fetch(`${idp}/accounts:signInWithPhoneNumber?key=demo-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionInfo: sent.sessionInfo, code }),
  }).then((r) => r.json() as Promise<{ idToken: string; localId: string }>);
}

