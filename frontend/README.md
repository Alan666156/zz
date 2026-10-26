# 宝宝喂养记录前端（V1.0）

Vue 3 + Vite + TypeScript + Pinia + Vant 4，离线优先：写操作先落 IndexedDB/outbox，再异步同步服务端。

## 本地开发与校验

```bash
npm install
npm run dev          # http://127.0.0.1:5173，/api 代理到 http://127.0.0.1:8080
npm run typecheck
npm run lint
npm run test:unit
npm run build
npm run check:bundle # preview: http://127.0.0.1:4173
```

## localStorage 与本地数据（Q-15）

### 契约固定 key

| Key | 写入方 | 说明 |
| --- | --- | --- |
| `zz.bf.deviceId` | `utils/device.ts` | 设备 UUID v4（小写），首次启动生成；所有 API 请求的 `X-Device-Id` 来源 |
| `zz.bf.activeBabyId` | `stores/baby.ts` | 当前选中的宝宝 id |
| `zz.bf.lastFeedType` | `views/HomeView.vue` | 最近选择的喂养类型：`BREAST` / `FORMULA` / `MIXED` / `SOLID` |
| `zz.bf.syncLock` | `stores/sync.ts` | 同步互斥锁，仅在不支持 `navigator.locks` 的浏览器作为降级锁写入，TTL 20 秒，同步结束即删除 |

### 应用本地偏好（非契约字段）

| Key | 说明 |
| --- | --- |
| `zz.bf.lastBreastSide` | 上次母乳侧别，用于下次快速记录默认值 |
| `zz.bf.lastFormulaAmount` | 上次配方奶量（ml），用于下次快速记录默认值 |

### 旧 key 迁移

以下旧 key 会在首次读取时自动迁移到 `zz.bf.*` 并删除旧值，升级不会丢失设备身份或当前宝宝：

`zz.deviceId` → `zz.bf.deviceId`，`zz.activeBabyId` → `zz.bf.activeBabyId`，
`zz.lastBreastSide` → `zz.bf.lastBreastSide`，`zz.lastFormulaAmount` → `zz.bf.lastFormulaAmount`。

E2E 与排障请只依赖 `zz.bf.*`。

### 数据丢失风险（页面文案）

- `/profile`「设备与数据」展示：宝宝与记录绑定当前设备 ID；清除浏览器数据、更换浏览器/设备或丢失设备 ID 会导致本机数据无法找回，离线未同步记录也会丢失。
- 无痕/禁用 localStorage 时页面额外提示无法持久保存设备 ID。
- IndexedDB：`zz-baby-feeding` v1，stores：`outbox`、`babies`、`feedingRecords`、`growthRecords`、`meta`。清空浏览器数据会同时清空 outbox 与缓存。

## 固定文案（FE-07）

以下文案集中定义在 `src/constants/copy.ts`，页面直接引用，**E2E 按原文断言，修改必须同步本节**。

### 数据丢失风险（`/profile` 设备与数据）

无痕模式额外提示（`storageAvailable === false` 时显示）：

> 当前浏览器无法持久保存设备 ID（可能是无痕模式）。关闭无痕模式后才能保留数据。

始终显示的数据丢失风险（`data-testid="profile-data-warning"`）：

> 宝宝与记录绑定当前设备 ID。清除浏览器数据、更换浏览器/设备或丢失设备 ID，都会导致本机数据无法找回；离线期间尚未同步的记录也会一并丢失。请勿在无痕模式长期使用。

### 离线横幅（`data-testid="offline-banner"`）

横幅在所有 tab 页顶部统一渲染，出现条件：离线 / 同步中 / 存在待同步记录。

| 状态 | 文案 |
| --- | --- |
| 离线且待同步 0 条 | `当前离线，记录会先保存在本机，联网后自动同步` |
| 离线且待同步 N 条 | `当前离线，记录会先保存在本机，联网后自动同步（待同步 N 条）` |
| 在线同步中 | `正在同步 N 条记录…` |
| 在线、有同步失败 | `有 N 条同步失败，请打开记录修改后重试` |
| 在线、有待同步 | `待同步 N 条，联网后自动同步` |

### 同步冲突（UI-17 / 契约 §4.7）

