// PREVIEW ONLY (direction B). Where the preview pages live; "#" where no preview page exists.
export const BASE = "/preview/b";
export const CHECKS_HREF = `${BASE}/checks`;
export const TIMELINE_HREF = `${BASE}/checks?view=timeline`;
export const ECHO_HREF = `${BASE}/echo`;
export const checkHref = (scanId: string) => `${BASE}/checks/${scanId}`;
export const ROUTINE_HREF = "#";
export const NEW_CHECK_HREF = "#";
export const ACCOUNT_HREF = "#";
