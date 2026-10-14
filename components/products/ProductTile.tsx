import { Dot, Hand, Package, Pipette, ShowerHead, Sun, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// E20: the catalogue has no product photos, so a product shows as a neutral
// 12px tile with its step's icon, never a stock image. Step icons are not the
// reading icons (Flame, Droplet, Waves, CircleDot, Contrast). Keys cover both
// step names: the routine's ("serum") and Echo's ("treat", "spot").
// ponytail: lives here until kit request 1 (docs/lanes/kit-requests.md) moves a tile into the kit.
const STEP_ICON: Record<string, LucideIcon> = { cleanse: ShowerHead, serum: Pipette, treat: Pipette, moisturise: Hand, protect: Sun, spot: Dot };

export function ProductTile({ step, size = 56, className }: { step: string | null | undefined; size?: number; className?: string }) {
  const Icon = (step && STEP_ICON[step]) || Package;
  return (
    <span aria-hidden style={{ width: size, height: size }} className={cn("grid shrink-0 place-items-center rounded-tile bg-brand-50 text-brand-700", className)}>
      <Icon size={Math.round(size * 0.42)} strokeWidth={1.75} />
    </span>
  );
}

/** Our product page (screen 15), built from the static catalogue. */
export const productHref = (id: string) => `/products/${id}`;
