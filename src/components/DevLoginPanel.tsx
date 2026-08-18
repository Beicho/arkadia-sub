"use client";

import { useState } from "react";
import { Button, Input, LayerCard } from "@/components/kumo";

/** 仅 DEV_FAKE_LOGIN=1 时由服务端渲染 */
export default function DevLoginPanel({ adminName }: { adminName: string }) {
  const [username, setUsername] = useState(adminName);
  const [trust, setTrust] = useState("3");

  const go = (u: string, t: string) => {
    location.href = `/api/auth/dev-login?username=${encodeURIComponent(u)}&trust_level=${t}`;
  };

  return (
    <LayerCard
      className="space-y-3 p-4 text-sm"
      style={{ borderColor: "color-mix(in srgb, var(--ark-amber) 40%, transparent)" }}
    >
      <div className="font-semibold" style={{ color: "var(--ark-amber)" }}>
        DEV 登录(仅开发环境)
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-44">
          <Input label="用户名" value={username} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)} />
        </div>
        <div className="w-24">
          <Input
            label="信任级"
            type="number"
            min={0}
            max={4}
            value={trust}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTrust(e.target.value)}
          />
        </div>
        <Button variant="secondary" size="sm" onClick={() => go(username, trust)}>
          模拟登录
        </Button>
        <Button variant="ghost" size="sm" onClick={() => go(adminName, "4")}>
          以 {adminName}(管理员)登录
        </Button>
      </div>
    </LayerCard>
  );
}
