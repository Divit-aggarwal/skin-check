import type { Metadata } from "next";
import { SkinCheckFlow } from "@/components/skin-check/SkinCheckFlow";

export const metadata: Metadata = {
  title: "Skin Check — The Project SKIN",
  description: "A quick, guided check-in with Echo to understand your skin.",
};

export default function SkinCheckPage() {
  return <SkinCheckFlow />;
}
