"use client";

import { useState } from "react";
import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";

/** 仅 DEV_FAKE_LOGIN=1 时由服务端渲染 */
export default function DevLoginPanel({ adminName }: { adminName: string }) {
  const [username, setUsername] = useState(adminName);
  const [trust, setTrust] = useState("3");

  const go = (u: string, t: string) => {
    location.href = `/api/auth/dev-login?username=${encodeURIComponent(u)}&trust_level=${t}`;
  };

  return (
    <div className="mt-6 rounded-lg border border-dashed border-amber-400 bg-amber-50 p-4 text-sm dark:bg-amber-950">
      <div className="mb-2 font-semibold">DEV 登录(仅开发环境)</div>
      <div className="flex flex-wrap items-end gap-2">
        <Input
          label="用户名"
          value={username}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
        />
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
        <Button variant="secondary" onClick={() => go(username, trust)}>
          模拟登录
        </Button>
        <Button variant="ghost" onClick={() => go(adminName, "4")}>
          以 {adminName}(管理员)登录
        </Button>
      </div>
    </div>
  );
}
