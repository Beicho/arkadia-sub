"use client";

import { Button, Input, LayerCard } from "@/components/kumo";

/** 仅 DEV_FAKE_LOGIN=1 时由服务端渲染 */
export default function DevLoginPanel({ adminName }: { adminName: string }) {
  return (
    <LayerCard
      className="space-y-3 p-4 text-sm"
      style={{ borderColor: "color-mix(in srgb, var(--ark-amber) 40%, transparent)" }}
    >
      <div className="font-semibold" style={{ color: "var(--ark-amber)" }}>
        DEV 登录(仅开发环境)
      </div>
      <form
        action="/api/auth/dev-login"
        method="get"
        className="flex flex-wrap items-end gap-2"
      >
        <div className="w-44">
          <Input
            label="用户名"
            name="username"
            defaultValue={adminName}
            maxLength={60}
            required
          />
        </div>
        <div className="w-24">
          <Input
            label="信任级"
            name="trust_level"
            type="number"
            min={0}
            max={4}
            defaultValue="3"
            required
          />
        </div>
        <Button type="submit" variant="secondary" size="sm">
          模拟登录
        </Button>
      </form>
      <form action="/api/auth/dev-login" method="get">
        <input type="hidden" name="username" value={adminName} />
        <input type="hidden" name="trust_level" value="4" />
        <Button type="submit" variant="ghost" size="sm">
          以 {adminName}(管理员)登录
        </Button>
      </form>
    </LayerCard>
  );
}
