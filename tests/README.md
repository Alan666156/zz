# 婴儿喂养 App V1.0 验收测试（tests/）

本目录是根级测试工作区，包含 **API 契约测试** 与 **端到端（E2E）测试**。

- 用例与精确断言：[`../docs/tests/v1.0.md`](../docs/tests/v1.0.md)（Q-26 / N-1 后 181 条）
- 技术契约：[`../docs/architecture/v1.0-baby-feeding.md`](../docs/architecture/v1.0-baby-feeding.md)
- 边界裁决：[`../docs/architecture/v1.0-contract-addendum.md`](../docs/architecture/v1.0-contract-addendum.md)（Q-01~Q-24，冲突时以此为准；导出 token 短字段名以 f7a7f6e、同步锁 key 以 63b9b02 为准）
- 当前状态：**TE-05**。`api/**` 141 条与 `e2e/**` 23 条均已实现为可执行断言；最近全量 151 passed / 0 failed / 11 skipped，N-7 合入后路径专项 5/5、受影响回归 42/42、新增 UI-23 定向通过（全量未重跑）。可执行性只表示断言已按契约写好；已知失败与门控项见[`../docs/tests/v1.0-te04-defects.md`](../docs/tests/v1.0-te04-defects.md)。

---

## 1. 目录结构

```
tests/
├── package.json
├── package-lock.json
├── playwright.config.ts
├── tsconfig.json
├── .npmrc                    # 禁止下载 Playwright 浏览器
├── .env.example              # 环境变量占位符
├── api/
│   ├── helpers/
│   │   ├── api-client.ts     # 统一响应包、错误断言、设备客户端
│   │   ├── env.ts            # API/Web 地址、zz_e2e、Redis DB14、限流阈值
│   │   ├── export-token.ts   # addendum §4 canonical 自签导出 token
│   │   ├── redis-keys.ts     # 同步锁/幂等 key（addendum §5）
│   │   ├── redis.ts          # redis-cli 封装：FLUSHDB 14、SET NX PX、Lua 比较删除
│   │   ├── db.ts             # mysql 封装：只允许 zz_e2e，仅用于造数/核对
│   │   ├── device-hash.ts    # HMAC-SHA256(APP_DEVICE_PEPPER, deviceId) → hex
│   │   ├── csv.ts            # BOM/CRLF 处理、RFC4180 解析、无设备头下载
│   │   ├── scenario.ts       # 设备/宝宝/喂养夹具、§4.2 统计九条样本、404 一致性
│   │   └── fixtures.ts       # 宝宝/喂养/生长/同步夹具
│   ├── common.spec.ts        # GEN-01..11
│   ├── devices.spec.ts       # DEV-01..06
│   ├── babies.spec.ts        # BABY-01..17
│   ├── feeding.spec.ts       # FEED-01..24
│   ├── timezone.spec.ts      # TZ-01..06
│   ├── stats.spec.ts         # STATS-01..09
│   ├── growth.spec.ts        # GROWTH-01..12
│   ├── export.spec.ts        # EXP-01..14（EXP-14 需 RUN_Q25_SPAN=1）
│   ├── sync.spec.ts          # SYNC-01..20
│   ├── isolation-security.spec.ts  # ISO-01..05、SEC-01..03
│   ├── health.spec.ts        # HEALTH-01..03
│   ├── rate-limit.spec.ts    # RL-01..06（独立运行）
│   └── path-normalization.spec.ts  # RL-07..11（RUN_PATH_NORMALIZATION=1，N-7 后执行）
├── e2e/
│   ├── helpers/page.ts       # 捕获设备 ID、独立 API 上下文、页面错误收集
│   ├── onboarding.spec.ts    # UI-01..03
│   ├── quick-record.spec.ts  # UI-04..10
│   ├── records.spec.ts       # UI-11
│   ├── stats.spec.ts         # UI-12
│   ├── growth.spec.ts        # UI-13
│   ├── export.spec.ts        # UI-14
│   ├── offline.spec.ts       # UI-15..16
│   ├── sync-conflict.spec.ts # UI-17、UI-23
│   ├── profile.spec.ts       # UI-18
│   └── resilience.spec.ts    # UI-19..21
└── scripts/reset-e2e.sh      # 仅清空 zz_e2e + Redis DB14
```

---

## 2. 前置条件

| 项 | 要求 |
|---|---|
| Node / npm | Node 22.x / npm 10.x |
| 浏览器 | 本机 Chrome（`channel: 'chrome'`）；**不下载 Chromium** |
| 后端 | `http://127.0.0.1:8080`，MySQL `zz_e2e`，Redis DB 14 |
| 前端（仅 E2E） | `http://127.0.0.1:4173`，`/api` 代理到 8080 |
| MySQL / Redis | 本机服务可用；密码只通过环境变量传入 |
| 测试密钥 | 导出 token 过期用例需要测试专用 `APP_EXPORT_TOKEN_KEY`（与生产不同） |

