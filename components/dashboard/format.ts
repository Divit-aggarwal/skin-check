import { DASHBOARD_COPY as C } from "./copy";

/** A check's date as every screen prints it: "3 Oct 2026"; "Just now" while the server time is pending. */
export const formatDate = (date: Date | null) =>
  date ? date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : C.history.justNow;
