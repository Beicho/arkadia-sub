"use client";

import { useState } from "react";
import { Button } from "@cloudflare/kumo/components/button";
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
      // 退化方案
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
      {label ? (
        <div className="mb-1 text-sm text-neutral-500 dark:text-neutral-400">{label}</div>
      ) : null}
      <div className="flex items-center gap-2">
        <code
          className={`min-w-0 flex-1 rounded-md border border-neutral-200 bg-neutral-100 px-3 py-2 text-sm break-anywhere dark:border-neutral-700 dark:bg-neutral-900 ${
            mono ? "font-mono" : ""
          }`}
        >
          {value}
        </code>
        <Button variant="secondary" shape="square" onClick={copy} aria-label="复制">
          {copied ? <CheckIcon /> : <CopyIcon />}
        </Button>
      </div>
    </div>
  );
}
