"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ChevronDown,
  Inbox,
  KeyRound,
  LayoutList,
  LogOut,
  Mail,
  Menu,
  Plug,
  PlusCircle,
  Send,
  ShieldAlert,
  UserPlus,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "./AuthProvider";
import { Tooltip } from "./ui";

type NavItem = { href: string; label: string; icon: LucideIcon };

const PRIMARY_NAV: NavItem[] = [
  { href: "/received", label: "Received", icon: Inbox },
  { href: "/sent", label: "Sent", icon: Send },
  { href: "/part-of", label: "Part-of", icon: Users },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/all", label: "All approvals", icon: LayoutList },
  { href: "/admin/users", label: "People", icon: UserPlus },
  { href: "/admin/unprocessed", label: "Unprocessed", icon: ShieldAlert },
  { href: "/admin/gmail", label: "Gmail", icon: Mail },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavRow({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`group flex h-row items-center gap-2.5 rounded px-2.5 text-base font-medium
        transition-colors duration-150
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30
        ${
          active
            ? "bg-nav-active text-white"
            : "text-nav-text hover:bg-nav-hover hover:text-nav-strong"
        }`}
    >
      <Icon
        size={17}
        strokeWidth={1.85}
        aria-hidden
        className={`shrink-0 ${active ? "text-white" : "text-nav-muted group-hover:text-nav-text"}`}
      />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [adminOpen, setAdminOpen] = useState(true);

  if (!user) return null;
  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex h-full min-h-0 flex-col bg-nav-bg">
      {/* Workspace identity */}
      <div className="flex h-header shrink-0 items-center gap-2.5 border-b border-nav-border px-3">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-brand-500 text-white">
          <Plug size={15} strokeWidth={2.25} aria-hidden />
        </div>
        <div className="min-w-0">
          <div className="truncate text-base font-semibold tracking-tightish text-nav-strong">
            BlauPlug
          </div>
          <div className="truncate text-2xs text-nav-muted">Approvals</div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3 scrollbar-thin">
        <Link
          href="/new"
          onClick={onNavigate}
          className={`mb-3 flex h-control items-center gap-2 rounded px-2.5 text-base font-medium
            transition-colors duration-150
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30
            ${
              isActive(pathname, "/new")
                ? "bg-nav-active text-white"
                : "bg-white/[0.06] text-nav-strong hover:bg-white/[0.12]"
            }`}
        >
          <PlusCircle size={17} strokeWidth={1.85} aria-hidden />
          New request
        </Link>

        <div className="px-2.5 pb-1 text-2xs font-semibold uppercase tracking-wideish text-nav-muted">
          Approvals
        </div>
        <nav className="space-y-0.5">
          {PRIMARY_NAV.map((item) => (
            <NavRow
              key={item.href}
              item={item}
              active={isActive(pathname, item.href)}
              onNavigate={onNavigate}
            />
          ))}
        </nav>

        {user.role === "ADMIN" && (
          <div className="mt-4 border-t border-nav-border pt-3">
            <button
              type="button"
              onClick={() => setAdminOpen((v) => !v)}
              aria-expanded={adminOpen}
              className="flex w-full items-center gap-1 rounded px-2.5 py-1 text-2xs font-semibold uppercase tracking-wideish text-nav-muted transition-colors duration-150 hover:text-nav-text"
            >
              <ChevronDown
                size={12}
                aria-hidden
                className={`transition-transform duration-150 ${adminOpen ? "" : "-rotate-90"}`}
              />
              Administration
            </button>
            {adminOpen && (
              <nav className="mt-0.5 space-y-0.5">
                {ADMIN_NAV.map((item) => (
                  <NavRow
                    key={item.href}
                    item={item}
                    active={isActive(pathname, item.href)}
                    onNavigate={onNavigate}
                  />
                ))}
              </nav>
            )}
          </div>
        )}
      </div>

      {/* Account */}
      <div className="shrink-0 border-t border-nav-border p-2">
        <div className="flex items-center gap-2.5 rounded px-2 py-2">
          <span
            aria-hidden
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-white/10 text-2xs font-semibold text-nav-strong"
          >
            {initials || "?"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-nav-strong" title={user.name}>
              {user.name}
            </div>
            <div className="truncate text-2xs text-nav-muted" title={user.email}>
              {user.email}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <Tooltip label="Change password">
              <Link
                href="/account/password"
                onClick={onNavigate}
                aria-label="Change password"
                className="flex h-7 w-7 items-center justify-center rounded text-nav-muted transition-colors duration-150 hover:bg-nav-hover hover:text-nav-strong"
              >
                <KeyRound size={14} aria-hidden />
              </Link>
            </Tooltip>
            <Tooltip label="Sign out">
              <button
                type="button"
                onClick={() => void logout()}
                aria-label="Sign out"
                className="flex h-7 w-7 items-center justify-center rounded text-nav-muted transition-colors duration-150 hover:bg-nav-hover hover:text-nav-strong"
              >
                <LogOut size={14} aria-hidden />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <span className="inline-flex items-center gap-2 text-sm text-slate-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-500" />
          Loading workspace…
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <aside className="hidden w-[248px] shrink-0 lg:block">
        <Sidebar />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            role="button"
            tabIndex={-1}
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-slate-900/50"
          />
          <div className="absolute inset-y-0 left-0 w-[min(84vw,248px)] shadow-modal">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
              className="absolute right-2 top-4 z-10 flex h-8 w-8 items-center justify-center rounded text-nav-muted transition-colors duration-150 hover:bg-nav-hover hover:text-nav-strong"
            >
              <X size={16} />
            </button>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-header shrink-0 items-center gap-3 border-b border-line bg-surface px-3 sm:px-4 lg:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="flex h-control w-control shrink-0 items-center justify-center rounded text-slate-600 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900 lg:hidden"
          >
            <Menu size={18} />
          </button>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-md font-semibold tracking-tightish text-slate-900">
              {title ?? "Approvals"}
            </h1>
            {subtitle && (
              <p className="hidden truncate text-xs text-slate-500 sm:block">
                {subtitle}
              </p>
            )}
          </div>

          {actions && (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          )}
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          {children}
        </main>
      </div>
    </div>
  );
}
