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
import { WorkspaceProvider } from "./lib/workspace-context";

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
  return pathname === href || pathname.startsWith(href + "/");
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <WorkspaceProvider>
      <div className="flex min-h-full flex-col bg-background text-foreground">
        <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
            <Link
              href="/"
              className="group flex shrink-0 items-center gap-2"
              aria-label="Resume Optimizer home"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-on-accent">
                <FileText size={14} />
              </span>
              <span className="hidden text-[15px] font-semibold tracking-tight transition-colors group-hover:text-accent sm:inline">
                Resume Optimizer
              </span>
            </Link>

            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle />
              <span className="hidden h-5 w-px bg-border sm:inline" aria-hidden />
              <AuthHeader />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 sm:px-6">
          {children}
        </main>

        <nav
          className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-0.5 rounded-2xl border border-border bg-surface-raised/90 px-2 py-1.5 shadow-lg shadow-black/10 backdrop-blur-xl dark:shadow-black/40"
          aria-label="Main navigation"
        >
          {dockItems.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "relative inline-flex flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-2 text-[10px] font-medium transition-all sm:flex-row sm:gap-1.5 sm:px-3.5 sm:text-xs",
                  active
                    ? "bg-accent text-on-accent shadow-sm"
                    : "text-muted hover:bg-surface-sunken hover:text-foreground",
                ].join(" ")}
              >
                <Icon size={16} className="shrink-0" />
                <span>{item.label}</span>
                <NavLinkPending />
              </Link>
            );
          })}
        </nav>
      </div>
    </WorkspaceProvider>
  );
}
