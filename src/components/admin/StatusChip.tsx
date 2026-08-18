/** 状态小标签(server/client 通用,无依赖) */
export default function StatusChip({
  tone = "neutral",
  children,
}: {
  tone?: "green" | "red" | "amber" | "accent" | "neutral";
  children: React.ReactNode;
}) {
  const cls =
    tone === "green"
      ? "ark-chip ark-chip-green"
      : tone === "red"
        ? "ark-chip ark-chip-red"
        : tone === "amber"
          ? "ark-chip ark-chip-amber"
          : tone === "accent"
            ? "ark-chip ark-chip-accent"
            : "ark-chip";
  return <span className={cls}>{children}</span>;
}
