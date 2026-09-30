import { ImageResponse } from "next/og";
import { BRAND_INDIGO } from "@/lib/brand-image/mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS rounds the corners itself, so the background is a full-bleed square.
// The cards are the 14-unit-wide group of the 24-unit mark, centred and scaled.
export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BRAND_INDIGO,
      }}
    >
      <svg width="112" height="112" viewBox="5 5 14 14">
        <rect
          x="5"
          y="5"
          width="10"
          height="10"
          rx="2.5"
          fill="#FFFFFF"
          opacity="0.45"
        />
        <rect x="9" y="9" width="10" height="10" rx="2.5" fill="#FFFFFF" />
      </svg>
    </div>,
    size,
  );
}