同步返回 `CONFLICT_SERVER_WINS` 时的 toast 为固定文案，**不得拼接条数或改写**：

> 该记录已在其他端更新

代码中引用 `SYNC_CONFLICT_COPY`；如需展示冲突条数，必须放在独立的次要文案里，主文案保持不变。

### 路由 chunk 加载失败（FE-11 / Q-24）

模态框（非 toast），标题固定为 `页面加载失败`；按钮为 `重试` / `取消`。

| 场景 | 文案 |
| --- | --- |
| 离线（`navigator.onLine === false`） | `当前网络不可用，页面尚未加载，请恢复网络后重试` |
| 其他/无法判断 | `页面加载失败，请检查网络后重试` |

对话框 `data-testid="route-load-error"`，重试按钮 `route-load-retry`，取消按钮 `route-load-cancel`。失败后当前路由不变，禁止自动重试；重试只由用户点击触发，再次失败继续弹同一对话框。`router.push/replace` 的 reject 与 `router.onError` 会同时收到同一次失败，按「对话框已展示且目标相同」去重，只更新离线文案；重试先 `router.replace` 回原目标，若仍失败且在线则整页跳转目标地址，绕过 Chromium 对失败动态 import/CSS 预加载的负缓存；重试期间「重试」「取消」均禁用，避免并发导航。识别范围同时覆盖 CSS 预加载失败（`Unable to preload CSS for ...`）。

### 导出（FE-07 / Q-16）

| 场景 | 文案 |
| --- | --- |
| 生成成功后的兜底提示（始终显示） | `若未开始下载，请复制链接到浏览器打开（链接 5 分钟内有效）。` |
| 一般失败 | `导出失败，请稍后重试。` |
| 限流（429） | `导出过于频繁（每小时最多 5 次），请稍后再试。` |
| 数据过大（`EXPORT_TOO_LARGE` 且无 rowCount 时） | `导出数据过多，请缩小日期范围后重试。` |
| 数据过大且返回 rowCount/maxRows | `导出数据过多（{rowCount} 行，最多 {maxRows} 行），请缩小日期范围。` |
| 剪贴板不可用 | `当前环境无法自动复制，请长按链接手动复制。` |
| 签名链接已过期（`expiresAt` 已到，点击重新下载/复制链接时） | `下载链接已过期，请重新导出。` |

说明：下载由浏览器导航/新窗口完成，前端**无法感知**下载是否真正开始，因此兜底提示在每次生成成功后都显示，供用户手动复制链接。签名链接 TTL 由服务端 `expiresAt` 决定（Q-16，300 秒）；前端只在本页内阻止过期链接再次触发下载或复制，用户把链接粘贴到浏览器后由服务端返回 `EXPORT_TOKEN_EXPIRED` / `EXPORT_TOKEN_INVALID`。

## 离线与同步（FE-08）

### 客户端单飞

`stores/sync.ts` 的 `runExclusive()` 保证同一标签页与跨标签页只有一个同步任务：

1. 浏览器支持 `navigator.locks` 时用 `navigator.locks.request('zz.bf.syncLock', { ifAvailable: true })`，拿不到锁直接返回 `busy`。
2. 否则退化为 `localStorage['zz.bf.syncLock']` 时间戳锁，TTL 20 秒；释放时只在值仍属于自己时删除，避免误删其他标签页的锁。
3. 同一 store 实例上并发的 `syncNow()` 复用同一个 Promise；服务端 `SYNC_IN_PROGRESS` 仍作为最终保护。

### 触发点与退避

