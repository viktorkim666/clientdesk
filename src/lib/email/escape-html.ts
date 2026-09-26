const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Escapes a value before interpolating it into an HTML email — both in text
 * nodes and inside a double-quoted attribute (e.g. `href="..."`). Every value
 * that comes from user input (workspace name, invite URL) must go through
 * this before reaching the template.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char]);
}
