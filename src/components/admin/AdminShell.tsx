"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  HouseIcon,
  DatabaseIcon,
  ReceiptIcon,
  TicketIcon,
  UsersIcon,
  ShieldWarningIcon,
  GearIcon,
  ListIcon,
  XIcon,
  GlobeHemisphereWestIcon,
} from "@phosphor-icons/react";

const NAV = [
  { href: "/admin", label: "总览", icon: HouseIcon, exact: true },
  { href: "/admin/nodes", label: "节点批次", icon: DatabaseIcon },
  { href: "/admin/orders", label: "订单", icon: ReceiptIcon },
  { href: "/admin/codes", label: "注册码 / 库存", icon: TicketIcon },
  { href: "/admin/users", label: "用户", icon: UsersIcon },
  { href: "/admin/fraud", label: "风控", icon: ShieldWarningIcon },
  { href: "/admin/settings", label: "设置", icon: GearIcon },
];

export default function AdminShell({
  username,
  children,
}: {
  username: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <div className="min-h-dvh">
      {/* ===== 手机顶栏 ===== */}
      <div
        className="sticky top-0 z-40 flex items-center justify-between border-b px-4 py-3 lg:hidden"
        style={{
          borderColor: "var(--ark-border)",
          background: "color-mix(in srgb, var(--ark-bg) 88%, transparent)",
          backdropFilter: "blur(12px)",
        }}
      >
        <button
          className="ark-btn ark-btn-ghost ark-btn-sm"
          onClick={() => setOpen(true)}
          aria-label="打开菜单"
        >
          <ListIcon size={18} />
        </button>
        <div className="flex items-center gap-2 font-semibold">
          <span
            className="flex h-6 w-6 items-center justify-center rounded-md"
            style={{ background: "var(--ark-accent)", color: "var(--ark-accent-ink)" }}
          >
            <GlobeHemisphereWestIcon size={13} weight="bold" />
          </span>
          Arkadia 后台
        </div>
        <span className="ark-chip">{username}</span>
      </div>

      {/* ===== 手机抽屉 ===== */}
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={() => setOpen(false)}
          />
          <nav
            className="absolute inset-y-0 left-0 flex w-72 flex-col gap-1 p-4"
            style={{ background: "var(--ark-surface)", borderRight: "1px solid var(--ark-border)" }}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="font-semibold">导航</span>
              <button
                className="ark-btn ark-btn-ghost ark-btn-sm"
                onClick={() => setOpen(false)}
                aria-label="关闭菜单"
              >
                <XIcon size={16} />
              </button>
            </div>
            {NAV.map((item) => (
              <AdminNavItem key={item.href} {...item} active={isActive(item.href, item.exact)} />
            ))}
          </nav>
        </div>
      ) : null}

      {/* ===== 桌面侧栏 + 主区 ===== */}
      <div className="flex">
        <aside
          className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r lg:flex"
          style={{ borderColor: "var(--ark-border)", background: "color-mix(in srgb, var(--ark-surface) 60%, transparent)" }}
        >
          <div className="flex items-center gap-2.5 px-5 py-5">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ background: "var(--ark-accent)", color: "var(--ark-accent-ink)" }}
            >
              <GlobeHemisphereWestIcon size={18} weight="bold" />
            </span>
            <div>
              <div className="ark-display font-bold">Arkadia</div>
              <div className="text-xs" style={{ color: "var(--ark-muted)" }}>管理后台</div>
            </div>
          </div>
          <nav className="flex flex-1 flex-col gap-1 px-3">
            {NAV.map((item) => (
              <AdminNavItem key={item.href} {...item} active={isActive(item.href, item.exact)} />
            ))}
          </nav>
          <div className="border-t p-4 text-xs" style={{ borderColor: "var(--ark-border)", color: "var(--ark-muted)" }}>
            <a href="/" className="no-underline" style={{ color: "inherit" }}>
              ← 回到前台({username})
            </a>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 lg:ml-60 md:px-8">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

function AdminNavItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm no-underline transition-colors"
      style={{
        color: active ? "var(--ark-accent)" : "var(--ark-muted)",
        background: active ? "color-mix(in srgb, var(--ark-accent) 10%, transparent)" : "transparent",
        fontWeight: active ? 600 : 400,
      }}
    >
      <Icon size={17} />
      {label}
    </Link>
  );
}
