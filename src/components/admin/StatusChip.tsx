"use client";

import { Badge } from "@/components/kumo";

/** 状态小标签:Kumo Badge 包装,全后台统一语义色 */
const TONE_VARIANT = {
  green: "success",
  red: "error",
  amber: "warning",
  accent: "info",
  neutral: "secondary",
} as const;

export default function StatusChip({
  tone = "neutral",
  children,
}: {
  tone?: keyof typeof TONE_VARIANT;
  children: React.ReactNode;
}) {
  return <Badge variant={TONE_VARIANT[tone]}>{children}</Badge>;
}
