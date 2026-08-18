# Arkadia 订阅系统

LinuxDo OAuth 登录 + LDC 支付的每日节点订阅站。

- **注册码 100 LDC**(库存制,游客可买,付款自动发码),兑换送 5 天
- 到期按 **10 LDC/天** 续费,可一次买多天
- 专属订阅链接 `https://arkadia.work/<uuid>`,节点命名 `Arkadia-日期-序号`
- 站长后台:批次上传(一行一个)、库存管理、订单对账、用户管理、指纹风控、参数设置
- 一人多号识别:设备指纹同簇 ≥ 阈值自动封禁
- 不退款条款:购买前强制勾选 + ToS 明示

## 技术栈

Next.js 15(App Router)+ @cloudflare/kumo UI + Tailwind v4 + Drizzle ORM + PostgreSQL。
部署:Docker Compose(app + db),构建在服务器上完成。

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

## 部署(服务器上构建)

```bash
# 服务器上:
git clone https://github.com/Beicho/arkadia-sub.git && cd arkadia-sub
cp .env.example .env && vim .env
docker compose build
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
