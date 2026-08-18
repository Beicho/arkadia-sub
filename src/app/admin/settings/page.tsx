import SettingsForm from "@/components/admin/SettingsForm";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const s = await getSettings();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">设置</h1>
      <SettingsForm
        initial={{
          activation_price: s.activation_price,
          activation_days: s.activation_days,
          price_per_day: s.price_per_day,
          trust_level_min: s.trust_level_min,
          expected_node_count: s.expected_node_count,
          max_days_per_order: s.max_days_per_order,
          admin_usernames: s.admin_usernames,
          auto_ban_fp_threshold: s.auto_ban_fp_threshold,
        }}
      />
      <p className="text-xs text-neutral-400">
        注册码库存请到"注册码/库存"页调整;所有修改都会记入审计日志。
      </p>
    </div>
  );
}