- 触发：应用启动、`online` / `offline` 事件、`visibilitychange`（页面重新可见）、30 秒定时（仅当待同步数 > 失败数时）、本地写入（含离线写入）与可重试错误后的 `requestSync()`。
- 离线计数：`runSync()` 先执行 `refreshPending()`（只读 IndexedDB，不发请求）再判断在线状态，离线新增/编辑/删除后横幅「待同步 N 条」立即更新；离线不进入 `syncNow()`。
- 批量：`POST /api/v1/sync/push`，每批 1–50 条，`BABY` 优先、同类型按 `createdAt` 升序。
- 批次幂等：每次**新尝试**生成新 `batchId` 并同时固化 `clientTime`；失败后把 `{batchId, clientTime, keys, fingerprint}` 存入 IndexedDB `meta` 的 `sync.batchPlan`，下一轮内容未变时用**完全相同**的 `batchId` + `clientTime` + 记录列表重试，命中服务端 24h 缓存（`replayed:true`）。服务端对完整请求体哈希（含 `clientTime`），因此重试时不能重新取当前时间，否则哈希不同直接 409。内容被编辑/删除/新增，或已收到服务端结果，则丢弃计划并生成新 `batchId`。计划完整性按**完整 outbox** 判断（不是 `listSyncableOutbox()` 的到期子集）：批次里有条目仍在退避时本轮不发送、也不换 `batchId`，等全部到期后原样重放。
- 退避：1s / 2s / 5s / 15s / 60s / 5min，±20% 抖动；429/409 优先遵守 `Retry-After`。
- 结果处理：
  - `APPLIED` / `DUPLICATE` / `CONFLICT_SERVER_WINS`：按服务端返回记录覆盖本地缓存与 Pinia，再清 outbox。
  - 返回记录带 `deletedAt`（tombstone，`/sync/push` 是唯一可能返回它的入口）：删除本地记录与缓存，**绝不复活**。
  - `REJECTED`：保留本地记录，outbox 项标记 `failed`，不自动重试；用户重新编辑保存后清除失败标记并重新入队。
  - 网络/5xx/429：`deferOutbox` 记录 `attemptCount` 与 `nextRetryAt`；其他 4xx 业务错误直接标记失败。

### 在线单条接口与 404（Q-05 / Q-06 / Q-07）

- 在线 `GET/PATCH/DELETE` 遇到 404 视为“记录已不存在”：从本机缓存与 Pinia 移除（编辑场景提示“记录已不存在，已从本机移除”）。
- `PATCH` 请求体**不得**包含 `babyId`（Q-04），前端由 `toFeedingPatchData()` 统一剥离。
- 设备注册（UI-01）：任意请求返回 409 `DEVICE_NOT_REGISTERED` 时，`api/client.ts` 通过 device store 的 `onDeviceNotRegistered()` 初始化后重试一次，而不是直接调 `initDevice()`；store 内并发 `init()` 共享同一个进行中请求，`registered` 置位后 router 的 `ensureInitialized()` 不再发请求。
- 列表合并（FE-04）：宝宝 / 喂养 / 生长的服务端列表按 outbox 未完成项（`pendingOutboxOps()`）合并——pending `UPSERT` 的 id 用本地值覆盖服务端旧值，pending `DELETE` 的 id 从服务端列表剔除且不得复活；其余记录以服务端为准。离线编辑过的已同步记录、离线删除但服务端仍存在的记录都不会被一次刷新抹掉。
- 默认宝宝 revision（FE-06）：服务端切换默认宝宝时会同时递增**旧默认宝宝**的 revision，删除默认宝宝时会提升另一个宝宝并递增其 revision。本地只更新被 PATCH/DELETE 的那一条会导致之后编辑旧默认宝宝 409，且 409 分支不会自动自愈；因此在线设置默认、在线删除默认宝宝、以及同步结果把某个宝宝应用为默认后，都会重新拉取宝宝列表对齐所有 revision（sync 路径为异步刷新，不阻塞推送）。
- 删除宝宝（FE-07 / N-1）：记录缓存与记录级 outbox 只在删除不可逆确认后清理（在线 2xx/404、同步 `APPLIED`/`DUPLICATE`/tombstone）。在线 409 或其他 4xx 回滚时宝宝恢复、记录缓存与 outbox 原样保留；离线删除时先入队 BABY DELETE，其名下 FEEDING_RECORD / GROWTH_RECORD 项**挂起**（不参与 `planBatch` 推送，避免服务端判 `REJECTED`），删除确认后统一清理，同步 `CONFLICT_SERVER_WINS` 恢复宝宝后自动解除挂起。outbox 项带仅本地的 `babyId` 字段，不进入 `/sync/push` 请求体；`sync.batchPlan` 引用被清理条目时一并删除。
- 本地存储失败（FE-08）：`enqueueOutbox` 失败视为保存失败——回滚 Pinia 与缓存并抛错，弹窗展示错误且不提示「已记录」；缓存写入失败允许降级为仅内存，但 feeding / growth / baby store 会置 `cacheDegraded` 并写入 `lastError`，不再空 catch（宝宝在线操作成功后缓存失败也不会误回滚服务端结果）。

