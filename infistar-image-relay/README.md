# Step 3 durable image jobs

Reuses the existing Cloudflare account and GitHub Pages application. This worker
owns the long image request so closing a tab does not cancel generation. The
browser stores a random task ID before submission and reuses that ID after a lost
acknowledgement. A Durable Object claims a task before making exactly one upstream
generation request. Repeated PUTs and GETs never generate another image.

Image responses are persisted before download/normalization. Result-download
failures remain unresolved and never regenerate an image. Results and encrypted credentials expire after
24 hours; expired IDs remain tombstoned so they cannot replay a paid request.
Credentials use AES-GCM with the `JOB_ENCRYPTION_KEY` Worker secret and are not
included in logs, responses, repository files or browser task records. Access to
a task requires the original API key. Observability is disabled.

If the upstream connection itself is lost before a response can be persisted,
the task is marked unknown and never automatically submitted again. There is no
invented upstream task-lookup API. The UI preserves the ID and requires the user
to check the original task before explicitly clearing it. This prevents automatic
duplicate billing; it cannot recover an image the upstream never delivered.

The allowlist covers the existing Infistar, OpenAI and NoneLinear Step 3 routes.
OpenAI reference images use multipart edits; Gemini uses native contents and
imageConfig. Shared API/size modules and the Step 4 implementation are unchanged.

Deploy from this directory with `wrangler deploy`. Provision a random 32-byte
base64 `JOB_ENCRYPTION_KEY` using `wrangler secret put` before first use; do not
rotate it while jobs remain active. `wrangler.jsonc` contains the Durable Object
binding, SQLite migration and allowed gallery origin. No provider key is deployed.

Run the offline checks from the repository root:

```
node --test forge/test-step3-image-capabilities.mjs forge/test-step3-image-protocol.mjs forge/test-step3-infistar-job.mjs infistar-image-relay/test-worker.mjs infistar-image-relay/test-image-result.mjs
node forge/test-step3-image-capabilities-browser.cjs
node forge/test-step3-image-recovery-browser.cjs
```

Real API tests are separately authorized and kept outside the public repository.

