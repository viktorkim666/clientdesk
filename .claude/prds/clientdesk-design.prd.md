# Clientdesk design

A visual pass that makes Clientdesk look like a finished product before the demo and walkthrough video are recorded.

## Problem

Clientdesk works end to end, but it still wears the default shadcn look: grey, no accent color, nothing that sets it apart from a starter template. The home page is a heading and two buttons, empty lists read as broken pages, and dark mode and phone layouts have never been checked. An Upwork client who opens the demo from a proposal judges the developer by what they see in the first minute, and right now that says "template", not "shipped product".

## Evidence

- Observation: the owner reviewed the running app after milestone 4 and found it plain and generic. The home page has no product explanation beyond one sentence, and no screen has been checked at phone width or in dark mode.
- Assumption, needs validation via proposal tracking on Upwork: a polished look raises reply and interview rates for proposals that link the project.

## Users

- **Primary**: an Upwork client (founder or product manager hiring a Next.js developer) who opens the live demo from a proposal and decides within minutes whether the work looks professional.
- **Secondary**: the personas inside the demo, an agency owner and the agency's client, whose screens the visitor clicks through.
- **Not for**: real agencies evaluating Clientdesk as a product to buy. The design serves the portfolio goal, not a sales funnel.

## Hypothesis

We believe **a distinct visual direction applied across the landing page, the app screens, dark mode and phone layouts** will **make the demo read as a shipped product instead of a template** for **Upwork clients reviewing the portfolio**.
We'll know we're right when **a person who has never seen the app can say what it is and who it is for after 5 seconds on the landing page, and every screen passes the layout, contrast and empty-state checks below**.

## Success Metrics

| Metric                                 | Target                                                             | How measured                                               |
| -------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------- |
| Landing page is understood at a glance | 1 of 1 first-time viewer names the product and its audience in 5 s | Five-second test with someone who hasn't seen the app      |
| Phone layout                           | No horizontal scroll on any screen at 375 px width                 | Automated check across every route                         |
| Dark mode                              | Every screen readable, text contrast at WCAG AA                    | Automated contrast check in both themes plus a manual pass |
| Accessibility score                    | Lighthouse accessibility ≥ 95                                      | Lighthouse on the landing page, dashboard and project page |
| Empty states                           | Every list explains what goes there and offers the next action     | Review of each list screen against an empty workspace      |
| Portfolio effect                       | TBD, needs validation via proposal tracking on Upwork              | Replies or interviews where the client mentions the demo   |

## Scope

**MVP**

- A chosen visual direction: accent color, typography and component style, applied through the theme so every screen picks it up.
- Light and dark themes, with a way for the visitor to switch between them.
- App screens restyled: navigation, dashboard, project page, clients, members and billing, including empty and loading states.
- A single landing page that explains the product, shows it and leads to sign up or log in.
- Every screen works at phone width.

**Out of scope**

- New features. Behavior, database schema and API stay as they are; only presentation changes.
- A multi-page marketing site. One landing page; no blog, pricing, about or docs pages.
- Logo, favicon and social preview images. Not chosen for this milestone; revisit in milestone 5 of the main PRD.
- The "Try as agency" and "Try as client" demo buttons. They belong to milestone 5 of the main PRD.

## Delivery Milestones

<!-- Status: pending | in-progress | complete -->

| #   | Milestone          | Outcome                                                                                                          | Status   | Plan                                       |
| --- | ------------------ | ---------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------ |
| 1   | Visual foundations | The chosen direction is live in both themes; navigation and page frames work on a phone and on a desktop         | complete | `.claude/plans/design-foundations.plan.md` |
| 2   | App screens        | Dashboard, project page, clients, members and billing look finished, with empty and loading states on every list | complete | `.claude/plans/app-screens.plan.md`        |
| 3   | Landing page       | A first-time visitor understands the product from the home page and reaches sign up or log in                    | complete | `.claude/plans/landing-page.plan.md`       |

## Open Questions

- [x] Which visual direction? Decided from 3 mockups: direction A "Indigo focus" (zinc neutrals, one indigo accent, Geist).
- [x] Are custom illustrations or motion beyond light transitions worth the time? Decided: Lucide icons, light transitions and CSS scroll reveal; no custom illustrations.
- [x] Static screenshots or a live preview? Decided: a coded preview built from the app's components on sample data, so it follows the theme and needs no refresh after milestone 5.

## Risks

| Risk                                                                    | Likelihood | Impact | Mitigation                                                                            |
| ----------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------- |
| Design work expands without an end point                                | High       | Medium | The direction is fixed at the first milestone; each milestone ships and is demoable   |
| Restyling breaks existing flows or the end-to-end tests that cover them | Medium     | Medium | Keep accessible names and roles; the existing test suite runs on every change         |
| Dark theme fails contrast in components nobody looked at                | Medium     | Low    | Automated contrast check in both themes as part of acceptance                         |
| The two-week portfolio timebox slips further                            | Medium     | Medium | Three small milestones; milestone 5 can start after milestone 1 of this PRD if needed |

_Status: DRAFT, requirements only. Implementation planning pending via /plan._