### 底部导航（FE-10）

- 五个 tab 统一用路由 `name` 匹配（`:to="{ name: 'home' }"` 等），不用 `path`。Vant 在 `route` 模式下按 `$route.matched` 的 path/name 判断 active；子路由的父记录 path 是 `''`（解析为 `/`），用 `to="/"` 会让「首页」在所有页面恒为 active，而 Vant 只在非 active 时跳转，导致其他页面点「首页」无效。

### 路由懒加载失败（FE-11 / Q-24）

- P1：`router.onError` + `navigateSafely()`（包装 `push/replace` 的 catch）统一识别 `Failed to fetch dynamically imported module` / `Importing a module script failed` / `ChunkLoadError` 等动态 import 失败，弹出模态框并使用上节固定文案；导航失败时当前路由不变，不自动重试。非 chunk 异常不弹框，仍走全局错误处理（`console.error`）。
- 懒加载边界：离线仅保证“应用外壳 + 已进入过的路由”可用；从未下载过的 Tab 在离线时不可用，属 V1.1（不引入 Service Worker / modulepreload）。
- P2 预取：`load` 后 `requestIdleCallback`（Safari/iOS 14 无该 API 时 `setTimeout 2500ms`，timeout 3s）串行 `import()` Records / Stats / Growth / Profile 四个路由组件，只加载模块不挂载；`navigator.onLine === false`、`connection.saveData === true`、`effectiveType` 为 `slow-2g/2g/3g` 时跳过；失败仅 `console.debug`。不预取 ECharts，图表仍随页面挂载按需加载。

## `data-testid` 清单（Q-14）

约定：E2E 只用 `data-testid`，不依赖 CSS 类名。`{...}` 为动态枚举值。

### 全局

| testid | 元素 |
| --- | --- |
| `app-toast` | 全局 toast 根节点（Vant Toast） |
| `offline-banner` | 离线/待同步横幅 |
| `tabbar` | 底部导航根节点 |
| `tabbar-home` / `tabbar-records` / `tabbar-stats` / `tabbar-growth` / `tabbar-profile` | 五个底部导航项 |
| `route-load-error` | 路由 chunk 加载失败模态框（Q-24） |
| `route-load-retry` / `route-load-cancel` | 上述对话框的「重试」/「取消」按钮 |
| `quick-record-fab` | 首页悬浮记录按钮 |

### 首页 / 快速记录

| testid | 元素 |
| --- | --- |
| `home-page` | 首页根节点 |
| `baby-card` | 当前宝宝卡片（点击打开切换） |
| `baby-switcher-item` | 宝宝切换列表项（可重复） |
| `baby-switcher-add` | 切换面板中的“添加宝宝” |
| `quick-record-sheet` | 快速记录弹层 |
| `feeding-type-tab-breast` / `feeding-type-tab-formula` / `feeding-type-tab-mixed` / `feeding-type-tab-solid` | 四个喂养类型 tab |
| `breast-timer-display` | 计时数字 `mm:ss` |
| `breast-timer-toggle` | 计时开始/暂停按钮 |
| `breast-timer-finish` | 计时结束并保存按钮 |
| `breast-side-group` | 母乳侧别按钮组 |
| `breast-side-left` / `breast-side-right` / `breast-side-both` | 侧别按钮（左 / 右 / 双侧） |
| `summary-feed-count` | 今日摘要-喂养次数 |
| `summary-total-amount` | 今日摘要-奶量 (ml) |
| `summary-total-duration` | 今日摘要-总时长（`totalDurationSec` 格式化） |
| `summary-avg-duration` | 今日摘要-每次时长（`totalDurationSec / feedingCount` 派生，次数为 0 时为 `0 分钟`） |
| `formula-amount-input` | 配方奶量原生 input |
| `solid-amount-input` | 辅食量原生 input |
| `feeding-tag-{spit_up\|refused\|sleepy\|hiccup\|other}` | 喂养标签 |
| `quick-record-note` | 快速记录备注（Vant Field 根节点，输入框为其内部 `textarea`） |
| `quick-record-save` | 快速记录保存按钮 |
| `feeding-timeline` | 今日喂养时间线 |
| `feeding-record-item` | 单条喂养记录（可重复） |
| `record-pending` | 记录“待同步”标记 |

