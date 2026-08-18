import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { nodeBatches, socksPool } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import {
  isEligible,
  parseSocksLine,
  pickBest,
  socksNodeName,
} from "@/lib/socks-parse";
import { getSocksRunState, startSocksRun } from "@/lib/socks-runner";
import { shanghaiToday } from "@/lib/time";

export const dynamic = "force-dynamic";

const MAX_TEXT_BYTES = 5 * 1024 * 1024; // 5MB 上限,约 6 万行

/** 状态:运行进度 + 池概况 + 可用榜 */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "无权限" }, { status: 403 });

  const okRows = await db
    .select()
    .from(socksPool)
    .where(eq(socksPool.status, "ok"))
    .orderBy(asc(socksPool.latencyMs))
    .limit(100);

  const [activeBatch] = await db
    .select({ nodes: nodeBatches.nodes })
    .from(nodeBatches)
    .where(eq(nodeBatches.isActive, true))
    .limit(1);
  const mergedToday = ((activeBatch?.nodes as string[]) ?? []).filter((n) =>
    n.toLowerCase().startsWith("socks5://"),
  ).length;

  const allRows = await db.select({ status: socksPool.status }).from(socksPool);
  const summary = {
    total: allRows.length,
    ok: allRows.filter((r) => r.status === "ok").length,
    fail: allRows.filter((r) => r.status === "fail").length,
    untested: allRows.filter((r) => r.status === "untested").length,
  };

  return Response.json({
    run: getSocksRunState(),
    mergedToday,
    summary,
    top: okRows.map((r) => ({
      host: r.host,
      port: r.port,
      tags: r.tags,
      country: r.country,
      provider: r.provider,
      riskScore: r.riskScore,
      latencyMs: r.latencyMs,
      name: socksNodeName(rowToEntry(r)),
    })),
  });
}

