import type { Metadata } from "next";
import { Toasty } from "@cloudflare/kumo";
import "./app.css";

export const metadata: Metadata = {
  title: "Arkadia — 每日节点订阅",
  description:
    "Arkadia.work 每日节点订阅:站长每日实测节点,LDC 支付,按日订阅。",
};

const themeScript = `(function(){try{var m=window.matchMedia("(prefers-color-scheme: dark)");var s=localStorage.getItem("theme");var t=["light","dark","system"].includes(s)?s:"system";var r=t==="system"?(m.matches?"dark":"light"):t;document.documentElement.setAttribute("data-mode",r);}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh bg-neutral-50 text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        <Toasty>{children}</Toasty>
      </body>
    </html>
  );
}