### 记录页

| testid | 元素 |
| --- | --- |
| `records-page` | 记录页根节点 |
| `records-date-nav` | 日期导航容器 |
| `records-date-prev` / `records-date-next` | 前一天/后一天 |
| `records-date-calendar` | 打开日历 |
| `records-date-label` | 当前日期文案 |
| `records-loading` / `records-error` | 加载态/错误态 |
| `record-edit` / `record-delete` | 每条记录的操作按钮（可重复） |
| `records-load-more` | 加载更多（分页 size=20） |
| `record-edit-sheet` | 编辑记录弹层 |
| `record-edit-side-left` / `record-edit-side-right` / `record-edit-side-both` | 编辑时侧别 |
| `record-edit-duration` / `record-edit-amount` / `record-edit-note` | 编辑字段（Vant Field） |
| `record-edit-save` | 保存编辑 |

### 统计页

| testid | 元素 |
| --- | --- |
| `stats-page` | 统计页根节点 |
| `stats-range-7` / `stats-range-30` | 7/30 天切换 |
| `stats-summary` | 汇总卡容器 |
| `stats-metric-count` / `stats-metric-amount` / `stats-metric-duration` | 次数/奶量/时长指标 tab |
| `stats-chart` | 趋势图组件根节点 |
| `stats-chart-canvas` | ECharts 容器，内部为 `<canvas>` |
| `stats-offline` | “离线数据”标记 |
| `stats-empty` | 空态 |

### 生长页

| testid | 元素 |
| --- | --- |
| `growth-page` | 生长页根节点 |
| `growth-add` / `growth-add-inline` | 新增记录入口 |
| `growth-latest` | 最新指标卡 |
| `growth-latest-date` | 最新记录的测量日期（`YYYY-MM-DD`，仅日期，无“测量于”前缀；无记录时不渲染） |
| `growth-latest-height` / `growth-latest-weight` / `growth-latest-head` | 最新身高/体重/头围（如 `68.5 cm`、`8.5 kg`、`43.0 cm`） |
| `growth-metric-height` / `growth-metric-weight` / `growth-metric-head` | 三个趋势指标 tab |
| `growth-chart` | 趋势图组件根节点 |
| `growth-chart-canvas` | ECharts 容器，内部为 `<canvas>` |
| `growth-record-list` | 历史记录列表 |
| `growth-record-height` / `growth-record-weight` / `growth-record-head` | 单条记录指标（可重复） |
| `growth-edit` / `growth-delete` | 单条记录操作（可重复） |
| `growth-pending` | 单条记录“待同步” |
| `growth-form` | 新增/编辑弹层 |
| `growth-form-date` / `growth-form-height` / `growth-form-weight` / `growth-form-head` / `growth-form-note` | 原生日期/数值/备注输入 |
| `growth-form-save` | 保存按钮（三项全空时 disabled） |
| `growth-form-error` | 表单错误 |
| `growth-empty` / `growth-error` / `growth-offline` | 空态/错误/离线标记 |

### 宝宝表单 / 我的

| testid | 元素 |
| --- | --- |
| `profile-page` | 我的页根节点 |
| `baby-form` | 宝宝表单（onboarding 与新增/编辑共用） |
| `baby-form-name` | 昵称原生 input |
| `baby-form-gender-male` / `baby-form-gender-female` / `baby-form-gender-unknown` | 性别单选 |
| `baby-form-birth-date` | 出生日期原生 input |
| `baby-form-default` | “设为默认宝宝”开关 |
| `baby-form-submit` | 提交按钮 |
| `profile-baby-row` | 宝宝列表行（可重复） |
| `profile-set-default` / `profile-edit-baby` / `profile-delete-baby` | 宝宝行操作（可重复） |
| `profile-add-baby` | 添加宝宝 |
| `profile-data-warning` | 数据丢失风险提示 |

