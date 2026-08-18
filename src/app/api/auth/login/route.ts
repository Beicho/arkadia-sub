import crypto from "node:crypto";
import { cookies } from "next/headers";
import { authorizeUrl, appUrl, clientId } from "@/lib/linuxdo";
import { rateLimit, clientIp, tooMany } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ip = clientIp(req);
  const rl = rateLimit(`auth:${ip}`, 10, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  if (!clientId()) {
    return Response.json(
      { error: "OAuth 未配置:请设置 LINUXDO_CLIENT_ID / LINUXDO_CLIENT_SECRET" },
      { status: 503 },
    );
  }

  const state = crypto.randomBytes(16).toString("hex");
  const store = await cookies();
  store.set("arkadia_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  return Response.redirect(authorizeUrl(state, appUrl()), 302);
}
