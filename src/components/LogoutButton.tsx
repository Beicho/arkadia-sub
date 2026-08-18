"use client";

import { Button } from "@cloudflare/kumo/components/button";
import { SignInIcon } from "@phosphor-icons/react";

export default function LoginButton({ variant = "primary" }: { variant?: "primary" | "secondary" | "ghost" }) {
  return (
    <Button variant={variant} icon={SignInIcon} onClick={() => (location.href = "/api/auth/login")}>
      使用 LinuxDo 登录
    </Button>
  );
}

export function LogoutButton() {
  return (
    <Button
      variant="ghost"
      onClick={() => {
        void fetch("/api/auth/logout", { method: "POST" }).then(() => {
          location.href = "/";
        });
      }}
    >
      退出登录
    </Button>
  );
}
