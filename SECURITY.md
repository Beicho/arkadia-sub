# Security Policy

## Supported Version

安全修复只针对 `main` 分支的最新版本。部署者应及时拉取最新镜像并执行数据库迁移。

## Reporting a Vulnerability

请使用 GitHub 仓库的 **Security advisories** 页面创建私密报告。不要在公开 Issue、Discussion、日志或截图中提交以下内容：

- 会话密钥、OAuth Secret、支付密钥和数据库连接串
- 上游订阅 URL、用户订阅 token 和代理认证信息
- 用户名、IP、设备指纹、订单或支付记录
- 可直接利用的攻击步骤和生产数据样本

报告请包含受影响版本、复现条件、影响范围和建议修复方向。维护者确认问题后会协调修复和披露时间。

## Deployment Guidance

- 所有秘密必须通过运行时环境变量或 Secret 管理系统注入。
- 生产环境必须禁用 `DEV_FAKE_LOGIN`。
- 数据库和应用端口不应直接暴露到公网。
- 公开容器镜像前应确认其中没有源码硬编码凭据。
- 凭据一旦进入 Git 历史、构建日志或容器镜像，应立即轮换；删除文件本身不能撤销泄露。
