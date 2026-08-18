"use client";

import { useEffect } from "react";

/**
 * 登录后静默上报设备指纹(canvas/WebGL/屏幕/时区/语言等),
 * 用于一人多号识别。每会话只报一次。
 */
export default function Fingerprint() {
  useEffect(() => {
    if (sessionStorage.getItem("ark_fp_sent") === "1") return;
    let cancelled = false;

    (async () => {
      try {
        const fp = await computeFingerprint();
        if (cancelled) return;
        const res = await fetch("/api/fingerprint", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fp }),
        });
        if (res.ok || res.status === 403) {
          sessionStorage.setItem("ark_fp_sent", "1");
        }
        if (res.status === 403 && !cancelled) {
          // 被风控自动封禁:提示并送回首页
          alert("检测到同设备多账号,该账号已被自动封禁。如有疑问请联系站长。");
          location.href = "/denied?reason=banned";
        }
      } catch {
        // 静默失败,不影响使用
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}

async function computeFingerprint(): Promise<string> {
  const parts: string[] = [
    navigator.userAgent,
    navigator.language,
    navigator.languages.join(","),
    String(screen.width) + "x" + String(screen.height) + "x" + String(screen.colorDepth),
    String(new Date().getTimezoneOffset()),
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
    String(navigator.hardwareConcurrency ?? 0),
    String((navigator as { deviceMemory?: number }).deviceMemory ?? 0),
    String(navigator.maxTouchPoints ?? 0),
  ];

  // canvas 指纹
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 220;
    canvas.height = 40;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.textBaseline = "top";
      ctx.font = "14px 'Arial'";
      ctx.fillStyle = "#f60";
      ctx.fillRect(0, 0, 110, 20);
      ctx.fillStyle = "#069";
      ctx.fillText("Arkadia,fp", 2, 2);
      ctx.fillStyle = "rgba(102,204,0,0.7)";
      ctx.fillText("Arkadia,fp", 4, 18);
      parts.push(canvas.toDataURL().slice(-128));
    }
  } catch {
    parts.push("no-canvas");
  }

  // WebGL 渲染器
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    if (gl) {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      if (ext) {
        parts.push(String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)));
        parts.push(String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)));
      }
    }
  } catch {
    parts.push("no-webgl");
  }

  const raw = parts.join("|");
  return fnv1a128(raw);
}

/** FNV-1a 32bit × 4 轮 → 128bit hex(无 crypto.subtle 依赖) */
function fnv1a128(input: string): string {
  const out: string[] = [];
  for (let round = 0; round < 4; round++) {
    let h = 0x811c9dc5 ^ (round * 0x9e3779b9);
    const start = round * 7;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt((i + start) % input.length);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    out.push(h.toString(16).padStart(8, "0"));
  }
  return out.join("");
}
