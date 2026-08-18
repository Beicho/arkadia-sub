"use client";

import { useState } from "react";
import { Button } from "@/components/kumo";
import { CopyIcon, CheckIcon } from "@phosphor-icons/react";

export default function CopyField({
  value,
  label,
  mono = true,
}: {
  value: string;
  label?: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="w-full">
      {label ? <div className="ark-label">{label}</div> : null}
      <div
        className="flex items-center gap-2 rounded-xl p-2 pl-3"
        style={{ background: "var(--ark-bg)", border: "1px solid var(--ark-border-strong)" }}
      >
        <code
          className={`min-w-0 flex-1 truncate text-sm ${mono ? "ark-mono" : ""}`}
          title={value}
        >
          {value}
        </code>
        <Button
          variant="secondary"
          size="sm"
          icon={copied ? CheckIcon : CopyIcon}
          onClick={copy}
          aria-label="复制"
        >
          {copied ? "已复制" : "复制"}
        </Button>
      </div>
    </div>
  );
}
