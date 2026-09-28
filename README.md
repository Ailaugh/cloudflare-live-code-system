# 活码系统

一个基于 React、Vite、Cloudflare Pages Functions 和 Cloudflare KV 的活码管理示例。管理者维护一个短码及其目标地址列表，访问短码时由边缘函数随机选择一个 HTTP(S) 目标并返回重定向。

## 功能

- `/tk/admin`：后台登录、创建、编辑、启停和删除活码。
- `/go/<短码>`：公开短链，启用状态下随机跳转到目标地址。
- 一个活码可以配置多个目标地址。
- 后台可以生成并下载对应的 SVG 二维码。
- `ADMIN_TOKEN` 通过 Cloudflare Pages Secret 校验，活码数据保存于 KV。

## 技术结构

```text
React + Vite
  ├─ src/App.tsx              管理台与本地公开路由
  ├─ src/lib/cloudApi.ts      管理台调用 Pages API
  └─ src/lib/liveCodes.ts     数据模型、校验和随机目标选择

Cloudflare Pages Functions
  ├─ functions/api/codes.ts   ADMIN_TOKEN 鉴权和 KV CRUD
  └─ functions/go/[code].ts   短码查询、计数和 302 跳转
```

KV 中使用 `live-code:index` 保存索引，使用 `live-code:item:<CODE>` 保存单条活码。索引和单条记录同时写入，便于管理列表和公开跳转分别读取。

## 本地开发

```powershell
npm install
Copy-Item .dev.vars.example .dev.vars
# 编辑 .dev.vars，设置仅用于本地开发的 ADMIN_TOKEN
npm test
npm run build
npm run cf:dev
```

本地 Pages 预览需要一个 KV binding。可以复制 `wrangler.example.toml` 为未被提交的 `wrangler.toml`，填入自己的 Pages 项目名、生产 KV namespace ID 和 preview namespace ID。`.dev.vars`、`wrangler.toml` 和 Wrangler 状态目录都不应提交。

## Cloudflare 部署

1. 在 Cloudflare 创建 Pages 项目和两个 KV namespace（生产、预览）。
2. 复制 `wrangler.example.toml` 为 `wrangler.toml`，填入自己的项目名和 namespace ID。
3. 登录 Wrangler：`npx wrangler login`。
4. 设置后台口令：`npm run cf:secret`，按提示输入随机长口令。
5. 构建并部署：`npm run cf:deploy`。
6. 在自己的域名下访问 `/tk/admin`，用刚设置的口令登录。

也可以直接使用 `npx wrangler pages deploy dist --project-name <YOUR_PAGES_PROJECT>`，无需把项目名写进源码。

## 认证和数据限制

- Pages Function 只校验 `x-admin-token` 请求头，没有用户账户、会话、速率限制或审计日志；正式环境应在 Cloudflare Access、WAF 或其他身份层后再开放管理入口。
- 登录口令默认放在当前浏览器的 `sessionStorage`；勾选“记住此设备”后会放入 `localStorage`。这方便使用，但不等同于硬件密钥或安全会话。
- 短码由 UUID 前六个十六进制字符生成，长度较短，不能视为抗枚举设计。需要更高安全性时应增加长度并配合访问控制。
- 访问计数在跳转后通过 KV 读改写异步更新；并发请求可能导致计数丢失，管理台更新也可能与计数写入竞争。计数只适合作为近似统计。
- 目标地址只接受 `http:` 和 `https:`，但应用不会验证目标站点内容；部署者应自行控制输入来源。

## 测试

```powershell
npm test
npm run build
```

当前测试覆盖数据模型、鉴权辅助函数和根路径行为；Cloudflare Pages/KV 的线上集成需要在自己的账户中验证。

## 开源许可

本项目使用 MIT License，详见 [LICENSE](./LICENSE)。
