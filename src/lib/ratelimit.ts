/**
 * 进程内滑动窗口限流(单实例部署足够;多实例需换 Redis)。
 */

type Bucket = number[];

const buckets = new Map<string, Bucket>();

// 防内存膨胀:超上限直接清最旧的一半
const MAX_KEYS = 10_000;

export function rateLimit(
  key: string,
  max: number,
  windowMs: number,
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  if (buckets.size > MAX_KEYS) {
    const keys = [...buckets.keys()].slice(0, MAX_KEYS / 2);
    for (const k of keys) buckets.delete(k);
  }
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    const retryAfterSec = Math.ceil((windowMs - (now - arr[0])) / 1000);
    buckets.set(key, arr);
    return { ok: false, retryAfterSec };
  }
  arr.push(now);
  buckets.set(key, arr);
  return { ok: true, retryAfterSec: 0 };
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    return fwd.split(",")[0].trim();
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}

export function tooMany(retryAfterSec: number): Response {
  return Response.json(
    { error: "请求过于频繁,请稍后再试" },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
  );
}
