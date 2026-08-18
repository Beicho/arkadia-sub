"use client";

import { useState } from "react";

/** 仅 DEV_FAKE_LOGIN=1 时由服务端渲染 */
export default function DevLoginPanel({ adminName }: { adminName: string }) {
  const [username, setUsername] = useState(adminName);
  const [trust, setTrust] = useState("3");

  const go = (u: string, t: string) => {
    location.href = `/api/auth/dev-login?username=${encodeURIComponent(u)}&trust_level=${t}`;
  };

  return (
    <div
      className="ark-card space-y-3 p-4 text-sm"
      style={{ borderColor: "color-mix(in srgb, var(--ark-amber) 40%, transparent)" }}
    >
      <div className="font-semibold" style={{ color: "var(--ark-amber)" }}>
        DEV 登录(仅开发环境)
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-44">
          <label className="ark-label" htmlFor="dev-user">用户名</label>
          <input
            id="dev-user"
            className="ark-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="w-24">
          <label className="ark-label" htmlFor="dev-trust">信任级</label>
          <input
            id="dev-trust"
            className="ark-input"
            type="number"
            min={0}
            max={4}
            value={trust}
            onChange={(e) => setTrust(e.target.value)}
          />
        </div>
        <button className="ark-btn ark-btn-ghost ark-btn-sm" onClick={() => go(username, trust)}>
          模拟登录
        </button>
        <button className="ark-btn ark-btn-ghost ark-btn-sm" onClick={() => go(adminName, "4")}>
          以 {adminName}(管理员)登录
        </button>
      </div>
    </div>
  );
}
