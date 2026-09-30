// Indigo glow and a faint grid behind a page that is otherwise one card on a
// flat canvas. Put it inside a `relative isolate` wrapper: it fills that
// wrapper, sits behind the content and never affects layout. Static, so there
// is nothing for reduced-motion users to turn off.
export function PageBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <div className="landing-glow" />
      <div className="landing-grid" />
    </div>
  );
}
