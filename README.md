# Arkadia

Arkadia 是一个自托管的节点订阅与付费更新系统，使用 LinuxDo OAuth 登录、LDC 支付、PostgreSQL 和 Docker Compose。管理员可以维护节点批次、代理池、用户、订单和兑换码；用户通过独立订阅链接获取 Clash、sing-box 或 Base64 格式配置。

## 功能

- LinuxDo OAuth 登录与最低信任等级限制
- 注册码库存、LDC 支付和更新额度
- 按日期计费：同一天切换多个批次只消耗一次更新额度
- Clash、sing-box、Base64 订阅格式与内置分流规则
- 每天两个持久化随机时段拉取上游订阅、创建新批次并原子切换
- SOCKS5/HTTP 代理导入、复测与延迟排序
- 每批最多加入 60 个福利代理：30 个原生/家宽优先，30 个实测高速优先
- 用户分页检索、订单对账、公告、风控与审计日志
- Docker Compose 部署与 GitHub Actions 构建镜像

## 技术栈

- Next.js 16、React 19、TypeScript
- Drizzle ORM、PostgreSQL 16
- Vitest
- Docker、GitHub Actions、GHCR

## 快速开始

```bash
git clone https://github.com/Beicho/arkadia-sub.git
cd arkadia-sub
cp .env.example .env
```

编辑 `.env`，至少设置数据库密码、会话密钥、站点地址和管理员用户名：

```dotenv
POSTGRES_PASSWORD=replace-with-a-strong-password
SESSION_SECRET=replace-with-output-of-openssl-rand-hex-32
APP_URL=https://subscription.example.com
ADMIN_USERNAMES=your-linuxdo-username
```

启动数据库、执行迁移并启动应用：

```bash
docker compose build app migrate
docker compose up -d db
docker compose --profile tools run --rm migrate
docker compose up -d app
```

应用默认监听 `127.0.0.1:3090`。生产环境应由 Caddy、Nginx 或其他反向代理终止 TLS，再转发到该端口。

## 环境变量

| 变量 | 必需 | 用途 |
|---|---|---|
| `POSTGRES_PASSWORD` | 是 | PostgreSQL 容器密码 |
| `SESSION_SECRET` | 是 | 会话签名密钥，建议使用 `openssl rand -hex 32` 生成 |
| `APP_URL` | 是 | 站点公开地址，用于 OAuth、支付回调和订阅链接 |
| `ADMIN_USERNAMES` | 是 | LinuxDo 管理员用户名，多个值用逗号分隔 |
| `LINUXDO_CLIENT_ID` | 生产必需 | LinuxDo Connect OAuth Client ID |
| `LINUXDO_CLIENT_SECRET` | 生产必需 | LinuxDo Connect OAuth Client Secret |
| `LDC_PID` | 启用支付时必需 | LDC 商户 PID |
| `LDC_KEY` | 启用支付时必需 | LDC API Key |
| `LDC_EPAY_BASE` | 否 | LDC 支付接口地址 |
| `UPSTREAM_SUBSCRIPTION_URL` | 启用自动同步时必需 | 上游订阅地址，可能包含访问令牌 |
| `LDC_ORDER_EXPIRE_MINUTES` | 否 | 待支付订单过期时间，默认 5 分钟 |
| `DEV_FAKE_LOGIN` | 否 | 非生产环境的模拟登录开关 |

`ADMIN_USERNAMES` 是全新数据库的初始管理员名单。系统初始化后仍可在后台设置页维护管理员。

`UPSTREAM_SUBSCRIPTION_URL` 不会显示在管理员页面中。后台填写自定义地址时，该值保存在数据库并优先于环境变量；把输入框留空会恢复使用环境变量。

## 自动同步

后台进程每分钟检查一次同步状态。每天会在上海时区 07:00–10:00 与 14:00–23:00 各生成一个持久化随机时刻；同一计划在服务重启后保持不变，每个槽位最多认领一次。一次同步会：

1. 获取并解析 Raw URI、Base64 或 Clash YAML 上游订阅。
2. 保留上游中的全部有效节点。
3. 从已测可用代理池选取最多 60 个福利代理。
4. 去重后创建一个新批次，并在数据库事务中切换激活状态。

多实例会在请求上游前通过 PostgreSQL advisory lock 原子认领槽位，避免重复拉取。若停机导致两个槽位同时积压，只补最新一次，避免恢复后连续请求。自动同步失败不会在下一分钟重试，当前激活批次保持不变；管理员手动同步不占每天两个自动槽位。

自动同步失败不会停用当前批次。同一上海日期内创建多个批次，用户仍只消耗一次更新额度。

## 本地开发

```bash
npm install
cp .env.example .env
npm run db:push
DEV_FAKE_LOGIN=1 npm run dev
```

测试与构建：

```bash
npm test
npm run build
```

## 安全

- 不要把真实 `.env`、订阅地址、OAuth Secret、支付密钥或数据库备份提交到仓库。
- 上游订阅地址通常等同于访问凭据，泄露后应立即在供应商处轮换。
- 生产环境必须保持 `DEV_FAKE_LOGIN=0`，并使用 HTTPS。
- GHCR 镜像公开时，其中的服务端代码也可以被提取；秘密只能在运行时通过环境变量或 Secret 注入。
- 安全问题请按照 [SECURITY.md](SECURITY.md) 私下报告，不要在公开 Issue 中提交凭据或用户数据。

## 参与贡献

提交改动前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。CI 会检查数据库结构、运行 Vitest、构建 Next.js，并为 `main` 分支发布容器镜像。

## 许可证

Arkadia 使用 [GNU Affero General Public License v3.0](LICENSE)。修改后通过网络向用户提供服务时，需要向这些用户提供对应版本的源代码。
