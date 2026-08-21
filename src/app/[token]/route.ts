import { and, desc, eq, gt, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { nodeBatches, subPulls, users } from "@/db/schema";
import { buildClashYaml } from "@/lib/clash";
import { buildSingboxConfig } from "@/lib/singbox";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { getSettings } from "@/lib/settings";
import {
  buildRawContent,
  buildSubscriptionPayload,
} from "@/lib/nodes";

/** 订阅标题:客户端列表里显示"这是几号的节点"(profile-title: base64: 协议) */
function profileTitle(batchDate: string): string {
  return Buffer.from(`Arkadia ${batchDate} 节点`, "utf8").toString("base64");
}

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

  const url = new URL(req.url);

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

  const freeUntil =
    user.paidUntil && user.paidUntil.getTime() > Date.now() ? user.paidUntil : null;

  const [activeBatch] = await db
    .select()
    .from(nodeBatches)
    .where(eq(nodeBatches.isActive, true))
    .orderBy(desc(nodeBatches.createdAt))
    .limit(1);
  if (!activeBatch || activeBatch.nodes.length === 0) {
    return textResponse("今日节点尚未更新,请稍后再来", 503);
  }

  // 批次锁定(先于一切计费判定):用户锁定了已付费的批次,站长更新不扣费。
  // 若配置了 batchLockedUntil,且当前时间已过该截止时间,则自动解除锁定。
  let isLocked = user.batchLocked;
  if (isLocked && user.batchLockedUntil && user.batchLockedUntil.getTime() <= Date.now()) {
    isLocked = false;
    // 异步更新数据库解除锁定状态
    db.update(users)
      .set({ batchLocked: false, batchLockedUntil: null })
      .where(eq(users.id, user.id))
      .catch(() => undefined);
  }

  // 下发用户已拉取的那一批,跳过额度判定与扣减;解锁后恢复正常。
  let batch = activeBatch;
  let lockedMode = false;
  if (
    isLocked &&
    user.lastPulledBatchId &&
    activeBatch.id !== user.lastPulledBatchId
  ) {
    const [locked] = await db
      .select()
      .from(nodeBatches)
      .where(eq(nodeBatches.id, user.lastPulledBatchId))
      .limit(1);
    if (locked && locked.nodes.length > 0) {
      batch = locked;
      lockedMode = true;
    }
    // 锁定批次不存在(理论上不删):回落正常逻辑
  }

  // 额度判定:仅非锁定模式。锁定模式批次已付费,无论额度状态都放行。
  if (!lockedMode && !freeUntil && user.updateCredits <= 0) {
    return textResponse(
      "免费更新期已结束且没有更新额度:请到 arkadia.work 登录后购买更新额度",
      402,
    );
  }

  let nodes = batch.nodes as string[];

  // 节点关键字/国家正则筛选: ?filter=HK|JP 或 ?exclude=US
  const filterQuery = url.searchParams.get("filter") || url.searchParams.get("include");
  const excludeQuery = url.searchParams.get("exclude");
  if (filterQuery) {
    try {
      const reg = new RegExp(filterQuery, "i");
      const filtered = nodes.filter((n) => reg.test(n));
      if (filtered.length > 0) nodes = filtered;
    } catch {
      // 非法正则忽略
    }
  }
  if (excludeQuery) {
    try {
      const reg = new RegExp(excludeQuery, "i");
      const filtered = nodes.filter((n) => !reg.test(n));
      if (filtered.length > 0) nodes = filtered;
    } catch {
      // 非法正则忽略
    }
  }

  const userinfo = `upload=0; download=0; total=0; expire=${Math.floor(
    (freeUntil ?? new Date(Date.now() + 30 * 86_400_000)).getTime() / 1000,
  )}`;

  // 额度模式:拉到"新日期"的批次才扣 1 额度。
  // 日期守卫放进原子 UPDATE 的 WHERE(OR isNull / NE),杜绝并发双拉双扣;
  // 同一 batchDate 内站长补传/福利加量(如 SOCKS5),用户刷新不重复扣。
  const dateChanged = user.lastPulledBatchDate !== batch.batchDate;
  if (lockedMode) {
    // 锁定模式:批次已付费,不扣额度
  } else if (!freeUntil) {
    if (dateChanged) {
      const consumed = await db
        .update(users)
        .set({
          updateCredits: sql`${users.updateCredits} - 1`,
          lastPulledBatchId: batch.id,
          lastPulledBatchDate: batch.batchDate,
        })
        .where(
          and(
            eq(users.id, user.id),
            gt(users.updateCredits, 0),
            or(
              isNull(users.lastPulledBatchDate),
              ne(users.lastPulledBatchDate, batch.batchDate),
            ),
          ),
        )
        .returning({ id: users.id });
      if (consumed.length === 0) {
        // 没扣到:并发孪生请求已扣过(直接放行)或真没额度(回读确认)
        const [fresh] = await db
          .select({ credits: users.updateCredits, lastDate: users.lastPulledBatchDate })
          .from(users)
          .where(eq(users.id, user.id))
          .limit(1);
        if (!fresh || fresh.lastDate !== batch.batchDate) {
          return textResponse(
            "免费更新期已结束且没有更新额度:请到 arkadia.work 登录后购买更新额度",
            402,
          );
        }
      }
    } else if (batch.id !== user.lastPulledBatchId) {
      await db
        .update(users)
        .set({ lastPulledBatchId: batch.id })
        .where(eq(users.id, user.id));
    }
  } else if (batch.id !== user.lastPulledBatchId) {
    // 免费期内:同步标记,避免期后转额度模式重复扣
    await db
      .update(users)
      .set({ lastPulledBatchId: batch.id, lastPulledBatchDate: batch.batchDate })
      .where(eq(users.id, user.id));
  }

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

  const title = profileTitle(batch.batchDate);
  const ua = (req.headers.get("user-agent") ?? "").toLowerCase();
  // 分流模式:站长可在后台一键切回全量代理
  const { routing_mode: routingMode } = await getSettings();

  // 格式协商:?target= 显式指定;否则按 User-Agent:Clash 系 → YAML,
  // 其余(v2rayN/v2rayNG/Shadowrocket 等)→ base64 节点列表
  const target = url.searchParams.get("target");
  const wantsClash =
    target === "clash" ||
    (target !== "v2ray" &&
      target !== "singbox" &&
      /clash|mihomo|flclash|stash|clashverge|clash-verge|clashmeta/.test(ua));
  const wantsSingbox =
    target === "singbox" ||
    (target !== "v2ray" &&
      target !== "clash" &&
      /sing-box|singbox|sfi|sfa|sfm|hiddify/.test(ua));

  if (wantsSingbox) {
    const json = buildSingboxConfig(nodes, undefined, routingMode);
    if (json) {
      return new Response(json, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="Arkadia_${batch.batchDate}.json"`,
          "Cache-Control": "no-store",
          "Subscription-Userinfo": userinfo,
          "Profile-Update-Interval": "24",
          "Profile-Title": `base64:${title}`,
        },
      });
    }
    // 全都转不了 → 退回 clash/base64
  }

  if (wantsClash) {
    const yaml = buildClashYaml(nodes, undefined, routingMode);
    if (yaml) {
      return new Response(yaml, {
        headers: {
          "Content-Type": "text/yaml; charset=utf-8",
          // FlClash 等客户端用该文件名作为订阅名称
          "Content-Disposition": `attachment; filename="Arkadia_${batch.batchDate}.yaml"`,
          "Cache-Control": "no-store",
          "Subscription-Userinfo": userinfo,
          "Profile-Update-Interval": "24",
          "Profile-Title": `base64:${title}`,
        },
      });
    }
    // 全都转不了 → 退回 base64 列表
  }

  if (url.searchParams.get("raw") === "1") {
    const content = buildRawContent(nodes);
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

  const payload = buildSubscriptionPayload(nodes);
  return new Response(payload, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="Arkadia_${batch.batchDate}.txt"`,
      "Cache-Control": "no-store",
      "Subscription-Userinfo": userinfo,
      "Profile-Update-Interval": "24",
      "Profile-Title": `base64:${title}`,
    },
  });
}
