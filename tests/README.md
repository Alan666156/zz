# 婴儿喂养 App V1.0 验收测试（tests/）

本目录是根级测试工作区，包含 **API 契约测试** 与 **端到端（E2E）测试**。

- 用例与精确断言：[`../docs/tests/v1.0.md`](../docs/tests/v1.0.md)（TE-01 产出，168 条）
- 技术契约：[`../docs/architecture/v1.0-baby-feeding.md`](../docs/architecture/v1.0-baby-feeding.md)
- 当前状态：**TE-01 骨架**。所有用例以 `test.skip` 注册，`npx playwright test --list` 可列出；真实断言在 TE-02（API）与 TE-03（E2E）实现。

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
│   │   ├── env.ts            # API/Web 地址、zz_e2e、Redis DB14
│   │   └── fixtures.ts       # 宝宝/喂养/生长/同步夹具
│   ├── common.spec.ts        # GEN-01..11
│   ├── devices.spec.ts       # DEV-01..06
│   ├── babies.spec.ts        # BABY-01..17
│   ├── feeding.spec.ts       # FEED-01..24
│   ├── timezone.spec.ts      # TZ-01..06
│   ├── stats.spec.ts         # STATS-01..09
│   ├── growth.spec.ts        # GROWTH-01..12
│   ├── export.spec.ts        # EXP-01..12
│   ├── sync.spec.ts          # SYNC-01..16
│   ├── isolation-security.spec.ts  # ISO-01..05、SEC-01..03
│   ├── health.spec.ts        # HEALTH-01..03
│   └── rate-limit.spec.ts    # RL-01..06（独立运行）
├── e2e/
│   ├── helpers/page.ts       # 捕获设备 ID、独立 API 上下文、页面错误收集
│   ├── onboarding.spec.ts    # UI-01..03
│   ├── quick-record.spec.ts  # UI-04..10
│   ├── records.spec.ts       # UI-11
│   ├── stats.spec.ts         # UI-12
│   ├── growth.spec.ts        # UI-13
│   ├── export.spec.ts        # UI-14
│   ├── offline.spec.ts       # UI-15..16
│   ├── sync-conflict.spec.ts # UI-17
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

当前应列出 **151 条 Playwright 用例**（130 条 API + 21 条 E2E），全部为 skipped；用例文档共 168 条，其余 17 条为 DB/PERF/COMPAT/MANUAL，不由 Playwright 执行。这只证明配置/骨架可加载，不代表功能通过。

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
| `DB_NAME` | `zz_e2e` | 重置脚本强制校验 |
| `REDIS_DATABASE` | `14` | 重置脚本强制校验 |
| `DB_PASSWORD` / `REDIS_PASSWORD` | 无 | 必填，仅本机 |
| `RUN_RATE_LIMIT` | `0` | 设为 `1` 才执行限流专项 |
| `APP_EXPORT_TOKEN_KEY` | 无 | TE-02 过期 token 用例使用（测试专用） |

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
# API 契约测试（TE-02 实现后有效）
npm run test:api

# E2E（TE-03 实现后有效；需前端 preview）
npm run test:e2e

# 全部
npm test
```

当前（TE-01）所有用例 skipped，运行结果是 `168 skipped`，属于预期。

### 限流专项

限流用例会耗尽额度，**必须独立运行**：

```bash
npm run reset:env
RUN_RATE_LIMIT=1 npx playwright test --project=api api/rate-limit.spec.ts
```

---

## 7. 隔离策略与已知约束

### 7.1 数据隔离

- MySQL：`zz_e2e`；Redis：DB 14。每轮/每场景前重置。
- E2E：每个场景新建 context，首次打开生成新设备 UUID；断言通过从首个 `/api/v1/` 请求捕获的 `X-Device-Id` 做后端核对。
- API：每个 spec/describe 使用独立设备 UUID；TE-02 可增加设备池（见用例文档 §24.1）。

### 7.2 init 限流约束

后端契约为 `POST /devices/init` 10 次/小时/IP。E2E 有 21 个场景、API 套件需要多个设备，若不清 Redis 会触发 429。

处理方式（二选一，TE-03 前与 Lead/architect 确认，用例文档 Q-12）：

1. **推荐**：每个场景/每个 spec 前执行 `FLUSHDB 14`（仅 DB14），清空限流计数；业务数据在 MySQL，缓存可重建。
2. 测试实例通过环境变量调高 init 额度（需要后端支持，当前契约未定义）。

### 7.3 其它已知约束

- 本机 Chrome 版本与 Playwright 1.6x 兼容；若 `channel: 'chrome'` 启动失败，设置 `channel: 'msedge'`（本机已装 Edge）。
- 3 秒/1 秒计时受机器负载影响，取 3 次中位数并记录环境；超时按缺陷处理，不放宽断言。
- CSV 时间格式/中文标签映射、选择器 `data-testid` 等存在契约缺口，见用例文档 §23；未确认前相关断言用 `test.fixme` 标记。
- 规模用例（10,001 行导出）通过仅限 `zz_e2e` 的直接 SQL 造数，运行后必须重置。
- 真机兼容（iOS 14 / Android 10 / 微信 / 支付宝）与 WebView 下载兜底只能人工执行，见用例文档 §19/§20。

---

## 8. 实现约定（TE-02 / TE-03）

1. 断言以 `docs/tests/v1.0.md` 的“精确断言”为准，不自行放宽。
2. 用例 ID 保留在测试标题中（如 `GEN-01 ...`），便于缺陷报告追溯。
3. 发现契约缺口时先在用例文档 §23 登记，不猜测后修改断言。
4. 测试代码只出现在 `tests/**`；不在集成分支改 `backend/**`、`frontend/**`。
5. 不执行 `git push`；提交留在 `feat/integration`。
