"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
};

const NUM_FIELDS: { key: keyof SettingsValues; label: string; hint: string }[] = [
  { key: "activation_price", label: "注册码价格(LDC)", hint: "游客购买注册码的价格" },
  { key: "activation_days", label: "注册码赠送免费更新天数", hint: "兑换后 N 天内更新免费" },
  { key: "price_per_update", label: "更新额度单价(LDC/次)", hint: "免费期后每次更新的价格" },
  { key: "trust_level_min", label: "最低信任等级", hint: "0-4;低于该值不能登录购买" },
  { key: "expected_node_count", label: "期望节点数/批", hint: "上传批次数量校验" },
  { key: "max_credits_per_order", label: "单笔最大额度数", hint: "一次最多买多少个更新额度" },
  { key: "auto_ban_fp_threshold", label: "指纹自动封禁阈值", hint: "同设备账号数达到该值自动封禁" },
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
      await apiPost(
        "/api/admin/settings",
        { ...values, admin_usernames: adminList },
        "PUT",
      );
      setMsg("已保存");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ark-card space-y-5 p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {NUM_FIELDS.map((f) => (
          <div key={f.key}>
            <label className="ark-label" htmlFor={`set-${f.key}`}>
              {f.label}
              <span className="ml-1 text-xs" style={{ color: "var(--ark-muted)", opacity: 0.7 }}>
                ({f.hint})
              </span>
            </label>
            <input
              id={`set-${f.key}`}
              className="ark-input ark-mono"
              type="number"
              value={String(values[f.key])}
              onChange={(e) =>
                setValues((v) => ({ ...v, [f.key]: Number(e.target.value) }))
              }
            />
          </div>
        ))}
      </div>
      <div>
        <label className="ark-label" htmlFor="set-admins">管理员 LinuxDo 用户名(逗号分隔)</label>
        <input
          id="set-admins"
          className="ark-input"
          value={admins}
          onChange={(e) => setAdmins(e.target.value)}
        />
      </div>
      {err ? <div className="text-sm" style={{ color: "var(--ark-red)" }}>{err}</div> : null}
      {msg ? <div className="text-sm" style={{ color: "var(--ark-green)" }}>{msg}</div> : null}
      <button className="ark-btn ark-btn-primary" disabled={loading} onClick={save}>
        {loading ? "保存中…" : "保存设置"}
      </button>
    </div>
  );
}
