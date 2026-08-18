import type { Metadata } from "next";
import { Sora, JetBrains_Mono } from "next/font/google";
import { Toasty } from "@/components/kumo";
import "./app.css";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
});

const jbmono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jbmono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Arkadia — 每日节点订阅",
  description:
    "Arkadia.work 每日实测节点订阅:LinuxDo OAuth 登录,LDC 支付,注册码激活,更新额度制。",
};

const themeScript = `(function(){try{var m=window.matchMedia("(prefers-color-scheme: dark)");var s=localStorage.getItem("theme");var t=["light","dark","system"].includes(s)?s:"system";var r=t==="system"?(m.matches?"dark":"light"):t;document.documentElement.setAttribute("data-mode",r);}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      className={`${sora.variable} ${jbmono.variable}`}
      style={{ fontFamily: "var(--font-sora), ui-sans-serif, system-ui, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" }}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased">
        <div className="ark-signal-strip" aria-hidden="true" />
        <Toasty>{children}</Toasty>
      </body>
    </html>
  );
}
