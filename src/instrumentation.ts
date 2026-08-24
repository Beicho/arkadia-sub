export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { runRuntimeMigrations } = await import("@/db/runtime-migrations");
  await runRuntimeMigrations();
  const { startBackgroundJobs } = await import("@/lib/cron");
  startBackgroundJobs();
}
