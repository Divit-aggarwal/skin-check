// PREVIEW ONLY (direction B). Plain view types shared by server and client parts.
export type Reading = { metric: string; label: string; band: string };
export type Area = { region: string; label: string; readings: Reading[] };
export type Slot = { key: string; product: string; slot: "AM" | "PM"; slotLabel: string };
export type TimelineItem = {
  key: string;
  day: string;
  dayLabel: string;
  type: "check" | "routine";
  title: string;
  meta: string | null;
  href: string;
  linkLabel: string;
  kept: boolean;
};