后端启动示例（PowerShell/Git Bash 环境变量按本机调整；密码不要提交）：

```bash
export JAVA_HOME="/c/Program Files/Java/jdk-21.0.12.1"
export PATH="$JAVA_HOME/bin:$PATH"
export DB_PASSWORD=... REDIS_PASSWORD=...
export DB_URL='jdbc:mysql://127.0.0.1:3306/zz_e2e?createDatabaseIfNotExist=true&useUnicode=true&characterEncoding=utf8&connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true'
export REDIS_DATABASE=14
export APP_EXPORT_TOKEN_KEY='<test-only-key>'
cd ../backend
./gradlew bootRun
```

前端 preview：

```bash
cd ../frontend
npm ci
npm run build
npm run preview -- --port 4173
```

---

## 3. 安装

```bash
cd tests
npm ci
```

- `tests/.npmrc` 设置 `playwright_skip_browser_download=1`，安装依赖时不会下载 Chromium。
- 若需要强制跳过（例如自定义 npm 配置覆盖了 `.npmrc`）：

```bash
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci
```

验证配置可加载：

```bash
npx playwright test --list
```

当前应列出 **164 条 Playwright 用例**（141 条 API + 23 条 E2E）；用例文档共 181 条，其余 17 条为 DB/PERF/COMPAT/MANUAL，不由 Playwright 执行。这只证明配置/用例可加载，不代表功能通过。

---

## 4. 环境变量

复制 `.env.example` 为 `.env.local`（已被 `.gitignore` 忽略），填入本机值后在 Git Bash 中导出：

```bash
set -a
source .env.local
set +a
```

| 变量 | 默认值 | 说明 |
|---|---|---|
| `API_BASE_URL` | `http://127.0.0.1:8080` | API 根地址（不含 `/api/v1`） |
| `WEB_BASE_URL` | `http://127.0.0.1:4173` | E2E baseURL |
| `DB_NAME` | `zz_e2e` | 重置脚本与 `helpers/db.ts` 强制校验 |
| `DB_HOST` / `DB_PORT` / `DB_USER` | `127.0.0.1` / `3306` / `root` | `helpers/db.ts` 直连参数 |
| `REDIS_DATABASE` | `14` | 重置脚本与 `helpers/redis.ts` 强制校验 |
| `REDIS_HOST` / `REDIS_PORT` | `127.0.0.1` / `6379` | `helpers/redis.ts` 直连参数 |
| `DB_PASSWORD` / `REDIS_PASSWORD` | 无 | 必填，仅本机 |
| `APP_DEVICE_PEPPER` | 无 | 必填：计算 `device_uid_hash` 以核对 DB 与同步锁 key（必须与后端一致） |
| `RUN_RATE_LIMIT` | `0` | 设为 `1` 才执行限流专项 |
| `APP_EXPORT_TOKEN_KEY` | 无 | TE-02 过期 token 用例使用（测试专用，禁止生产值） |
| `APP_REDIS_KEY_PREFIX` | `zz:bf:v1:` | 同步锁/幂等 key 前缀，测试与后端必须一致 |
| `APP_RATE_LIMIT_API_PER_MINUTE` | `120` | 后端与测试上下文必须一致（Q-12） |
| `APP_RATE_LIMIT_INIT_PER_HOUR` | `10` | 同上 |
| `APP_RATE_LIMIT_EXPORT_PER_HOUR` | `5` | 同上 |
| `APP_RATE_LIMIT_SYNC_PER_MINUTE` | `30` | 同上 |

---

## 5. 重置测试环境

```bash
npm run reset:env
```

脚本行为：

- 只接受 `DB_NAME=zz_e2e`、`REDIS_DATABASE=14`，否则直接退出；
- `TRUNCATE` 业务表（`feeding_record`、`growth_record`、`baby`、`family_member`、`family`、`device`、`app_user`），保留 `flyway_schema_history`；
- `FLUSHDB` Redis DB 14；
- 不触碰 `zz_dev`、`zz_test`、Redis DB 0/15。

运行时机：每轮全量测试前；E2E 每个场景前（用于重置 init 限流计数，见 §7）。

---

## 6. 运行

```bash
# API 契约测试（TE-02 已实现，需可用的后端/MySQL/Redis 与 §4 凭据）
npm run test:api

# E2E（TE-05；需前端 preview）
npm run test:e2e

# 全部
npm test
```

`npx playwright test --list` 列出 **164 条**：141 条 API + 23 条 E2E。另有 17 条 DB/PERF/COMPAT/MANUAL 用例不由 Playwright 执行。

