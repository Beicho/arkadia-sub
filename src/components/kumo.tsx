"use client";

/**
 * Kumo 组件的 client 中转层。
 * Kumo 面向 Astro 客户端岛设计,包内没有 "use client" 标记;
 * Server Component 直接引入会在 SSR 时崩(createContext)。
 */
export { Toasty } from "@cloudflare/kumo/components/toast";
