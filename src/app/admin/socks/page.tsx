import { Banner } from "@/components/kumo";
import { GiftIcon } from "@phosphor-icons/react/dist/ssr";
import SocksPoolPanel from "@/components/admin/SocksPoolPanel";

export const dynamic = "force-dynamic";

export default function AdminSocksPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="ark-h2 ark-display text-xl font-bold">SOCKS5 福利池</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--ark-muted)" }}>
          导入第三方 SOCKS5 → 过滤(原生/家宽,风险&lt;10)→ 并发测活 → 挑最优并入今日批次。
        </p>
      </div>

      <Banner
        icon={<GiftIcon weight="fill" />}
        title="福利节点声明(已在前台同步)"
        description="SOCKS5 作为免费福利不定期加入订阅(如封锁严重时作备用),不额外收取 LDC,可用性不作保证。同日已拉取的用户刷新订阅不会被扣额度。"
      />

      <SocksPoolPanel />
    </div>
  );
}
