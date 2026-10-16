import { afterEach, describe, expect, it, vi } from "vitest";
import { cartUi, consentsUi, dataExportUi, notificationTypesUi, threeAngleUi, weeklyCheckinUi } from "@/lib/ui-flags";

// Redesign master plan (owner 2026-10-14): screens without a backend stay off
// unless their flag is exactly "on".
describe("redesign UI flags", () => {
  afterEach(() => vi.unstubAllEnvs());
  const flags = { NEXT_PUBLIC_UI_WEEKLY_CHECKIN: weeklyCheckinUi, NEXT_PUBLIC_UI_NOTIFICATION_TYPES: notificationTypesUi, NEXT_PUBLIC_UI_CONSENTS: consentsUi, NEXT_PUBLIC_UI_DATA_EXPORT: dataExportUi, NEXT_PUBLIC_UI_CART: cartUi, NEXT_PUBLIC_UI_THREE_ANGLE: threeAngleUi };
  for (const [name, on] of Object.entries(flags)) {
    it(`${name}: off when unset or anything but "on"`, () => {
      vi.stubEnv(name, "");
      expect(on()).toBe(false);
      vi.stubEnv(name, "true");
      expect(on()).toBe(false);
      vi.stubEnv(name, "on");
      expect(on()).toBe(true);
    });
  }
});
