import { cache } from "react";
import { isDemoWorkspace } from "./is-demo-workspace";

/**
 * `isDemoWorkspace`, memoized per request the way `getCurrentWorkspace` is:
 * the layout and the page under it ask about the same workspace with the same
 * (cached) Supabase client, so the second ask reuses the first answer. Called
 * outside a render, `cache()` just runs the function again.
 */
export const isCurrentWorkspaceDemo = cache(isDemoWorkspace);
