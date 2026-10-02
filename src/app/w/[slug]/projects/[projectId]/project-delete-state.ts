function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * Whether the typed text confirms deleting the project. Whitespace is
 * forgiven (trimmed, runs collapsed to one space, on both sides); case is not.
 * This is a guard in the UI only: the server never sees the typed name.
 */
export function matchesProjectName(typed: string, name: string): boolean {
  const normalizedTyped = normalizeName(typed);
  return normalizedTyped.length > 0 && normalizedTyped === normalizeName(name);
}

function countOf(count: number, singular: string): string | null {
  if (count === 0) {
    return null;
  }
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

/**
 * What a project holds, for the confirmation text: "3 updates, 5 comments and
 * 2 files". Leaves out what the project does not have, and returns null for a
 * project with nothing in it so the caller can word that case on its own.
 */
export function describeProjectContents({
  updates,
  comments,
  files,
}: {
  updates: number;
  comments: number;
  files: number;
}): string | null {
  const parts = [
    countOf(updates, "update"),
    countOf(comments, "comment"),
    countOf(files, "file"),
  ].filter((part): part is string => part !== null);

  if (parts.length === 0) {
    return null;
  }
  if (parts.length === 1) {
    return parts[0];
  }
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
