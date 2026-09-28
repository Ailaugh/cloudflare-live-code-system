# 用 React + Cloudflare Pages Functions + KV 做一个可随时切换目标地址的活码系统

活动海报上的二维码印出后，落地页地址可能会变：活动结束了，投放渠道要切换了，或者想在多个页面之间分流。如果二维码直接编码目标页面 URL，每改一次地址就得重新出图。活码的思路是让二维码始终指向一个固定短链，由服务端在访问时决定实际跳向哪里。

本文拆解一个已实现的独立活码系统：管理台创建短码并配置一条或多条 HTTP(S) 目标地址，访问者扫描二维码后由 Cloudflare Pages Function 返回 `302`。修改目标地址不会改变二维码内容。项目源码见文末；文中的地址和口令均为示例。

## 一、功能与技术选型

当前版本实现了：

- 在 `/tk/admin` 输入后台口令，管理活码的创建、编辑、启停、删除；
- 为一条活码配置多条目标地址，每次访问随机选择其中一条；
- 生成固定短链的 SVG 二维码，支持复制地址与下载；
- 展示活码数量、启用数量和访问次数；
- 公开访问 `/go/<短码>`，无须后台口令，直接由服务端跳转。

技术栈是 React 19、TypeScript、Vite、`qrcode`、Cloudflare Pages Functions 和 Workers KV。前端负责管理界面与二维码生成；Pages Functions 负责鉴权、CRUD 和公开跳转；KV 保存数据。无需单独维护一台 Node.js 服务器。

```text
管理员浏览器  ── x-admin-token ──> /api/codes (Pages Function)
       │                                  │
       │ 生成 /go/ABC123 的 SVG 二维码      │ 读写 LIVE_CODES KV
       ▼                                  ▼
   管理界面                         活码索引 + 单条记录

访客扫码 ──> /go/ABC123 (Pages Function) ──> 随机目标 ── 302 ──> 落地页
```

项目中的关键文件：

| 文件 | 职责 |
| --- | --- |
| `src/App.tsx` | 登录页、管理台、表单、二维码预览与下载 |
| `src/lib/liveCodes.ts` | 前端本地数据工具及 Vite 场景下的跳转辅助逻辑 |
| `src/lib/cloudApi.ts` | 管理台对 `/api/codes` 的请求封装 |
| `src/lib/adminAuth.ts` | 管理入口判断与浏览器端口令保存/清理 |
| `functions/api/codes.ts` | 需要口令的活码 CRUD 接口 |
| `functions/go/[code].ts` | 公开短码解析、随机选址和 302 跳转 |
| `functions/lib/liveCodeStore.ts` | 数据归一化、校验和目标地址选择 |
| `functions/_middleware.ts` | 根路径返回 404 |
| `wrangler.example.toml` | Pages 构建输出与 KV binding 的脱敏模板（本地复制为 `wrangler.toml`） |

## 二、为什么二维码可以不变

二维码编码的不是最终落地页，而是系统自己的公开地址，例如 `https://your-domain.example/go/ABC123`。管理台只更新短码 `ABC123` 对应记录中的 `targetUrls`；短码自身和二维码中的 URL 保持不变。

核心数据结构位于 `functions/lib/liveCodeStore.ts`：

```ts
export type CloudLiveCode = {
  id: string
  name: string
  code: string
  targetUrl: string
  targetUrls: string[]
  enabled: boolean
  visits: number
  createdAt: string
  updatedAt: string
}
```

`id` 是 UUID，`code` 是从 UUID 去掉连字符后取前 6 位并转成大写的公开短码。`targetUrls` 是跳转候选列表，`targetUrl` 保留列表第一项，兼容早期只有单个目标地址的数据。`enabled` 控制是否允许跳转，`visits` 是展示用访问计数。修改记录时，代码保留原来的 `id`、`code`、`visits` 和 `createdAt`，只更新名称、目标地址及 `updatedAt`。

KV 中同时保存两种键：

```text
live-code:index             -> 所有活码的 JSON 数组，供管理台列表读取
live-code:item:ABC123       -> 单条活码 JSON，供公开跳转直接读取
```

这样公开路由只需按短码读取一条记录，不必扫描整个列表。创建和更新接口会同时写单条记录与索引；删除时也会删除单条键并重写索引。

