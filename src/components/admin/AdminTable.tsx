"use client";

import { LayerCard, Table } from "@/components/kumo";

/** 管理端通用表格:Kumo Table + LayerCard,横向滚动适配手机 */
export default function AdminTable({
  head,
  rows,
}: {
  head: string[];
  rows: React.ReactNode[][];
}) {
  if (rows.length === 0) {
    return (
      <LayerCard className="p-6 text-center text-sm" style={{ color: "var(--ark-muted)" }}>
        暂无数据
      </LayerCard>
    );
  }
  return (
    <LayerCard className="w-full overflow-x-auto p-0">
      <Table>
        <Table.Header>
          <Table.Row>
            {head.map((h) => (
              <Table.Head key={h}>{h}</Table.Head>
            ))}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((row, i) => (
            <Table.Row key={i}>
              {row.map((cell, j) => (
                <Table.Cell key={j}>{cell}</Table.Cell>
              ))}
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </LayerCard>
  );
}
