"use client";

/**
 * Kumo 组件的 client 中转层。
 * Kumo 面向 Astro 客户端岛设计,包内没有 "use client" 标记;
 * Server Component 直接引入会在 SSR 时崩(createContext)。
 * Server 页面一律从本文件引入 Kumo 组件。
 */
export { Toasty, useKumoToastManager } from "@cloudflare/kumo/components/toast";
export { Button, LinkButton } from "@cloudflare/kumo/components/button";
export { Input } from "@cloudflare/kumo/components/input";
export { Badge } from "@cloudflare/kumo/components/badge";
export { Banner } from "@cloudflare/kumo/components/banner";
export { Switch } from "@cloudflare/kumo/components/switch";
export { LayerCard } from "@cloudflare/kumo/components/layer-card";
export { Sidebar } from "@cloudflare/kumo/components/sidebar";
export { Table } from "@cloudflare/kumo/components/table";