type SocksRow = typeof socksPool.$inferSelect;
function rowToEntry(r: SocksRow) {
  return {
    host: r.host,
    port: r.port,
    line: r.line,
    tags: r.tags ?? [],
    nativeIp: (r.tags ?? []).includes("原生IP"),
    residential: (r.tags ?? []).includes("家宽"),
    country: r.country,
    region: r.region,
    provider: r.provider,
    riskScore: r.riskScore,
  };
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "无权限" }, { status: 403 });

  let body: { action?: string; text?: string; count?: number };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求体格式错误" }, { status: 400 });
  }

  const action = body.action ?? "";

  // ===== 导入解析 =====
  if (action === "import") {
    const text = body.text ?? "";
    if (!text.trim()) return Response.json({ error: "内容为空" }, { status: 400 });
    if (Buffer.byteLength(text, "utf8") > MAX_TEXT_BYTES) {
      return Response.json(
        { error: "内容超过 5MB 上限,请分批导入" },
        { status: 413 },
      );
    }

    const parsed: ReturnType<typeof parseSocksLine>[] = [];
    let malformed = 0;
    let filteredOut = 0;
    const seen = new Set<string>();
    const entries: NonNullable<ReturnType<typeof parseSocksLine>>[] = [];

    for (const line of text.split("\n")) {
      const e = parseSocksLine(line);
      if (!e) {
        if (line.trim()) malformed++;
        continue;
      }
      parsed.push(e);
      if (!isEligible(e)) {
        filteredOut++;
        continue;
      }
      const key = `${e.host}:${e.port}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push(e);
    }

    // 分批插入(500/批),冲突跳过
    let inserted = 0;
    for (let i = 0; i < entries.length; i += 500) {
      const chunk = entries.slice(i, i + 500);
      const res = await db
        .insert(socksPool)
        .values(
          chunk.map((e) => ({
            host: e.host,
            port: e.port,
            line: e.line,
            tags: e.tags,
            country: e.country,
            region: e.region,
            provider: e.provider,
            riskScore: e.riskScore,
            status: "untested" as const,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: socksPool.id });
      inserted += res.length;
    }

    await audit(admin.id, "socks_import", `inserted=${inserted}`, {
      totalLines: parsed.length + malformed,
      parsed: parsed.length,
      malformed,
      filteredOut,
      inserted,
    });

    return Response.json({
      ok: true,
      parsed: parsed.length,
      malformed,
      filteredOut,
      inserted,
      message: `解析 ${parsed.length} 条:入库 ${inserted}(去重/跳过已存在),过滤掉 ${filteredOut} 条(非原生/家宽或风险≥10),脏行 ${malformed}`,
    });
  }

  // ===== 开始测活 =====
  if (action === "test") {
    const started = await startSocksRun();
    if (!started) {
      return Response.json({ error: "已有测活在运行中" }, { status: 409 });
    }
    await audit(admin.id, "socks_test_start");
    return Response.json({ ok: true, message: "测活已启动(100 并发)" });
  }

  // ===== 挑选最优并入今日批次 =====
  if (action === "merge") {
    const count = Math.min(Math.max(body.count ?? 30, 1), 50);
    const force = body.force === true;

    const okRows = await db
      .select()
      .from(socksPool)
      .where(and(eq(socksPool.status, "ok")))
      .orderBy(asc(socksPool.latencyMs))
      .limit(2000);

    if (okRows.length === 0) {
      return Response.json(
        { error: "没有可用代理,先执行测活" },
        { status: 422 },
      );
    }

    // 当前激活批次中已有的 SOCKS host:port(防手滑重复并入)
    const [activeBatch] = await db
      .select()
      .from(nodeBatches)
      .where(eq(nodeBatches.isActive, true))
      .orderBy(desc(nodeBatches.createdAt))
      .limit(1);
    const existingSet = new Set<string>(
      ((activeBatch?.nodes as string[]) ?? [])
        .filter((n) => n.toLowerCase().startsWith("socks5://"))
        .map((n) => {
          try {
            const u = new URL(n);
            return `${u.hostname}:${u.port}`;
          } catch {
            return n;
          }
        }),
    );
    if (existingSet.size > 0 && !force) {
      return Response.json(
        {
          error: `今日批次已包含 ${existingSet.size} 个 SOCKS5 福利节点。确认要再追加吗?(重复的会自动跳过)`,
          needForce: true,
        },
        { status: 422 },
      );
    }

    const best = pickBest(
      okRows.map((r) => ({ entry: rowToEntry(r), latencyMs: r.latencyMs ?? 9999 })),
      count + existingSet.size, // 多选一些,去重后仍够数
    ).filter((b) => !existingSet.has(`${b.entry.host}:${b.entry.port}`))
     .slice(0, count);
    if (best.length === 0) {
      return Response.json(
        { error: "候选已全部在今日批次中,无需重复并入" },
        { status: 422 },
      );
    }

    // 当前激活批次(没有则从空开始)
    const [current] = await db
      .select()
      .from(nodeBatches)
      .where(eq(nodeBatches.isActive, true))
      .orderBy(desc(nodeBatches.createdAt))
      .limit(1);

    const socksUris = best.map(
      (b) => `socks5://${b.entry.host}:${b.entry.port}#${encodeURIComponent(socksNodeName(b.entry))}`,
    );
    const mergedNodes = [
      ...((current?.nodes as string[]) ?? []),
      ...socksUris,
    ];

    const batchDate = current?.batchDate ?? shanghaiToday();
    const title = current
      ? `${current.title} + SOCKS5 福利 ×${best.length}`
      : `SOCKS5 福利批次 ${batchDate}`;

    const [created] = await db
      .insert(nodeBatches)
      .values({
        title,
        nodes: mergedNodes,
        batchDate,
        nodeCount: mergedNodes.length,
        isActive: false,
        createdBy: admin.id,
      })
      .returning({ id: nodeBatches.id });

    // 事务切换激活;同 batchDate 保证用户同日刷新不重复扣额度
    await db.transaction(async (tx) => {
      await tx
        .update(nodeBatches)
        .set({ isActive: false })
        .where(eq(nodeBatches.isActive, true));
      await tx
        .update(nodeBatches)
        .set({ isActive: true })
        .where(eq(nodeBatches.id, created.id));
    });

    await audit(admin.id, "socks_merge_batch", `batch:${created.id}`, {
      added: best.length,
      totalNodes: mergedNodes.length,
      batchDate,
    });

    return Response.json({
      ok: true,
      batchId: created.id,
      batchDate,
      totalNodes: mergedNodes.length,
      added: best.map((b) => socksNodeName(b.entry)),
      message: `已并入 ${best.length} 个 SOCKS5(批次共 ${mergedNodes.length} 节点,日期 ${batchDate};同日已拉过的用户刷新不扣额度)`,
    });
  }

  return Response.json({ error: "未知 action" }, { status: 400 });
}
