import Image from "next/image";
import type { StoreImage } from "@/lib/feature-contracts/store-products";
import { cn } from "@/lib/utils";
import { ProductTile } from "./ProductTile";

// TD-52 (6): our own product's photo from the store (next/image, the store's
// CDN only). Without one (store not read, no image) the step-icon tile stays.
// Decorative beside the product name, so alt is empty unless `alt` is given.
export function ProductPhoto({ image, step, width, height = width, alt = "", className, priority }: { image: StoreImage | undefined | null; step: string | null | undefined; width: number; height?: number; alt?: string; className?: string; priority?: boolean }) {
  if (!image) return <ProductTile step={step} size={width} className={className} />;
  return (
    <Image
      src={image.src}
      alt={alt}
      width={width}
      height={height}
      sizes={`${width}px`}
      priority={priority}
      className={cn("shrink-0 rounded-tile bg-brand-50 object-cover", className)}
    />
  );
}
