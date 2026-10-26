"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileText,
  FolderOpen,
  Home,
  MessageSquareText,
  Settings,
  Sparkles,
  User,
} from "lucide-react";

import { AuthHeader } from "./components/auth-header";
import { NavLinkPending } from "./components/nav-link-pending";
import { ThemeToggle } from "./components/theme-toggle";
import { WorkspaceProvider, useWorkspace } from "./lib/workspace-context";

const dockItems: Array<{
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}> = [
  { href: "/", label: "Home", icon: Home },
  { href: "/profile", label: "Profile", icon: User },
  { href: "/documents", label: "Documents", icon: FolderOpen },
  { href: "/application-questions", label: "Q&A", icon: MessageSquareText },
  { href: "/optimize", label: "Optimize", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/documents" && /^\/(resumes|cover-letters)(\/|$)/.test(pathname)) return true;
  return pathname === href || pathname.startsWith(href + "/");
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <WorkspaceProvider>
      <div className="workspace-shell min-h-screen bg-background text-foreground">
        <a href="#main-content" className="skip-link">Skip to content</a>
        <aside className="workspace-rail">
          <Link href="/" className="workspace-brand" aria-label="Tailr home">
            <span className="brand-mark" aria-hidden><FileText size={19} /></span>
            <span>Tailr<span className="block text-muted font-normal text-xs tracking-normal">Workspace</span></span>
          </Link>
          <div className="rail-label">Your workspace</div>
          <nav className="workspace-nav" aria-label="Main navigation">
            {dockItems.map((item, index) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className="workspace-nav-item">
                <Icon size={17} className="shrink-0" />
                <span>{item.label}</span>
                <span className="nav-index" aria-hidden>{String(index + 1).padStart(2, "0")}</span>
                <NavLinkPending />
              </Link>;
            })}
          </nav>
          <div className="rail-note"><span className="eyebrow">A considered application.</span><p>Your experience.<br />A sharper presentation.</p></div>
        </aside>
        <div className="workspace-body">
          <header className="workspace-topbar">
            <div className="flex min-w-0 items-center gap-2 text-xs text-muted">
              <span className="hidden sm:inline">Workspace</span><span className="hidden sm:inline text-faint" aria-hidden>/</span>
              <span className="truncate font-medium text-foreground">{dockItems.find(item => isActive(pathname, item.href))?.label ?? (pathname === "/login" ? "Sign in" : pathname === "/signup" ? "Create account" : "Document editor")}</span>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-4"><ThemeToggle /><AuthHeader /></div>
          </header>
          <main id="main-content" tabIndex={-1} className="workspace-main">
            <WorkspaceGuard>{children}</WorkspaceGuard>
          </main>
        </div>
      </div>
    </WorkspaceProvider>
  );
}

function WorkspaceGuard({ children }: { children: React.ReactNode }) {
  const { loadError, refresh } = useWorkspace();
  return <>
    {loadError ? <div role="alert" className="mb-4 rounded-xl border border-red-300 bg-red-50 p-4 text-red-900 dark:bg-red-950 dark:text-red-100">
      <p>Could not load your workspace: {loadError}. Editing is paused to protect your saved data.</p>
      <button type="button" onClick={() => void refresh()} className="mt-2 rounded border px-3 py-1">Retry loading</button>
    </div> : null}
    <fieldset disabled={Boolean(loadError)} className="min-w-0 border-0 p-0 m-0">{children}</fieldset>
  </>;
}