### 同步状态 / 导出（FE-07 / FE-08）

| testid | 元素 |
| --- | --- |
| `profile-sync-status` | 我的页“同步状态”卡片根节点（网络、待同步、失败、上次同步） |
| `profile-sync-now` | “立即同步”按钮 |
| `profile-export` | “导出喂养记录”入口（无当前宝宝时 disabled） |
| `export-dialog` | 导出弹层根节点 |
| `export-range-start` / `export-range-end` | 导出起止日期原生 `<input type="date">` |
| `export-error` | 导出校验/请求错误文案 |
| `export-submit` | 生成导出链接按钮 |
| `export-result` | 生成成功后的结果区根节点 |
| `export-row-count` | 导出条数文案 |
| `export-link` | 签名下载链接（只读 `<input>`，内容为绝对地址） |
| `export-link-expired` | “下载链接已过期”提示（`expiresAt` 到达后显示） |
| `export-download-again` | 再次下载按钮 |
| `export-copy-link` | 复制链接按钮 |
| `export-fallback-copy` | 固定兜底文案段落（始终显示于结果区） |

### 删除确认弹窗（记录 / 生长 / 宝宝共用）

Vant Dialog 的默认确认按钮不暴露 attrs，因此三个删除弹窗都使用 `footer` 插槽自定义按钮，弹层关闭后 DOM 仍保留，testid 只需在**同一弹窗内**唯一。

| testid | 元素 |
| --- | --- |
| `cancel-delete` | 取消按钮（关闭弹窗） |
| `confirm-delete` | 删除按钮（关闭弹窗并执行删除） |

同步锁 `zz.bf.syncLock` 不对外暴露 testid。

## E2E 选择器示例

```ts
await page.getByTestId('quick-record-fab').click()
await page.getByTestId('feeding-type-tab-formula').click()
await page.getByTestId('formula-amount-input').fill('120')
await page.getByTestId('quick-record-save').click()
await expect(page.getByTestId('app-toast')).toContainText('已记录')

await page.getByTestId('stats-chart-canvas').locator('canvas').waitFor()
```

Vant Field 包裹的字段（`quick-record-note`、`record-edit-note` 等）取根节点后，再定位内部 `input`/`textarea`。

```ts
await page.getByTestId('profile-export').click()
await page.getByTestId('export-range-start').fill('2026-10-01')
await page.getByTestId('export-range-end').fill('2026-10-20')
await page.getByTestId('export-submit').click()
await expect(page.getByTestId('export-fallback-copy')).toHaveText(
  '若未开始下载，请复制链接到浏览器打开（链接 5 分钟内有效）。',
)
```

## 性能预算与兼容性（FE-09）

### 包体预算

`npm run check:bundle` 读取 `dist` 的首屏静态资源（gzip）并与预算比较，超出即退出非 0：

| 资源 | 预算 | 最近一次实测 |
| --- | --- | --- |
| 首屏 JS | ≤ 200 KB gzip | 87.0 KB |
| 首屏 CSS | ≤ 50 KB gzip | 33.1 KB |
| ECharts 分包（`charts-*.js`） | ≤ 250 KB gzip | 82.2 KB |

ECharts 仅在统计页/生长页按需 `import()`，不进入首屏；每个页面视图均为路由级动态 import。

Q-24 P2 在首屏后 idle 预取的 4 个 Tab chunk（Records / Stats / Growth / Profile）gzip 合计约 **23.0 KB**（9.71 + 3.29 + 4.81 + 5.22 KB，随构建哈希小幅浮动）；预取不计入首屏预算，也不会提前加载 ECharts 分包。

### 兼容性约束