## 三、管理 API 与口令校验

`functions/api/codes.ts` 用 Pages Functions 的请求方法导出对应处理器：

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/api/codes` | 验证口令并读取活码索引 |
| `POST` | `/api/codes` | 校验输入、生成短码并创建记录 |
| `PUT` | `/api/codes?code=ABC123` | 按短码更新名称、目标地址或启用状态 |
| `DELETE` | `/api/codes?code=ABC123` | 删除活码 |

后台口令没有写死在前端或源码里。请求把用户输入放入 `x-admin-token`，服务端拿它与 Pages Secret `ADMIN_TOKEN` 对比。`GET` 也要先过校验，所以登录页通过尝试读取列表来完成验证。

```ts
function checkAdmin(request: Request, env: CloudflareEnv): Response | null {
  if (!env.ADMIN_TOKEN) {
    return json({ error: 'ADMIN_TOKEN 未配置' }, 500)
  }

  if (request.headers.get('x-admin-token') !== env.ADMIN_TOKEN) {
    return json({ error: '管理口令错误' }, 401)
  }

  return null
}
```

创建和编辑时，服务端会去除名称、地址两端空白，要求名称非空、至少一条目标地址，并逐条用 `new URL()` 解析，只接受 `http:` 或 `https:`。这能挡住 `javascript:` 等协议，但不等同于目标域名白名单。若公开服务不希望跳转到任意外部域名，还需要另外增加域名策略。

管理台默认把登录口令保存在 `sessionStorage`；勾选“记住此设备”后还会写入 `localStorage`，退出登录会清掉两处。浏览器存储只是便捷登录状态，不是服务端授权边界；每次管理 API 请求仍要由 Function 校验。由于选择“记住”意味着口令留在本机浏览器，公共设备上不应勾选。

## 四、公开跳转如何随机选址

访问 `/go/ABC123` 时，`functions/go/[code].ts` 把路径参数转大写，读取 `live-code:item:ABC123`，检查记录是否存在且已启用。不存在或停用时返回 `404`；正常时选择一个目标并返回 `302` 和 `Location` 头。跳转响应设置 `Cache-Control: no-store`，避免浏览器或中间缓存把随机结果固定下来。

`src/App.tsx` 里也有按 `/go/<短码>` 读取浏览器 `localStorage` 的前端分支，用于纯前端场景的兼容逻辑；部署到 Cloudflare Pages 后，正式公开跳转由同路径的 Pages Function 处理，数据来源是 KV，不是访客浏览器的 `localStorage`。因此排查线上跳转问题时，应优先看 Function 和 KV。

随机数来自 Web Crypto，而不是前端执行的 `Math.random()`：

```ts
function randomValue(): number {
  const values = new Uint32Array(1)
  crypto.getRandomValues(values)
  return values[0] / 0x100000000
}
```

目标选择函数把 `0 <= randomValue < 1` 映射到数组下标；对超界或非有限输入也做了边界处理，方便直接单元测试：

```ts
export function selectCloudTarget(targetUrls: string[], randomValue: number): string {
  if (targetUrls.length === 0) {
    throw new Error('至少需要一个目标地址')
  }

  const boundedRandom = Number.isFinite(randomValue)
    ? Math.min(Math.max(randomValue, 0), 1 - Number.EPSILON)
    : 0
  return targetUrls[Math.floor(boundedRandom * targetUrls.length)]
}
```

目前是**均匀随机**，没有权重、粘性分流或 A/B 实验统计。如果配置两个目标，大量访问下大致各占一半，但不能保证每两次访问必然各命中一次。

完成选址后，Function 用 `waitUntil()` 异步回写 `visits + 1` 和索引中的计数，再立即返回跳转响应。这个设计减少了计数写入对访客跳转的阻塞，但它是 KV 上的读-改-写，不是原子计数：并发访问可能丢计数，也可能与管理端编辑发生覆盖；因此当前数字适合粗略观察，不宜作为结算或精确分析依据。要做精确计数，可把计数迁到具备串行化或原子更新能力的存储/事件流水线。

## 五、SVG 二维码如何生成

二维码由管理台在浏览器内生成，内容是 `location.origin + /go/ + 短码`，不是最终目标地址。`src/App.tsx` 调用 `qrcode` 包输出 SVG：

```ts
void QRCode.toString(selectedUrl, {
  type: 'svg',
  margin: 1,
  width: 240,
  color: { dark: '#142126', light: '#ffffff' },
}).then((markup) => {
  if (!cancelled) setQrMarkup(markup)
})
```

下载时把生成的 SVG 字符串放进 `Blob`，创建临时 URL，触发文件名为 `<短码>.svg` 的下载。后续在管理台修改目标地址，只改服务器记录；已投放的 SVG 图片无需重做。管理台还提供活码地址复制、按名称/短码/目标地址搜索，以及启停和删除操作。

## 六、从本地运行到 Cloudflare Pages

先安装依赖并执行测试、构建：

```powershell
npm install
npm test
npm run cf:build
```

部署前要用**自己的** Cloudflare Pages 项目和 KV namespace。公开仓库提供 `wrangler.example.toml` 脱敏模板，请先复制为本地 `wrangler.toml`，再填入自己的 Pages 项目配置和 KV namespace 的 `id`、`preview_id`；`pages_build_output_dir` 保持为 `dist`，KV binding 名必须与代码中的 `LIVE_CODES` 一致。不要把包含个人部署配置的本地 `wrangler.toml` 提交到公开仓库。

再为自己的 Pages 项目设置后台口令。以下命令会交互输入 Secret，不要把口令写进文章、仓库、`wrangler.toml` 或命令历史中的明文参数：

```powershell
npx wrangler pages secret put ADMIN_TOKEN --project-name <your-pages-project>
```

本地完整预览要先构建，再让 Wrangler 同时服务静态产物和 Pages Functions：

```powershell
npm run cf:build
npm run cf:dev
```

本地预览也需要为 `ADMIN_TOKEN` 提供本地 Secret，并使用可用的 KV preview binding。单独运行 `npm run dev` 只是 Vite 前端服务器，并不等同于 Pages Functions 环境，无法据此验证管理 API。公开副本的 `cf:deploy` 使用当前目录的 `wrangler.toml`，因此复制模板并填好配置后可直接执行 `npm run cf:deploy`；也可以显式指定项目名：

```powershell
npx wrangler pages deploy dist --project-name <your-pages-project>
```

部署后，先打开 `https://your-domain.example/tk/admin` 登录并创建活码，再访问相应的 `/go/<短码>` 验证 `302`；根路径 `/` 则被中间件明确处理为 `404`。

