const SIDEBAR_COOKIE_NAME = "sidebar_state";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

/**
 * Builds the `document.cookie` string that persists the sidebar's open
 * state. `Secure` is added on https so the cookie is never sent over plain
 * http; on http (local dev) a Secure cookie would be dropped by the browser.
 */
export function sidebarStateCookie(open: boolean, protocol: string): string {
  const secure = protocol === "https:" ? "; Secure" : "";
  return `${SIDEBAR_COOKIE_NAME}=${open}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}
