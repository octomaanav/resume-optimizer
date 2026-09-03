"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  User,
  FolderOpen,
  MessageSquareText,
  Sparkles,
  Settings,
  Send,
} from "lucide-react";
import { AuthHeader } from "./components/auth-header";
import { NavLinkPending } from "./components/nav-link-pending";
import { WebMcpPdfBanner } from "./components/webmcp-pdf-banner";
import { WebMcpProvider } from "./components/webmcp-provider";
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
  { href: "/apply", label: "Apply Demo", icon: Send },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <WorkspaceProvider>
      <WebMcpProvider />
      <div className="theme-apply min-h-full bg-background text-foreground">
        <WebMcpPdfBanner />
        <div className="relative z-10 mx-auto min-h-full w-full max-w-6xl px-3 pb-28 pt-4 sm:px-6">
          <header className="mb-6 flex items-center justify-between gap-3">
            <Link
              href="/"
              className="group flex items-center gap-2 text-sm font-semibold tracking-tight"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white shadow-sm">
                <Sparkles size={14} />
              </span>
              <span className="text-foreground group-hover:text-accent transition-colors">
                Resume Optimizer
              </span>
            </Link>
            <AuthHeader />
          </header>

          <main className="p-4 sm:p-6">
            {children}
          </main>
        </div>

        <nav
          className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-0.5 rounded-2xl border border-border bg-surface/90 px-2 py-1.5 shadow-lg shadow-black/8 backdrop-blur-xl dark:shadow-black/40"
          aria-label="Main navigation"
        >
          {dockItems.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href ||
                  pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "relative inline-flex flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-2 text-[10px] font-medium transition-all sm:flex-row sm:gap-1.5 sm:px-3.5 sm:text-xs",
                  active
                    ? "bg-accent text-white shadow-sm"
                    : "text-muted hover:bg-surface-raised hover:text-foreground",
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
