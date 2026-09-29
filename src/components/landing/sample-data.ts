import type { ProjectStatus } from "@/lib/validation/project";
import type { WorkspaceRole } from "@/lib/validation/invitation";

// Fictional content for the decorative previews. Times are fixed strings so
// server and browser render the same text.

export const WORKSPACE_NAME = "Northwind Studio";
export const PREVIEW_URL = "clientdesk.app/w/northwind";

export const METRICS = [
  { label: "Active projects", value: "8" },
  { label: "Clients", value: "5" },
  { label: "Updates this week", value: "14" },
] as const;

export const PROJECTS: readonly {
  name: string;
  client: string;
  status: ProjectStatus;
  updated: string;
}[] = [
  {
    name: "Website redesign",
    client: "Acme Bakery",
    status: "active",
    updated: "2h ago",
  },
  {
    name: "Brand refresh",
    client: "Lumen Dental",
    status: "active",
    updated: "Yesterday",
  },
  {
    name: "Booking flow",
    client: "Harbor Yoga",
    status: "on_hold",
    updated: "3d ago",
  },
  {
    name: "Launch campaign",
    client: "Fernhill Books",
    status: "done",
    updated: "1w ago",
  },
];

export const ACTIVITY = [
  {
    id: "update-website",
    who: "Maya Chen",
    what: "posted an update on Website redesign",
    when: "2h ago",
  },
  {
    id: "comment-website",
    who: "Priya Nair",
    what: "commented on Website redesign",
    when: "3h ago",
  },
  {
    id: "file-guidelines",
    who: "Leo Park",
    what: "shared brand-guidelines.pdf",
    when: "Yesterday",
  },
  {
    id: "comment-brand",
    who: "Sam Rivera",
    what: "commented on Brand refresh",
    when: "Yesterday",
  },
] as const;

export const FLOATING_UPDATE = {
  project: "Website redesign",
  author: "Maya Chen",
  body: "Homepage layout is ready for review. The menu page is next.",
  commenter: "Priya Nair",
  comment: "Looks great. Can we try a warmer photo in the header?",
  reply: "Sure, swapping it in now.",
  when: "2h ago",
} as const;

export const MEMBERS: readonly {
  name: string;
  detail: string;
  role: WorkspaceRole;
}[] = [
  { name: "Maya Chen", detail: "Northwind Studio", role: "owner" },
  { name: "Leo Park", detail: "Northwind Studio", role: "member" },
  { name: "Priya Nair", detail: "Acme Bakery", role: "client" },
];

export const FILES = [
  { name: "brand-guidelines.pdf", size: "2.4 MB", kind: "pdf" },
  { name: "homepage-mockup.png", size: "1.1 MB", kind: "image" },
  { name: "site-assets.zip", size: "18 MB", kind: "archive" },
] as const;

export const DRAFT = {
  project: "Website redesign",
  opening:
    "Hi Acme Bakery, this week we finished the homepage layout and started on the menu page.",
} as const;
