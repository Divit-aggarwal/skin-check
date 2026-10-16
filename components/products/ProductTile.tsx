// Our product page (screen 15), built from the static catalogue. The tile
// itself moved into the kit (kit request C1).
export { ProductTile } from "@/components/ui/kit";

export const productHref = (id: string) => `/products/${id}`;
/** Screen 16 for one product the user started. */
export const sinceHref = (id: string) => `/products/${id}/since`;
