// TD-47 switches, client-safe. Both features are OFF unless set to exactly
// "on" (the opposite of ECHO_SWITCH, so a merge changes nothing until the
// owner turns each one on). next.config.js builds the values into the
// browser code; a Vercel setting takes effect with the next deployment.

/** The weather card and the location question. Production also needs OPEN_METEO_API_KEY. */
export const weatherOn = () => process.env.CONDITIONS_SWITCH === "on";

/** Reminder notifications (web push). Also needs both VAPID keys. */
export const pushOn = () => process.env.PUSH_SWITCH === "on" && !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
