"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ChevronDown,
  Inbox,
  LayoutList,
  LogOut,
  Mail,
  Menu,
  PlusCircle,
  Send,
  ShieldAlert,
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
  { href: "/admin/users", label: "People", icon: Users },
  { href: "/admin/unprocessed", label: "Unprocessed", icon: ShieldAlert },
  { href: "/admin/gmail", label: "Gmail", icon: Mail },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavRow({
  item,
  active,
  isExpanded = true,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  isExpanded?: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const linkContent = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`group flex h-row items-center gap-2.5 rounded text-base font-medium
        transition-colors duration-150
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30
        ${isExpanded ? "w-full px-2.5" : "h-10 w-10 justify-center mx-auto"}
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
      {isExpanded && <span className="truncate">{item.label}</span>}
    </Link>
  );

  if (!isExpanded) {
    return (
      <div className="flex justify-center">
        <Tooltip label={item.label} side="right">
          {linkContent}
        </Tooltip>
      </div>
    );
  }

  return linkContent;
}

function SidebarContent({
  isExpanded = true,
  onNavigate,
}: {
  isExpanded?: boolean;
  onNavigate?: () => void;
}) {
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

  const newRequestLink = (
    <Link
      href="/new"
      onClick={onNavigate}
      className={`mb-3 flex h-control items-center gap-2 rounded text-base font-medium
        transition-colors duration-150
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30
        ${isExpanded ? "w-full px-2.5" : "h-10 w-10 justify-center mx-auto"}
        ${
          isActive(pathname, "/new")
            ? "bg-nav-active text-white"
            : "bg-white/[0.06] text-nav-strong hover:bg-white/[0.12]"
        }`}
    >
      <PlusCircle size={17} strokeWidth={1.85} aria-hidden />
      {isExpanded && <span className="truncate">New request</span>}
    </Link>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-nav-bg">
      {/* Workspace identity */}
      <div
        className={`flex h-header shrink-0 items-center border-b border-nav-border ${
          isExpanded ? "px-3 gap-2.5" : "justify-center"
        }`}
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded">
          <Image
            src="/brand-mark.png"
            alt="BlauPlug"
            width={28}
            height={28}
            className="h-full w-full object-contain"
          />
        </div>
        {isExpanded && (
          <div className="min-w-0">
            <div className="truncate text-base font-semibold tracking-tightish text-nav-strong">
              BlauPlug
            </div>
            <div className="truncate text-2xs text-nav-muted">Approvals</div>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3 scrollbar-thin">
        {isExpanded ? (
          newRequestLink
        ) : (
          <div className="flex justify-center">
            <Tooltip label="New request" side="right">
              {newRequestLink}
            </Tooltip>
          </div>
        )}

        {isExpanded ? (
          <div className="px-2.5 pb-1 text-2xs font-semibold uppercase tracking-wideish text-nav-muted">
            Approvals
          </div>
        ) : (
          <div className="mx-2 my-2 h-px bg-nav-border/60" />
        )}
        <nav className="space-y-0.5">
          {PRIMARY_NAV.map((item) => (
            <NavRow
              key={item.href}
              item={item}
              active={isActive(pathname, item.href)}
              isExpanded={isExpanded}
              onNavigate={onNavigate}
            />
          ))}
        </nav>

        {user.role === "ADMIN" && (
          <div className="mt-4 border-t border-nav-border pt-3">
            {isExpanded ? (
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
            ) : (
              <div className="mx-2 my-2 h-px bg-nav-border/60" />
            )}
            {(adminOpen || !isExpanded) && (
              <nav className="mt-0.5 space-y-0.5">
                {ADMIN_NAV.map((item) => (
                  <NavRow
                    key={item.href}
                    item={item}
                    active={isActive(pathname, item.href)}
                    isExpanded={isExpanded}
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
        {isExpanded ? (
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
        ) : (
          <div className="flex flex-col items-center gap-1.5 py-1">
            <Tooltip label={`${user.name} (${user.email})`} side="right">
              <span
                aria-hidden
                className="flex h-7 w-7 items-center justify-center rounded bg-white/10 text-2xs font-semibold text-nav-strong"
              >
                {initials || "?"}
              </span>
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );
}

function DesktopSidebar() {
  const [isHovered, setIsHovered] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isHovered) {
      timer = setTimeout(() => setIsExpanded(true), 150);
    } else {
      setIsExpanded(false);
    }
    return () => clearTimeout(timer);
  }, [isHovered]);

  return (
    <aside
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`hidden shrink-0 overflow-hidden border-r border-nav-border bg-nav-bg transition-[width] duration-200 ease-out lg:block ${
        isExpanded ? "w-[248px]" : "w-[64px]"
      }`}
    >
      <SidebarContent isExpanded={isExpanded} />
    </aside>
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
      <DesktopSidebar />

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
            <SidebarContent isExpanded={true} onNavigate={() => setMobileOpen(false)} />
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
