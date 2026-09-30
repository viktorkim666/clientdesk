// The logo mark for `ImageResponse`, which cannot use Tailwind classes or
// theme tokens. Same geometry as `components/logo-mark.tsx`, literal colors.
export const BRAND_INDIGO = "#4F39F6";

export function ImageMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <rect width="24" height="24" rx="6" fill={BRAND_INDIGO} />
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
  );
}