- 目标浏览器（契约 §5.7）：iOS 14+ Safari、Android 10+ Chrome/WebView、微信/支付宝内置浏览器。构建 target `es2018`。
- 已排除 iOS 14 不支持的特性：不使用 `crypto.randomUUID()`（`utils/uuid.ts` 手写 v4，只用 `crypto.getRandomValues`）、`Array.prototype.at`、`structuredClone`、顶层 await、CSS `:has`（`grep` 复核为 0 命中）。
- 安全随机数（FE-09）：`crypto.getRandomValues` 不可用时 `uuidV4()` 直接抛错（提示“当前浏览器不支持安全随机数”），不再降级 `Math.random`，避免生成可预测 id。
- `navigator.locks` 缺失时自动降级到 `zz.bf.syncLock` 时间戳锁；`navigator.clipboard` 缺失时提示手动复制。
- 导出下载使用 `<a target="_blank">` 导航，不使用 `URL.createObjectURL`（微信/iOS WebView 对 blob 下载支持差）。
- 不使用 `structuredClone`（WebView 版本覆盖不足），写入 IndexedDB 前统一 JSON 拷贝（`toPlain`）。
- 时间一律用本地时区字符串与 `tzOffsetMinutes` 表达；日期上下限按服务端 `serverToday = UTC 今天` 计算并允许 ±1 天容差（Q-11）：`birthDate ∈ [utcToday-3年-1天, utcToday+1天]`，`measuredOn ∈ [birthDate, utcToday+1天]`。`utils/date.ts` 的 `todayUtcDate()` 是唯一口径来源，禁止用本地“今天”卡范围；上下限用 `setUTCFullYear`/`setUTCDate` 做 UTC 日历运算，避免本地 DST 影响。
- 设备 UUID 存储与请求头统一小写（Q-13），历史大写值读取时归一化。
- 站点图标：`public/favicon.svg`（内联矢量、≤2KB、无外部 CDN），`index.html` 用 `<link rel="icon" type="image/svg+xml" href="/favicon.svg">` 引用；`vite build` 会原样复制到 `dist/favicon.svg`，避免浏览器回退请求 `/favicon.ico` 产生 404 控制台错误。

### 已知限制

- 导出对象固定为当前选中宝宝；无当前宝宝时 `profile-export` 置灰。
- 本版本无账号体系，因此页面不提供账号注销入口。
- 导出下载是否真正开始无法在前端探测，成功响应后始终显示兜底文案。
- 生长趋势图取最近 100 条生长记录，超出部分不参与绘图（记录列表仍完整分页）。
- 在线单条接口（PATCH/DELETE/POST）与批量同步引擎并存：单条路径用于即时反馈，仅在遇到可重试错误时触发 `requestSync()` 交给批量引擎兜底。

### 手测清单（本地无法真机验证，发版前必过）

自动化已覆盖类型、Lint、单测、构建与包体；以下项依赖真机/真实 WebView，需人工执行：

| # | 设备/环境 | 场景 | 预期 |
| --- | --- | --- | --- |
| 1 | iOS 14+ Safari | 首次打开 → 生成设备 ID → 创建宝宝 | 无报错；刷新后设备 ID/宝宝保留 |
| 2 | iOS 14+ Safari | 快速记录 → 断网 → 恢复网络 | 记录先落本机；联网后自动同步，记录列表不重复 |
| 3 | iOS 14+ Safari | 导出 CSV 并打开链接 | 触发下载或新窗口；微信内可复制链接到 Safari 打开 |
| 4 | iOS 14+ Safari | 无痕模式打开 | 显示“无法持久保存设备 ID（可能是无痕模式）”提示 |
| 5 | iOS 14+ Safari | 统计/生长页图表 | canvas 正常渲染，切换指标不报错 |
| 6 | Android 10 Chrome | 同上 1–5 | 同上 |
| 7 | Android 10 WebView（微信） | 导出下载 | 未自动下载时显示兜底文案，复制链接可下载 |
| 8 | Android 10 WebView（微信/支付宝） | 日期选择、数字键盘输入 | 原生 `input[type=date]`/`inputmode` 可用 |
| 9 | 任意桌面 Chromium | 两个标签页同时在线同步 | 只有一方推送（`zz.bf.syncLock`/`navigator.locks`），无重复记录 |
| 10 | 任意桌面 Chromium | 服务端返回 REJECTED（如宝宝已删除） | 本地保留记录、标记同步失败，不自动重试 |
| 11 | 任意桌面 Chromium | 签名链接放置 5 分钟后点“重新下载” | 显示“下载链接已过期，请重新导出。” |
| 12 | 任意桌面 Chromium | 控制台 | 全流程无 error/warn（`grep console.*` 为 0 已静态复核） |
