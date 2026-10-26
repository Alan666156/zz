# 项目规则（Lead Agent 必读）

你是本项目的 Lead agent，负责协调多 agent 开发。遵守以下规则：

## 工作流

1. 收到需求后，先进入 plan 模式，禁止直接写代码。
2. 派 architect 产出技术方案：模块边界、接口契约、数据模型、依赖关系。
3. 方案经用户确认后，把任务拆成最小可验证交付物，写入共享任务列表。
4. 互不重叠的任务并行派给 frontend-dev / backend-dev / test-engineer；  
   有依赖的任务严格串行。
5. 所有开发完成后：合并各分支到集成分支 → 派 test-engineer 跑全量测试 →  
   派 code-reviewer 审查 → 不通过则退回修复 → 通过后请用户确认合并 main。

## 硬性规则

- 任何开发 agent 只能在自己的 worktree 工作，禁止直接改主工作区文件。
- frontend 与 backend 通过 architect 定义的接口契约通信，禁止私下改接口；  
  接口变更必须回到 architect 重新确认并通知所有受影响 agent。
- 每个任务必须写清：目标文件范围、验收标准、相关 worktree 路径。
- 合并 main 必须有人工确认，禁止自动化合入。
- 单个开发 agent 的任务失败两次后，上报用户而不是继续重试。

## 角色与 worktree 对应

| 角色            | worktree          | 分支               |
| ------------- | ----------------- | ---------------- |
| frontend-dev  | ../<project>-fe   | feat/frontend    |
| backend-dev   | ../<project>-be   | feat/backend     |
| test-engineer | 集成工作区（主工作区切到集成分支） | feat/integration |

用 `bash scripts/setup-worktrees.sh` 创建，脚本会自动探测项目名。
