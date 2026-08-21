"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, LayerCard, Switch } from "@/components/kumo";
import type { RoutingMode } from "@/lib/rules";
import { apiPost } from "@/components/api";

export type SettingsValues = {
  activation_price: number;
  activation_days: number;
  price_per_update: number;
  trust_level_min: number;
  expected_node_count: number;
  max_credits_per_order: number;
  admin_usernames: string[];
  auto_ban_fp_threshold: number;
  routing_mode: RoutingMode;
};

const NUM_FIELDS: { key: keyof SettingsValues; label: string; hint: string }[] = [
  { key: "activation_price", label: "注册码价格(LDC)", hint: "游客购买注册码的价格" },
  { key: "activation_days", label: "注册码赠送免费更新天数", hint: "兑换后 N 天内更新免费" },
  { key: "price_per_update", label: "更新额度单价(LDC/次)", hint: "免费期后每次更新的价格" },
  { key: "trust_level_min", label: "最低信任等级", hint: "0-4;低于该值不能登录购买" },
  { key: "expected_node_count", label: "期望节点数/批", hint: "上传批次数量校验" },
  { key: "max_credits_per_order", label: "单笔最大额度数", hint: "一次最多买多少个更新额度" },
  { key: "auto_ban_fp_threshold", label: "同浏览器自动封禁阈值", hint: "同设备 ID 账号数达到该值自动封禁" },
];

export default function SettingsForm({ initial }: { initial: SettingsValues }) {
  const router = useRouter();
  const [values, setValues] = useState<SettingsValues>(initial);
  const [admins, setAdmins] = useState(initial.admin_usernames.join(", "));
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setLoading(true);
    setMsg(null);
    setErr(null);
    const adminList = admins
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (adminList.length === 0) {
      setErr("管理员名单不能为空(否则没人能进后台)");
      setLoading(false);
      return;
    }
    try {
      await apiPost("/api/admin/settings", { ...values, admin_usernames: adminList }, "PUT");
      setMsg("已保存");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <LayerCard className="space-y-5 p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {NUM_FIELDS.map((f) => (
          <Input
            key={f.key}
            label={`${f.label}(${f.hint})`}
            type="number"
            value={String(values[f.key])}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setValues((v) => ({ ...v, [f.key]: Number(e.target.value) }))
            }
          />
        ))}
      </div>
      <div className="flex items-start gap-3">
        <Switch
          checked={values.routing_mode === "rules"}
          onCheckedChange={(on: boolean) =>
            setValues((v) => ({ ...v, routing_mode: on ? "rules" : "global" }))
          }
          variant="neutral"
        />
        <div className="space-y-1">
          <div className="text-sm font-medium">订阅分流规则</div>
          <div className="text-xs text-neutral-400">
            开启后下发的 Clash / sing-box 配置带国内直连、广告拦截、流媒体与电报分组;
            关闭则全量走代理(旧行为)。分流出问题时可一键回退。
          </div>
        </div>
      </div>
      <Input
        label="管理员 LinuxDo 用户名(逗号分隔)"
        value={admins}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAdmins(e.target.value)}
      />
      {err ? <div className="text-sm" style={{ color: "var(--ark-red)" }}>{err}</div> : null}
      {msg ? <div className="text-sm" style={{ color: "var(--ark-green)" }}>{msg}</div> : null}
      <Button variant="primary" loading={loading} onClick={save}>
        保存设置
      </Button>
    </LayerCard>
  );
}
