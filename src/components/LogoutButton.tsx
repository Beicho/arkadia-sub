"use client";

import { SignInIcon, SignOutIcon } from "@phosphor-icons/react";

export default function LoginButton({
  variant = "primary",
}: {
  variant?: "primary" | "secondary" | "ghost";
}) {
  const cls =
    variant === "primary"
      ? "ark-btn ark-btn-primary"
      : variant === "secondary"
        ? "ark-btn ark-btn-ghost ark-btn-sm"
        : "ark-btn ark-btn-ghost";
  return (
    <button className={cls} onClick={() => (location.href = "/api/auth/login")}>
      <SignInIcon size={15} />
      LinuxDo 登录
    </button>
  );
}

export function LogoutButton() {
  return (
    <button
      className="ark-btn ark-btn-ghost ark-btn-sm"
      onClick={() => {
        void fetch("/api/auth/logout", { method: "POST" }).then(() => {
          location.href = "/";
        });
      }}
    >
      <SignOutIcon size={14} />
      退出
    </button>
  );
}
