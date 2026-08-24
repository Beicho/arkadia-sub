import { sql } from "drizzle-orm";
import { db } from "@/db/client";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ status: "ok" }, { headers });
  } catch (error) {
    console.error("[health] database check failed", error);
    return Response.json(
      { status: "unhealthy" },
      { status: 503, headers },
    );
  }
}
