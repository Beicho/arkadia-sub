import { Banner } from "@/components/kumo";
import { GiftIcon } from "@phosphor-icons/react/dist/ssr";
import SocksPoolPanel from "@/components/admin/SocksPoolPanel";

export const dynamic = "force-dynamic";

export default function AdminSocksPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="ark-h2 ark-display text-xl font-bold">SOCKS5 / HTTP 福利池</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--ark-muted)" }}>
          导入第三方代理 → 过滤高风险节点 → 并发测速 → 原生/家宽优先 + 全类型速度优选并入今日批次。
        </p>
      </div>

      <Banner
        icon={<GiftIcon weight="fill" />}
        title="福利节点声明(已在前台同步)"
        description="SOCKS5 / HTTP 代理作为免费福利加入订阅,每天最多选取 60 个(30 个原生/家宽优先 + 30 个实测高速),不额外收取 LDC。同日已拉取的用户刷新订阅不会被扣额度。"
      />

      <SocksPoolPanel />
    </div>
  );
}
