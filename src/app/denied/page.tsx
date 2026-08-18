export const dynamic = "force-dynamic";

const REASONS: Record<string, { title: string; body: string }> = {
  trust: {
    title: "信任等级不足",
    body: "本站要求 LinuxDo 信任等级达到门槛后才能登录/购买。多逛逛论坛、正常互动提升等级后再来。",
  },
  banned: {
    title: "账号已被封禁",
    body: "该账号已被封禁(常见原因:一人多账号、违规分发订阅)。如有疑问请联系站长申诉。",
  },
  state: {
    title: "登录状态校验失败",
    body: "OAuth state 不匹配,可能是登录会话过期。请返回首页重新登录。",
  },
  oauth: {
    title: "LinuxDo 授权失败",
    body: "与 LinuxDo 的授权通信失败,请稍后重试。",
  },
};

export default async function DeniedPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const key = typeof sp.reason === "string" ? sp.reason : "";
  const info = REASONS[key] ?? {
    title: "无法继续",
    body: "发生了未知问题,请返回首页重试。",
  };

  return (
    <main className="mx-auto max-w-md px-4 py-24 text-center">
      <div className="mb-4 text-5xl">⛔</div>
      <h1 className="mb-3 text-xl font-bold">{info.title}</h1>
      <p className="mb-8 text-sm text-neutral-500">{info.body}</p>
      <a href="/" className="text-sm underline">
        返回首页
      </a>
    </main>
  );
}
