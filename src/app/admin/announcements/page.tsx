import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { announcements } from "@/db/schema";
import AnnouncementPanel from "@/components/admin/AnnouncementPanel";

export const dynamic = "force-dynamic";

export default async function AdminAnnouncementsPage() {
  const rows = await db
    .select()
    .from(announcements)
    .orderBy(desc(announcements.createdAt))
    .limit(200);

  return (
    <div className="space-y-6">
      <div>
        <h1 class="ark-h2 ark-display text-xl font-bold">公告</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--ark-muted)" }}>
          生效中的公告会以横幅显示在用户面板顶部(断更通知 / 福利上线 / 紧急信息)。
        </p>
      </div>
      <AnnouncementPanel
        rows={rows.map((r) => ({
          id: r.id,
          content: r.content,
          level: r.level,
          isActive: r.isActive,
          createdAt: new Date(r.createdAt).toLocaleString("zh-CN", {
            timeZone: "Asia/Shanghai",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }),
        }))}
      />
    </div>
  );
}
