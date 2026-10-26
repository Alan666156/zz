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
| `zz.bf.syncLock` | 预留（FE-08） | 同步互斥锁，仅同步期间存在；当前版本尚未写入 |

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

## `data-testid` 清单（Q-14）

约定：E2E 只用 `data-testid`，不依赖 CSS 类名。`{...}` 为动态枚举值。

### 全局

| testid | 元素 |
| --- | --- |
| `app-toast` | 全局 toast 根节点（Vant Toast） |
| `offline-banner` | 离线/待同步横幅 |
| `tabbar` | 底部导航根节点 |
| `tabbar-home` / `tabbar-records` / `tabbar-stats` / `tabbar-growth` / `tabbar-profile` | 五个底部导航项 |
| `quick-record-fab` | 首页悬浮记录按钮 |

### 首页 / 快速记录

| testid | 元素 |
| --- | --- |
| `baby-card` | 当前宝宝卡片（点击打开切换） |
| `baby-switcher-item` | 宝宝切换列表项（可重复） |
| `baby-switcher-add` | 切换面板中的“添加宝宝” |
| `quick-record-sheet` | 快速记录弹层 |
| `feeding-type-tab-breast` / `feeding-type-tab-formula` / `feeding-type-tab-mixed` / `feeding-type-tab-solid` | 四个喂养类型 tab |
| `breast-timer-display` | 计时数字 `mm:ss` |
| `breast-timer-toggle` | 计时开始/暂停按钮 |
| `breast-timer-finish` | 计时结束并保存按钮 |
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

### 预留（后续任务）

- 导出（FE-07）：`profile-export`、`export-dialog`、`export-range-start`、`export-range-end`、`export-submit`、`export-fallback-copy`。
- 同步锁（FE-08）：`zz.bf.syncLock`；不新增 testid。

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
