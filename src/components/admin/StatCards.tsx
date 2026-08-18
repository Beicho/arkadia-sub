export default function StatCards({
  items,
}: {
  items: { label: string; value: string; hint?: string }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-700"
        >
          <div className="text-xs text-neutral-500">{item.label}</div>
          <div className="mt-1 text-xl font-bold">{item.value}</div>
          {item.hint ? (
            <div className="mt-0.5 text-xs text-neutral-400">{item.hint}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