The overseas Worker selects Infistar's documented international image gateway
(https://infistar.ai/v1) before the only image-generation POST. It never falls
back to another host after submission. Native Gemini keeps its working route.
Gateway 5xx responses remain uncertain tasks and never trigger a new POST.
Gateway reference: https://doc.infistar.cc/integration-guides/gateway-config

## Long GPT requests and hosting capacity

GPT image requests use the account's Browser Run binding. A single headless
browser performs the single generation POST; its connection stays active while
the Durable Object persists the response. This avoids depending on the user's
proxy, tab lifetime, or the shorter ordinary Worker HTTP gateway wait. Native
Gemini retains its streaming Worker transport. Browser sessions close in finally.

Browser acquisition/navigation happens before the durable upstream claim. When
capacity is unavailable the task becomes unknown with zero upstream attempts;
it does not issue a paid request or automatically retry in the background.
Once a POST starts, an uncertain result never causes another generation POST.

Browser Run has account-level time and concurrency quotas. Confirm the production
account plan and capacity before enabling this frontend for users: the free
allowance (10 browser minutes/day) is too small for routine multi-minute image
generation. Capacity queues do not create additional quota. Consult the current
pricing at https://developers.cloudflare.com/browser-run/pricing/ and configure
usage monitoring in the hosting account. No subscription change is automated by
this repository or release workflow.

## 2026-11-16：步骤三低写入存储候选版（尚未启用/部署）

原实现每 16,000 字符写一个 Durable Object KV 条目。Base64 请求、上游原始
响应、规范化结果都会分片；删除输入、覆盖结果、过期清理也产生行写入。
因此这项额度不能直接换算成访问人数。计数规则见
[Cloudflare DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)。

候选实现将 input/raw/result 三段 JSON 原样保存到私有 R2，DO 只保存小任务状态。
`IMAGE_PAYLOADS` 绑定存在时才对新任务启用，未配置时仍走原分片路径。
旧任务按自身标记读取原存储，不迁移、不重发。轮询、取图及重复访问已过期任务
不会再次写入任务状态。任务保留 24 小时，期满删除三个 R2 对象并保留防重放墓碑。

接口要求保持原样：

- 非线智能：本地参考图仍向 `https://nonelinear.com.cn/api/upload-file` 提交
  `{image: 裸Base64, type: 扩展名}`，再向原生图接口传上传返回的 HTTPS URL。
  已有 HTTPS 参考图继续直接传递，参考图顺序和生成参数不变。
- 无限星河：Gemini 原生 `contents[].parts[].inlineData` 中的 `mimeType/data`、
  `generationConfig`、尺寸/比例、普通 JSON/SSE 路由不变；兼容接口也保留原请求。
- 客户端仍收到既有结果格式。临时上游图片 URL 仍先下载保存；不缩图、不重新编码、
  不降低画质。私有 R2 地址不会替换成提供给两家 API 的参考图 URL。

启用前需在同一 Cloudflare 账户创建专用 **Standard 私有桶**，关闭公开访问，
并在本目录 `wrangler.jsonc` 顶层加入实际桶名对应的绑定，例如：

```json
"r2_buckets": [
  { "binding": "IMAGE_PAYLOADS", "bucket_name": "gallery-step3-image-payloads" }
]
```

桶名只是建议，本次没有创建桶、修改配置或部署。必须给专用桶的 `step3/` 前缀
设置 **2 天后删除** 的生命周期兜底：如果 R2 输入已存好但首次 DO 事务失败且
用户不再提交，该对象没有 DO 元数据可供闹钟清理。对象的 `expires` 自定义元数据
本身不会触发删除；生命周期删除为异步执行，不能当作精确 TTL。正常任务仍按
24 小时闹钟清理。参考
[对象生命周期](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)。

一次正常任务最多新增三次 R2 PUT，读图产生 R2 GET；R2 容量/操作使用自己的
[免费额度及价格](https://developers.cloudflare.com/r2/pricing/)，不能当作无限免费。
本方案为兼容和故障诊断保留原始及规范化响应，二者可能都包含图片。

R2 入库失败时不会确认任务或调用付费生图；付费请求后发生存储/连接异常时
保持未确认状态，绝不自动重发。不能在已有 R2 任务未过期时移除绑定或回退到
不认识 `r2-v1` 的旧 Worker；回退须保留兼容读取能力，或先排空至少 24 小时任务。

离线验证：Worker/图片处理测试 34 项通过，覆盖两家请求格式、普通 JSON/SSE、
原图字节一致性、旧任务兼容、存储失败、过期清理及防重复付费。
有效 PNG 的约 3 MiB 参考图 + 约 3 MiB 返回图完整生命周期模拟：原分片
1,325 次行操作 → R2 版本 10 次，约减少 99.2%，另外有 3 次 R2 PUT。
这是测试替身对 KV/闹钟操作的计数，不是线上账单；实际用量随模型和图片大小变化。
该计数不含独立模型兼容记录，尚未做真实云端或付费 API 验证。

扩大检查时，原有前端能力/任务客户端测试有 6 项失败，浏览器恢复测试也失败；
这些测试及其前端依赖不依赖本次 Worker 改动，且本次均无差异。
根目录位图冻结检查、发布副本流程锁在修改前已有差异，未改基线或绕过检查。
本次仅改 `infistar-image-relay/` 内的 Worker、独立存储模块、离线测试及本文档，
没有改步骤四、共用模块、前端、模型参数、依赖或部署配置，不能据此进行整站发布。

## 2026-11-17：步骤三后台内存与 524 修复

本节记录本次明确授权的步骤三后台修复，取代上节候选方案的当前启用状态。
账户尚未开通 R2，未创建桶或变更付费套餐。当前通过 `STREAM_IMAGE_RESULTS=true`
启用 DO 分块流式存储，保留可选 R2 适配。大块内容读写使用 `noCache`，图片结果
单独保存，取图时按块生成兼容 JSON，避免完整图片反复解码、复制和 JSON 转义。
返回图片不缩放、不重新编码。旧任务仍按自身存储标记读取，不重发生成请求。

非线智能后台任务继续将已识别的本站中转 URL 转为官方 API 地址（这是此前已有行为）。
本次将非线智能普通生图及无限星河 Nano Banana 2.1 原生请求纳入已有的 Chrome
长请求通道，由 DO 管理生命周期，避免使用 Worker fetch 承载这些同步长生图。
参考图上传和模型、比例、4K 参数保持原样；不承诺消除服务商自身返回的 524。
后台新增排队、开始、上游响应头、响应体、保存成功和失败阶段日志，记录任务 ID、
真实响应头耗时、首块/整包耗时、HTTP 状态、CF Ray、cf-error-type、cf-error-origin
与图片字节数。日志脱敏，不输出 Key、提示词或参考图。
不对已提交但结果未知的任务自动重复付费 POST。

Chrome 在远端提取首张有效图片，再通过远端对象句柄分块传回，避免将整个原始
JSON 放入单条 CDP 消息。原始 JSON 上限为 128 MiB，实际图片仍保持 32 MiB 上限；
修正旧实现将 Base64/重复字段的 JSON 大小误当作图片大小而截断有效 4K 响应的问题。
正常结束、取消及错误均释放远端对象，图片原始字节不变。

离线验证 83 项通过，包括两个任务各五张参考图、DO/R2 两种存储、分块字节一致性、
大图下载、异常诊断及不重复提交。发布范围仅 `gallery-infistar-image-jobs` Worker，
不发布 Pages、独立非线中转或步骤四；真实 API 与两个页面并发结果另记验证报告。

运行中的付费任务不要切换 `wrangler tail` / Dashboard 实时日志或发布 Worker。
Cloudflare 官方说明，启用实时日志本身也可能触发 Durable Object 软件更新；
默认延迟约五分钟后，仍在运行的对象可能被重启。使用已启用的持久日志观察任务，
需要切换实时日志或发布时先等待任务结束。实例被重启而未确认结果时保留未知状态，
不自动重放付费请求。参考
[已知问题](https://developers.cloudflare.com/durable-objects/platform/known-issues/)及
[对象代码更新](https://developers.cloudflare.com/durable-objects/deployments/durable-objects-code-updates/)。

## 2026-11-17：实例重建恢复与局部修图读回

提交付费请求前将 Browser Run session、target 与独立结果槽保存到任务元数据。
每 15 秒的持久闹钟可在 DO 实例重建后重新连接仍存活的同一浏览器，等待或读回
原 Promise 的结果；恢复分支不会执行 fetch，也不会创建第二次付费提交。浏览器
保持窗口为 20 分钟，任务恢复预算为 13 分钟。浏览器丢失、结果槽不存在或预算
耗尽时保留明确的未知结果，不声称成功，也不自动重发。它不能恢复已被平台
终止的浏览器进程。成功状态持久化后才删除输入与恢复描述。

局部修图仅在 revision-gallery 的请求入口使用既有可恢复任务客户端；短暂状态
轮询失败、结果下载失败和服务端暂时性错误使用同一任务 ID 继续 GET。一次显式
修改只 PUT 一次；持续离线仍有总时限，不会假装收到图片。步骤四与共享 API
适配器未改。测试同时覆盖真实修图入口的两家服务商上传与结果读回。

受控云端验证使用真实 Browser Run 延迟 135 秒响应，并在等待期间通过 ctx.abort
强制销毁 DO 实例；新实例读回原图片，记录一次上游提交。付费服务商与双页验收
结果另存私有 artifacts，不将密钥、原始图片和提示词提交仓库。