## 七、测试覆盖与当前边界

项目用 Vitest 覆盖了数据创建/更新、目标 URL 协议校验、历史单目标记录兼容、随机选择、前端口令存储、公开路径判断与根路由 `404`。运行：

```powershell
npm test
```

目前测试主要是单元级；管理 API 的 KV 读写、公开跳转的响应头与并发计数还值得补集成测试。另一个边界是短码只取 UUID 的前 6 个字符：创建时会对当前索引做碰撞重试，但跨并发创建并没有事务保护。KV 索引与单条记录也是两次写入，不能当作原子事务使用。流量或数据量进一步增大时，应重新评估索引、短码生成和计数方案。

这个项目的关键不是“生成二维码”，而是把**二维码中的固定入口**与**后台可编辑的目标地址**拆开。小规模活动入口用 Pages + KV 就能快速落地；需要强一致计数、复杂分流、审计日志或多人权限时，再把这些能力作为下一阶段演进。

## 源码地址与开源说明

GitHub：[https://github.com/Ailaugh/cloudflare-live-code-system](https://github.com/Ailaugh/cloudflare-live-code-system)

公开仓库是从当前项目整理出的**脱敏副本**，不包含生产环境口令、个人账号信息或可直接复用的 Cloudflare Secret；仓库按 MIT 许可发布。复用代码时，请先替换自己的 Pages 项目名、KV namespace 和域名，并单独配置 `ADMIN_TOKEN`。不要把个人 token、KV 标识之外的内部配置或其他敏感环境变量提交到 Git 仓库。

仓库中的 `README.md`、`CLOUDFLARE_DEPLOY.md` 和测试用例可配合本文阅读。当前实现的访问计数采用 KV 读-改-写并通过 `waitUntil()` 异步回写，高并发下可能出现计数丢失；它适合粗略统计，不应直接用于计费或精确结算。
