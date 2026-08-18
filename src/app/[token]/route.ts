import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { nodeBatches, subPulls, users } from "@/db/schema";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import {
  buildRawContent,
  buildSubscriptionPayload,
} from "@/lib/nodes";

export const dynamic = "force-dynamic";

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function textResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Profile-Update-Interval": "24",
    },
  });
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;

  if (!TOKEN_RE.test(token)) {
    return textResponse("无效的订阅链接", 404);
  }

  // 突发限流:仅防脚本滥用,不设每日额度
  const ip = clientIp(req);
  const rl = rateLimit(`sub:${ip}`, 30, 60_000);
  if (!rl.ok) {
    return textResponse("请求过于频繁,请稍后再试", 429);
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.subToken, token))
    .limit(1);
  if (!user) return textResponse("无效的订阅链接", 404);
  if (user.status === "banned") {
    return textResponse("该订阅已被封禁,如有疑问请联系站长", 403);
  }
  if (!user.activated) {
    return textResponse("请先兑换注册码激活账号后拉取订阅(arkadia.work)", 403);
  }
  if (!user.paidUntil || user.paidUntil.getTime() <= Date.now()) {
    return textResponse(
      "订阅已过期:请到 arkadia.work 登录后续费(10 LDC/天)",
      402,
    );
  }

  const [batch] = await db
    .select()
    .from(nodeBatches)
    .where(eq(nodeBatches.isActive, true))
    .orderBy(desc(nodeBatches.createdAt))
    .limit(1);
  if (!batch || batch.nodes.length === 0) {
    return textResponse("今日节点尚未更新,请稍后再来", 503);
  }

  const nodes = batch.nodes as string[];
  const remainingSec = Math.max(
    0,
    Math.floor((user.paidUntil.getTime() - Date.now()) / 1000),
  );
  const userinfo = `upload=0; download=0; total=0; expire=${Math.floor(
    user.paidUntil.getTime() / 1000,
  )}`;

  // 风控统计
  try {
    await db.insert(subPulls).values({
      userId: user.id,
      batchId: batch.id,
      ip,
      ua: req.headers.get("user-agent")?.slice(0, 300) ?? null,
    });
  } catch {
    // 统计失败不影响下发
  }

  const url = new URL(req.url);
  if (url.searchParams.get("raw") === "1") {
    const content = buildRawContent(nodes, batch.batchDate);
    const filename = `arkadia-${batch.batchDate}.txt`;
    return new Response(content, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "Subscription-Userinfo": userinfo,
      },
    });
  }

  const payload = buildSubscriptionPayload(nodes, batch.batchDate);
  void remainingSec;
  return new Response(payload, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Subscription-Userinfo": userinfo,
      "Profile-Update-Interval": "24",
    },
  });
}
