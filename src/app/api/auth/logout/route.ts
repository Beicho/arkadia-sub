import { clearSessionCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  await clearSessionCookie();
  return Response.redirect(new URL("/", process.env.APP_URL ?? "http://localhost:3000"), 302);
}

export async function POST() {
  await clearSessionCookie();
  return Response.json({ ok: true });
}
