"use client";

import { LayerCard } from "@/components/kumo";

export default function StatCards({
  items,
}: {
  items: { label: string; value: string; tone?: "accent" | "green" | "red" | "amber" }[];
}) {
  const color = (tone?: string) =>
    tone === "accent"
      ? "var(--ark-accent)"
      : tone === "green"
        ? "var(--ark-green)"
        : tone === "red"
          ? "var(--ark-red)"
          : tone === "amber"
            ? "var(--ark-amber)"
            : "inherit";

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {items.map((item) => (
        <LayerCard key={item.label} className="ark-card-lift p-4">
          <div className="text-xs" style={{ color: "var(--ark-muted)" }}>
            {item.label}
          </div>
          <div className="ark-display ark-num mt-1.5 text-xl font-bold" style={{ color: color(item.tone) }}>
            {item.value}
          </div>
        </LayerCard>
      ))}
    </div>
  );
}