**执行前提**：后端已实现对应接口，且 `DB_PASSWORD`、`REDIS_PASSWORD`、`APP_DEVICE_PEPPER`、`APP_EXPORT_TOKEN_KEY` 与本机 MySQL/Redis 可达。缺少任一条件时 API 套件会在 `beforeEach` 的 Redis/DB 辅助函数处报错，属于环境未就绪，不是断言失败。仅实现 BE-01..BE-03 的后端只能覆盖 GEN/DEV/BABY/HEALTH，其余模块会因 404/校验差异失败。

### 限流专项

限流用例会耗尽额度，**必须独立运行**，且后端与测试进程使用同一组低阈值。
`api/path-normalization.spec.ts`（Q-26，RL-07..11）默认 skip，需 backend-dev 的 N-7 路径规范化修复合入并重启后，额外设置 `RUN_PATH_NORMALIZATION=1` 执行；修复前不得将其判为缺陷。

```bash
npm run reset:env
APP_RATE_LIMIT_API_PER_MINUTE=5 APP_RATE_LIMIT_INIT_PER_HOUR=3 \
APP_RATE_LIMIT_EXPORT_PER_HOUR=2 APP_RATE_LIMIT_SYNC_PER_MINUTE=3 \
RUN_RATE_LIMIT=1 npm run test:rate-limit
```

后端启动时也必须带上同样的 `APP_RATE_LIMIT_*`，否则响应头 `X-RateLimit-Limit` 与测试期望不一致。

---

## 7. 隔离策略与已知约束

### 7.1 数据隔离

- MySQL：`zz_e2e`；Redis：DB 14。每轮/每场景前重置。
- E2E：每个场景新建 context，首次打开生成新设备 UUID；断言通过从首个 `/api/v1/` 请求捕获的 `X-Device-Id` 做后端核对。
- API：每个用例新建独立设备 UUID，并在 `beforeEach` 执行 `FLUSHDB 14` 后重新 init（见用例文档 §24.1）；不跨用例复用设备或数据。

### 7.2 init 限流约束（Q-12 已裁决）

后端契约默认 `POST /devices/init` 10 次/小时/IP。E2E 有 23 个场景、API 套件需要多个设备，若不清 Redis 会触发 429。

已裁决方案：

1. 每个场景/每个 spec 前执行 `FLUSHDB 14`（仅 DB14），清空限流计数；业务数据在 MySQL，缓存可重建。
2. 测试实例通过 `APP_RATE_LIMIT_*` 调低（或调高）额度；后端与测试上下文必须一致。
3. 统一 `workers: 1`、`fullyParallel: false`；限流专项用独立低阈值上下文单独运行。

### 7.3 其它已知约束

- 本机 Chrome 版本与 Playwright 1.6x 兼容；若 `channel: 'chrome'` 启动失败，设置 `channel: 'msedge'`（本机已装 Edge）。
- 3 秒/1 秒计时受机器负载影响，取 3 次中位数并记录环境；超时按缺陷处理，不放宽断言。
- CSV 格式、精度、标签顺序、tombstone 语义已由 addendum 裁决并体现在用例文档 §23；仍待落地的是前端 `data-testid` 清单（Q-14）与 FE-07 文案（Q-15）。
- 导出过期 token 用例依赖测试专用 `APP_EXPORT_TOKEN_KEY` 与 `api/helpers/export-token.ts` 的 canonical 自签（短字段 `v,d,b,f,t,e,n`，base64url 无 padding）；禁止使用生产密钥。
- 同步锁用例（SYNC-16）通过预占 Redis `{APP_REDIS_KEY_PREFIX}lock:sync:{deviceHashHex}`（默认 `zz:bf:v1:lock:sync:{deviceHashHex}`，SET NX PX 15s）确定性触发；幂等 key 为 `{prefix}sync:{deviceHashHex}:{batchId}`（24h），不再依赖并发碰运气。
- 规模用例（10,001 行导出）通过仅限 `zz_e2e` 的直接 SQL 造数，运行后必须重置。
- 真机兼容（iOS 14 / Android 10 / 微信 / 支付宝）与 WebView 下载兜底只能人工执行，见用例文档 §19/§20。

---

## 8. 实现约定（TE-02 / TE-03）

1. 断言以 `docs/tests/v1.0.md` 的“精确断言”为准，不自行放宽。
2. 用例 ID 保留在测试标题中（如 `GEN-01 ...`），便于缺陷报告追溯。
3. 边界语义以 addendum 为准；发现新缺口先在用例文档 §23 登记，不猜测后修改断言。
4. 测试代码只出现在 `tests/**`；不在集成分支改 `backend/**`、`frontend/**`。
5. 不执行 `git push`；提交留在 `feat/integration`。
