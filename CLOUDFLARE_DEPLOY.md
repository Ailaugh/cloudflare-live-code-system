# Cloudflare Pages 部署指南

本文档描述通用部署流程。项目名、域名和 KV namespace ID 都属于部署者自己的 Cloudflare 资源，不应写入公共示例配置。

## 1. 创建资源

在 Cloudflare 创建一个 Pages 项目，并创建生产和预览两个 KV namespace。复制 `wrangler.example.toml` 为本地 `wrangler.toml`，填入：

```toml
name = "YOUR_PAGES_PROJECT"
pages_build_output_dir = "dist"

[[kv_namespaces]]
binding = "LIVE_CODES"
id = "YOUR_PRODUCTION_KV_NAMESPACE_ID"
preview_id = "YOUR_PREVIEW_KV_NAMESPACE_ID"
```

`wrangler.toml` 已加入忽略规则，不要提交真实 ID 到不属于自己的仓库。

## 2. 安装和登录

```powershell
npm install
npx wrangler login
```

## 3. 设置管理口令

```powershell
npm run cf:secret
```

该命令会让 Wrangler 将输入保存为 Pages Secret `ADMIN_TOKEN`。口令不会进入源码或 KV。开发环境可以使用 `.dev.vars`，该文件同样不能提交。

## 4. 构建和部署

```powershell
npm test
npm run cf:build
npm run cf:deploy
```

`cf:deploy` 不绑定任何现成项目；Wrangler 会使用当前目录的 `wrangler.toml`，也可以通过 `--project-name <YOUR_PAGES_PROJECT>` 临时指定项目。

## 5. 路由

- 管理台：`https://<YOUR_DOMAIN>/tk/admin`
- 公开短码：`https://<YOUR_DOMAIN>/go/<CODE>`
- 根路径默认返回 `404`。

## 安全和运维提示

- 管理 API 依赖 `x-admin-token`，没有账户、会话、速率限制和审计日志；建议在生产环境增加 Cloudflare Access 或 WAF 规则。
- 浏览器登录口令会进入 `sessionStorage`；启用“记住此设备”时进入 `localStorage`，因此应避免在共享设备上使用该选项。
- 短码是六位十六进制字符串，不能作为高强度授权凭据。
- 访问计数通过跳转后的 KV 异步读改写，存在并发丢失的可能，只适合近似统计。需要精确分析时使用专门的日志或分析服务。
