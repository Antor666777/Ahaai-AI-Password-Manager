export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { bootstrapDevDatabase } = await import("@/lib/db/dev-client");
  await bootstrapDevDatabase();
}
