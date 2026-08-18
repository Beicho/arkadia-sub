"use client";

/** 管理端通用表格:自绘 ark-table,横向滚动适配手机 */
export default function AdminTable({
  head,
  rows,
}: {
  head: string[];
  rows: React.ReactNode[][];
}) {
  if (rows.length === 0) {
    return (
      <div className="ark-card p-6 text-center text-sm" style={{ color: "var(--ark-muted)" }}>
        暂无数据
      </div>
    );
  }
  return (
    <div className="ark-card ark-scroll-x">
      <table className="ark-table">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
