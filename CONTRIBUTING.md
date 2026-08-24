# Contributing

感谢参与 Arkadia。提交 Pull Request 前请遵循以下约定。

## 开发流程

1. 从 `main` 创建功能分支。
2. 使用 `.env.example` 创建本地环境，不要提交真实凭据或生产数据。
3. 保持改动聚焦，并为行为变化补充测试。
4. 运行 `npm test` 和 `npm run build`。
5. 提交 Pull Request，说明动机、行为变化和验证结果。

## 数据与隐私

测试、文档和截图只能使用虚构数据。禁止提交真实用户名、IP、设备指纹、订阅 URL、订单、支付记录、数据库转储或服务器配置。

## 提交信息

建议使用约定式提交，例如：

```text
feat(admin): add server-side user filtering
fix(sync): preserve explicit proxy ports
docs: clarify production configuration
```

涉及安全问题时，请先按 [SECURITY.md](SECURITY.md) 私密报告。
