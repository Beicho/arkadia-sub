"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/kumo";
import {
  HouseIcon,
  DatabaseIcon,
  ReceiptIcon,
  TicketIcon,
  UsersIcon,
  ShieldWarningIcon,
  GearIcon,
  GiftIcon,
  MegaphoneIcon,
} from "@phosphor-icons/react";

const NAV = [
  { href: "/admin", label: "总览", icon: HouseIcon, exact: true },
  { href: "/admin/nodes", label: "节点批次", icon: DatabaseIcon },
  { href: "/admin/announcements", label: "公告", icon: MegaphoneIcon },
  { href: "/admin/socks", label: "SOCKS5 福利池", icon: GiftIcon },
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

  return (
    <Sidebar.Provider defaultOpen>
      {/* 手机顶栏:Trigger 必须在侧栏外,否则随收起的侧栏一起藏在屏幕外 */}
      <div className="ark-float-nav mx-3 mt-3 flex items-center justify-between px-4 py-2.5 lg:hidden">
        <Sidebar.Trigger />
        <span className="ark-display font-semibold">Arkadia 后台</span>
        <span className="ark-chip">{username}</span>
      </div>
      <Sidebar>
        <Sidebar.Content>
          <div className="flex items-center gap-2.5 px-4 pt-5">
            <span
              className="ark-display text-lg font-bold"
              style={{ color: "var(--ark-accent)" }}
            >
              Arkadia
            </span>
            <span className="text-xs" style={{ color: "var(--ark-muted)" }}>
              管理后台
            </span>
          </div>
          <Sidebar.Group>
            <Sidebar.GroupLabel>导航</Sidebar.GroupLabel>
            <Sidebar.Menu>
              {NAV.map((item) => (
                <Sidebar.MenuItem key={item.href}>
                  <Sidebar.MenuButton
                    icon={item.icon}
                    active={
                      item.exact
                        ? pathname === item.href
                        : pathname.startsWith(item.href)
                    }
                    onClick={() => window.location.assign(item.href)}
                  >
                    {item.label}
                  </Sidebar.MenuButton>
                </Sidebar.MenuItem>
              ))}
            </Sidebar.Menu>
          </Sidebar.Group>
        </Sidebar.Content>
        <Sidebar.Footer>
          <div className="flex items-center justify-between gap-2">
            <a
              href="/"
              className="text-xs underline"
              style={{ color: "var(--ark-muted)" }}
            >
              {username} · 前台
            </a>
            <Sidebar.Trigger />
          </div>
        </Sidebar.Footer>
      </Sidebar>
      <main className="admin-main min-w-0 flex-1 px-4 py-6 md:px-8">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>
    </Sidebar.Provider>
  );
}
