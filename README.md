# Arkadia 订阅系统

LinuxDo OAuth 登录 + LDC 支付的每日节点订阅站。

- **注册码 100 LDC**(库存制,游客可买,付款自动发码,首期开放 100 名额),兑换送 5 天免费更新
- 免费期后 **3 LDC/次更新额度**:拉新批次扣 1 额度,重复拉同一批不扣,额度不随时间过期(站长没更新就不用买)
- 专属订阅链接 `https://arkadia.work/<uuid>`,节点命名 `Arkadia-日期-序号`
- 订阅按 UA 分发 Clash / sing-box / base64 三种格式,**默认带分流规则**:
  国内直连、局域网直连、广告拦截(Clash)、微软/苹果直连、流媒体与电报独立分组、
  自动选择(url-test)兜底。规则全部内联在 `src/lib/rules.ts`,不依赖远程规则集,
  拉不到规则库导致配置加载失败的风险为零。后台"设置"页可一键切回全量代理
- 站长后台:批次上传、每 4 小时上游订阅全量同步、用户分页检索、库存/订单/风控与参数设置
- 福利代理池:SOCKS5/HTTP 可重复测速;每批最多加入 60 个(30 个原生/家宽优先 + 30 个实测高速)
- 一人多号识别:设备指纹同簇 ≥ 阈值自动封禁
- 不退款条款:购买前强制勾选 + ToS 明示

## 技术栈

Next.js 15(App Router)+ @cloudflare/kumo UI + Tailwind v4 + Drizzle ORM + PostgreSQL。
部署:Docker Compose(app + db)，GitHub Actions 测试并构建 GHCR 镜像，服务器只拉取镜像。

## 开发

```bash
cp .env.example .env        # 填 SESSION_SECRET / POSTGRES_PASSWORD
npm install
npm run db:push             # 建表
DEV_FAKE_LOGIN=1 npm run dev  # 无需真实 OAuth 即可登录调试
```

`DEV_FAKE_LOGIN=1` 时首页出现"DEV 登录"面板,可模拟任意用户名/信任级登录(仅非 production)。

## 测试 / CI

GitHub Actions(`.github/workflows/ci.yml`):npm ci → drizzle-kit push(postgres service)→ vitest → next build。

```bash
npm test        # vitest 单测(签名/金额/节点命名/兑换码)
```

## 部署(GitHub Actions 构建镜像)

```bash
# 服务器上只准备配置并拉取 CI 产物:
git clone https://github.com/Beicho/arkadia-sub.git && cd arkadia-sub
cp .env.example .env && vim .env
docker compose pull
docker compose --profile tools run --rm migrate   # 建表/迁移
docker compose up -d app db
```

反代把 `arkadia.work` → `127.0.0.1:3090`,TLS 在反代层终止。

## 上线前需要准备

1. [connect.linux.do](https://connect.linux.do) 创建 OAuth 应用,回调 `{APP_URL}/api/auth/callback`
2. [credit.linux.do](https://credit.linux.do) 控制台创建 API Key(pid/key)
3. DNS:`arkadia.work` A 记录指向服务器

## 安全要点

- 支付回调验签(MD5)+ 金额严格比对 + 行锁幂等
- 服务端定价,不信任任何前端金额
- 注册码库存原子扣减,超时未付自动回补
- OAuth state 防 CSRF;会话 JWT httpOnly cookie
- 管理后台二次鉴权(handler 层),操作全量审计
- 全局限流:登录/下单/订阅端点
