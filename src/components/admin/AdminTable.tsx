"use client";

import { Table } from "@cloudflare/kumo/components/table";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";

/** 管理端通用表格:Kumo Table + LayerCard,横向滚动适配手机 */
export default function AdminTable({
  head,
  rows,
}: {
  head: string[];
  rows: React.ReactNode[][];
}) {
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
