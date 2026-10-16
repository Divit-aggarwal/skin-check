// Redesign (TD-50, owner 2026-10-14): screens whose backend does not exist yet
// are built behind these flags. Each is OFF unless set to exactly "on", so a
// merge changes nothing for users. With a flag on, the screen shows but nothing
// saves: a control the backend does not support yet is shown disabled with a
// line naming what it waits for, never a fake save.
// NEXT_PUBLIC_ values are built into the browser code by Next.js.

/** Screen 08, the weekly check-in. Waits on tracker E19. */
export const weeklyCheckinUi = () => process.env.NEXT_PUBLIC_UI_WEEKLY_CHECKIN === "on";

/** Screen 20, per-type notification switches. Waits on tracker G31. */
export const notificationTypesUi = () => process.env.NEXT_PUBLIC_UI_NOTIFICATION_TYPES === "on";

/** Screen 22, the separate consents. Waits on tracker H36. */
export const consentsUi = () => process.env.NEXT_PUBLIC_UI_CONSENTS === "on";

/** Screen 22, data export. Waits on tracker H37. */
export const dataExportUi = () => process.env.NEXT_PUBLIC_UI_DATA_EXPORT === "on";

/** TD-52 (2): Add to Cart (store checkout). Off until the Vercel plan question (A34) is settled. */
export const cartUi = () => process.env.NEXT_PUBLIC_UI_CART === "on";

/** TD-54 (2): three-angle capture with live checks (C10, C11). Off: the one-photo capture stays. */
export const threeAngleUi = () => process.env.NEXT_PUBLIC_UI_THREE_ANGLE === "on";
