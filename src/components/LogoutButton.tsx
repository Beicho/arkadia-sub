"use client";

import { Button, LinkButton } from "@/components/kumo";
import { SignInIcon, SignOutIcon } from "@phosphor-icons/react";

export default function LoginButton({
  variant = "primary",
}: {
  variant?: "primary" | "secondary" | "ghost";
}) {
  return (
    <Button variant={variant} icon={SignInIcon} onClick={() => (location.href = "/api/auth/login")}>
      LinuxDo 登录
    </Button>
  );
}

export function LogoutButton() {
  return (
    <Button
      variant="ghost"
      size="sm"
      icon={SignOutIcon}
      onClick={() => {
        void fetch("/api/auth/logout", { method: "POST" }).then(() => {
          location.href = "/";
        });
      }}
    >
      退出
    </Button>
  );
}

export { LinkButton };
