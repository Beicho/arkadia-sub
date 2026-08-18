"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sidebar } from "@cloudflare/kumo/components/sidebar";
import {
  HouseIcon,
  DatabaseIcon,
  ReceiptIcon,
  TicketIcon,
  UsersIcon,
  ShieldWarningIcon,
  GearIcon,
} from "@phosphor-icons/react";

const NAV = [
  { href: "/admin", label: "总览", icon: HouseIcon },
  { href: "/admin/nodes", label: "节点批次", icon: DatabaseIcon },
  { href: "/admin/orders", label: "订单", icon: ReceiptIcon },
  { href: "/admin/codes", label: "注册码/库存", icon: TicketIcon },
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
      <Sidebar>
        <Sidebar.Content>
          <Sidebar.Group>
            <Sidebar.GroupLabel>Arkadia 管理后台</Sidebar.GroupLabel>
            <Sidebar.Menu>
              {NAV.map((item) => (
                <Sidebar.MenuButton
                  key={item.href}
                  icon={item.icon}
                  active={pathname === item.href}
                >
                  <Link href={item.href} className="block w-full">
                    {item.label}
                  </Link>
                </Sidebar.MenuButton>
              ))}
            </Sidebar.Menu>
          </Sidebar.Group>
        </Sidebar.Content>
        <Sidebar.Footer>
          <div className="flex items-center justify-between gap-2">
            <Link href="/dashboard" className="text-sm underline">
              {username}
            </Link>
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
