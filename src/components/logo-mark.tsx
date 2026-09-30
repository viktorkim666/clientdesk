// Two offset cards on an indigo tile: the agency and the client. The tile
// follows the theme token, so dark mode picks the lighter indigo on its own.
// The cards stay white in both themes, like `icon.svg`, which repeats this
// geometry with literal colors.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="24" height="24" rx="6" className="fill-primary" />
      <rect
        x="5"
        y="5"
        width="10"
        height="10"
        rx="2.5"
        opacity="0.45"
        className="fill-white"
      />
      <rect
        x="9"
        y="9"
        width="10"
        height="10"
        rx="2.5"
        className="fill-white"
      />
    </svg>
  );
}
