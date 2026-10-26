# 本地多 Agent 软件开发工作流（路线 A）

基于编码 CLI 自带编排（Claude Code / CodeBuddy 等）的多 agent 开发工作流骨架。

## 目录结构

```
multi-agent-workflow/
├── README.md                    # 本文件：使用说明
├── CLAUDE.md                    # Lead agent 的全局规则（进入项目自动加载）
├── .claude/
│   ├── settings.json            # 团队模式开关等配置
│   └── agents/                  # 角色定义（subagent / teammate）
│       ├── architect.md         # 架构师（只读，出方案）
│       ├── frontend-dev.md      # 前端开发
│       ├── backend-dev.md       # 后端开发
│       ├── test-engineer.md     # 测试工程师（先写测试）
│       └── code-reviewer.md     # 代码审查员（只读）
└── scripts/
    └── setup-worktrees.sh       # 一键创建隔离 worktree
```

## 快速开始

1. **复制到你的项目**：把 `.claude/` 目录和 `CLAUDE.md` 拷到目标项目根目录。
2. **创建 worktree 隔离**（多 agent 并行开发前必做）：
   ```bash
   bash scripts/setup-worktrees.sh
   ```
   会创建 `../<项目名>-fe`（前端）、`../<项目名>-be`（后端）两个 worktree 和对应分支。
3. **启动 Lead 会话**：在项目根目录启动编码 CLI，进入 plan 模式，然后下需求：
   ```
   /plan
   > 开发用户登录功能。用 architect 出方案，frontend-dev 和 backend-dev
     并行实现，test-engineer 写集成测试，code-reviewer 审查后我来确认合并。
   ```
4. **监控进度**：用任务列表视图（Ctrl+T）查看各 teammate 领取和完成任务的情况。

## 核心原则（务必遵守）

- **先 Plan 后动手**：Lead 在 plan 模式下完成拆解，方案经你确认后才开始写代码。
- **文件隔离**：任何两个会写代码的 agent 不得共享工作目录，一律用 worktree/分支隔离。
- **小任务粒度**：每个开发 agent 领取的任务必须是一个可独立验证的交付物。
- **人工确认点**：合并主干前必须由你人工确认，agent 不得自行合入 main。
- **失败回路**：测试失败或审查不通过，任务退回对应开发 agent 修复，循环直到通过。

## 角色一览

| 角色            | 权限  | 职责                 |
| ------------- | --- | ------------------ |
| Lead（主会话）     | 全部  | 拆解任务、分配、跟踪、汇总      |
| architect     | 只读  | 设计方案、定义模块边界和接口契约   |
| frontend-dev  | 写代码 | 在 fe worktree 实现前端 |
| backend-dev   | 写代码 | 在 be worktree 实现后端 |
| test-engineer | 写测试 | 先写测试用例，再跑集成测试      |
| code-reviewer | 只读  | 审查质量、安全、可维护性       |

## 自定义

- 换模型：在各角色 md 的 frontmatter 加 `model: <模型名>`，关键角色用强模型，编码角色可用便宜模型。
- 加角色：复制任意 `.md` 到 `.claude/agents/` 改名即可，项目级优先于用户级（`~/.claude/agents/`）。
- 单 agent 起步：不开启团队模式时，这些角色文件会作为普通 subagent 串行调用，同样有效。

---

## 当前项目：婴儿喂养 App V1.0

基于 PRD `婴儿喂养app需求文档.md`（V1.0）的移动端 H5 MVP：快速喂养记录、基础统计、
生长数据录入与自身趋势、宝宝档案（最多 5 个）、CSV 导出、弱网本地暂存与自动同步。

- **技术栈**：Vue 3 + Vite + TypeScript + Vant 4 + ECharts；Spring Boot 3.3.5 + Java 21 +
  Gradle 8.7 + MyBatis-Plus + Flyway + MySQL 8 + Redis 5。
- **接口契约与数据模型**：`docs/architecture/v1.0-baby-feeding.md`（开发前必读）。
- **代码布局**：`frontend/`（feat/frontend worktree）、`backend/`（feat/backend worktree）、
  `tests/`（集成工作区）、`docs/`（架构与测试文档）。

### 本机前置条件

- JDK 21（`C:\Program Files\Java\jdk-21.0.12.1`）；**Gradle 命令必须显式设置 JAVA_HOME**，
  否则会落到 JDK 8。
- MySQL 8.0：`127.0.0.1:3306`，本机开发账号 root/root123；数据库 `zz_dev`、`zz_test`、`zz_e2e`。
- Redis 5.0：`127.0.0.1:6379`，密码 root123；测试用 DB 15，E2E 用 DB 14。
- 无 Docker；所有服务使用本机进程。

### 本地运行

```bash
# 后端（示例；实际以 backend/README.md 为准）
export JAVA_HOME="/c/Program Files/Java/jdk-21.0.12.1"
export PATH="$JAVA_HOME/bin:$PATH"
export DB_PASSWORD=root123 REDIS_PASSWORD=root123
cd backend && ./gradlew bootRun

# 前端（实际以 frontend/README.md 为准）
cd frontend && npm ci && npm run dev
```

- 前端 dev `http://127.0.0.1:5173`，`/api` 代理到后端 `http://127.0.0.1:8080`。
- 提交/合并默认只在本地，**不自动 push**；合并 master 必须人工确认。

