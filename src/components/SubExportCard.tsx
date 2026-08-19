"use client";

import { useState } from "react";
import { Button, LayerCard } from "@/components/kumo";
import {
  QrCodeIcon,
  LightningIcon,
  DownloadSimpleIcon,
  CheckIcon,
  CopyIcon,
  DeviceMobileIcon,
  DesktopIcon,
} from "@phosphor-icons/react";
import ResetTokenButton from "@/components/ResetTokenButton";

export default function SubExportCard({
  subUrl,
  subToken,
}: {
  subUrl: string;
  subToken: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);

  // 一键导入 URL schemes
  const clashUrl = `clash://install-config?url=${encodeURIComponent(subUrl + "?target=clash")}&name=${encodeURIComponent("Arkadia")}`;
  const singboxUrl = `sing-box://import-remote-profile?url=${encodeURIComponent(subUrl + "?target=singbox")}#${encodeURIComponent("Arkadia")}`;
  const shadowrocketUrl = `shadowrocket://add/sub://${btoa(subUrl)}?title=${encodeURIComponent("Arkadia")}`;
  const stashUrl = `stash://install-config?url=${encodeURIComponent(subUrl + "?target=clash")}&name=${encodeURIComponent("Arkadia")}`;

  const copyText = async (text: string, tag: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(tag);
    setTimeout(() => setCopied(null), 1500);
  };

  // Google Chart API / QR Server 兼容二维码
  const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(subUrl)}&margin=10`;

  return (
    <LayerCard className="ark-card-lift flex flex-col p-6">
      <div className="flex items-center justify-between">
        <div className="ark-label">订阅链接 (仅自己可见,勿分享)</div>
        <button
          type="button"
          onClick={() => setShowQr((v) => !v)}
          className="flex items-center gap-1 text-xs cursor-pointer no-underline transition-colors hover:opacity-80"
          style={{ color: "var(--ark-accent)" }}
        >
          <QrCodeIcon size={15} />
          {showQr ? "收起二维码" : "扫码导入"}
        </button>
      </div>

      {/* 订阅主链接框 */}
      <div
        className="mt-2 flex items-center gap-2 rounded-xl p-2 pl-3"
        style={{ background: "var(--ark-bg)", border: "1px solid var(--ark-border-strong)" }}
      >
        <code className="ark-mono min-w-0 flex-1 truncate text-sm" title={subUrl}>
          {subUrl}
        </code>
        <Button
          variant="secondary"
          size="sm"
          icon={copied === "main" ? CheckIcon : CopyIcon}
          onClick={() => copyText(subUrl, "main")}
        >
          {copied === "main" ? "已复制" : "复制"}
        </Button>
      </div>

      {/* 二维码抽屉展示 */}
      {showQr ? (
        <div
          className="mt-4 flex flex-col items-center justify-center rounded-xl p-4 text-center animate-in fade-in duration-200"
          style={{ background: "var(--ark-surface-2)", border: "1px solid var(--ark-border)" }}
        >
          <div className="rounded-lg bg-white p-2 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrImgUrl}
              alt="Arkadia 订阅二维码"
              width={180}
              height={180}
              className="h-[180px] w-[180px]"
            />
          </div>
          <div className="mt-2.5 text-xs" style={{ color: "var(--ark-muted)" }}>
            使用手机客户端（Shadowrocket / v2rayNG / Sing-box / FlClash 等）扫码直接导入
          </div>
        </div>
      ) : null}

      {/* 一键导入按钮群 */}
      <div className="mt-4">
        <div className="mb-2 text-xs font-semibold" style={{ color: "var(--ark-muted)" }}>
          一键导入支持客户端:
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <a
            href={clashUrl}
            className="flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium no-underline transition-all hover:border-[var(--ark-accent)]"
            style={{
              background: "var(--ark-surface-2)",
              borderColor: "var(--ark-border)",
              color: "var(--ark-text)",
            }}
          >
            <DesktopIcon size={14} style={{ color: "var(--ark-accent)" }} />
            Clash / Verge
          </a>
          <a
            href={singboxUrl}
            className="flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium no-underline transition-all hover:border-[var(--ark-accent)]"
            style={{
              background: "var(--ark-surface-2)",
              borderColor: "var(--ark-border)",
              color: "var(--ark-text)",
            }}
          >
            <LightningIcon size={14} style={{ color: "var(--ark-accent)" }} />
            Sing-box
          </a>
          <a
            href={shadowrocketUrl}
            className="flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium no-underline transition-all hover:border-[var(--ark-accent)]"
            style={{
              background: "var(--ark-surface-2)",
              borderColor: "var(--ark-border)",
              color: "var(--ark-text)",
            }}
          >
            <DeviceMobileIcon size={14} style={{ color: "var(--ark-accent)" }} />
            Shadowrocket
          </a>
          <a
            href={stashUrl}
            className="flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium no-underline transition-all hover:border-[var(--ark-accent)]"
            style={{
              background: "var(--ark-surface-2)",
              borderColor: "var(--ark-border)",
              color: "var(--ark-text)",
            }}
          >
            <LightningIcon size={14} style={{ color: "var(--ark-accent)" }} />
            Stash
          </a>
        </div>
      </div>

      {/* 底部操作与说明 */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: "var(--ark-border)" }}>
        <a
          href={`/${subToken}?raw=1`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium no-underline transition-colors"
          style={{
            background: "var(--ark-surface-2)",
            borderColor: "var(--ark-border)",
            color: "var(--ark-text)",
          }}
        >
          <DownloadSimpleIcon size={14} />
          下载明文配置 (.txt)
        </a>
        <ResetTokenButton />
      </div>

      <div
        className="mt-4 space-y-1.5 rounded-xl p-3 text-xs leading-relaxed"
        style={{ background: "var(--ark-surface-2)", color: "var(--ark-muted)" }}
      >
        <div className="font-semibold" style={{ color: "var(--ark-text)" }}>
          使用小提示:
        </div>
        <div>1. 推荐直接点击上方「一键导入」，或复制链接在客户端中手动粘贴订阅。</div>
        <div>2. 链接已自适应 Clash/Mihomo/Sing-box/v2rayN/Shadowrocket 多种客户端协议。</div>
        <div>3. 如需按国家/地区过滤，可在订阅 URL 后附加参数（如 <code>?filter=HK|JP</code>）。</div>
      </div>
    </LayerCard>
  );
}
