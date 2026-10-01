const STEPS = [
  {
    title: "Create a workspace",
    copy: "Name your agency's workspace. The Free plan covers your first clients.",
  },
  {
    title: "Invite your client",
    copy: "Send an email invitation. Your client signs up and sees only their own projects.",
  },
  {
    title: "Share updates and files",
    copy: "Post progress, attach files and reply to comments, all in one place.",
  },
] as const;

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-y bg-muted/40 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="reveal max-w-2xl">
          <p className="text-sm font-medium text-primary">How it works</p>
          <h2
            id="how-it-works-heading"
            tabIndex={-1}
            className="mt-3 text-3xl font-semibold tracking-tight outline-none sm:text-4xl"
          >
            Up and running in three steps
          </h2>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            No setup calls and no onboarding for your clients beyond an
            invitation link.
          </p>
        </div>

        <div className="relative mt-12">
          <div
            aria-hidden="true"
            className="absolute top-5 left-5 hidden h-px w-2/3 bg-linear-to-r from-primary/50 to-primary/10 md:block"
          />
          <ol className="reveal relative grid gap-10 md:grid-cols-3 md:gap-8">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex flex-col">
                <span
                  aria-hidden="true"
                  className="flex size-10 items-center justify-center rounded-full bg-background text-sm font-semibold text-primary shadow-sm ring-2 ring-primary/40"
                >
                  {index + 1}
                </span>
                <h3 className="mt-5 text-lg font-semibold tracking-tight">
                  {step.title}
                </h3>
                <p className="mt-2 max-w-sm text-muted-foreground">
                  {step.copy}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
