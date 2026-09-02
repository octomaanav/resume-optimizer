"use client";

import { useLinkStatus } from "next/link";

/**
 * Tiny pulsing dot rendered inside each nav `<Link>`. `useLinkStatus` flips
 * `pending=true` the instant the user clicks, before the server has returned
 * the new route, so the nav bar feels responsive even on slow transitions.
 *
 * Must be a descendant of a `<Link>`. See
 *   docs/01-app/03-api-reference/04-functions/use-link-status.md
 */
export function NavLinkPending() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      className={`link-hint ${pending ? "is-pending" : ""}`}
    />
  );
}
