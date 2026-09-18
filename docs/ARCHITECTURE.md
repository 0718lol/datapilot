# 架构说明（ARCHITECTURE）

目标：**分层清晰、依赖单向、每个模块可以被单独替换**。改任何一层之前，先读这份文档。

## 1. 分层总览

```
apps/web (React SPA)
    │  REST + SSE
    ▼
apps/api
├── routers/        HTTP 层：参数校验、权限、SSE 组装。不含业务逻辑
├── agent/          分析管线：提示词 → 生成 → 校验 → 执行 → 图表
│   ├── gateway.py    模型网关（OpenAI 兼容流式 / mock）
│   ├── pipeline.py   管线编排 + SQL 安全防护（sqlglot）
│   └── charts.py     图表规格推断
├── engine/         数据访问层：统一 Connector 抽象
│   ├── connectors.py     Connector 接口 + CSV/数据库实现 + 工厂
│   └── duckdb_manager.py DuckDB 内存引擎（CSV 承载 + 只读执行）
├── models.py       SQLAlchemy ORM（元数据 / 会话 / 评测集）
├── auth.py         JWT 认证
└── main.py         应用装配（路由注册、启动初始化）

依赖方向（严格单向）：routers → agent → engine；routers → models → db
agent 和 engine 互相之间不 import（pipeline 只用 Connector 接口）
```

## 2. 一次提问的完整流转

```
POST /api/conversations/{id}/ask
  → routers/conversations.py
      1. 鉴权、找到会话与数据源（AskRequest.datasource_id）
      2. 组装 schema 上下文 + 近期对话历史
      3. 落库用户消息
      4. 把 agent.pipeline.run_question() 的事件生成器包装为 SSE 流
  → agent/pipeline.py（逐事件产出）
      schema   : Connector.tables() 读表结构
      generate : gateway.stream_completion() 流式生成（token 事件透传）
      review   : _guard_sql() —— sqlglot 语法树级防护：
                 · 单条语句 / 仅 SELECT / 拦截 DDL·DML·PRAGMA·ATTACH
                 · 无 LIMIT 自动包裹 LIMIT 200
      execute  : Connector.execute_select()（沙箱执行）
      visualize: charts.build_chart() 推断柱状/折线/表格
  → 前端逐帧渲染：状态步骤条 → 解读文本 → SQL 折叠块 → 图表卡片 → 结果表
  → 流结束后助手消息落库（含全部中间产物，刷新页面可完整回放）
```

## 3. 关键设计决策

| 决策 | 理由 |
|---|---|
| Connector 抽象隔离一切数据源 | CSV 与远程库走同一接口；管线不感知底层方言差异，新增数据源零侵入 |
| sqlglot 做安全防护而不是正则/黑名单 | 语法树级判断无法被注释、编码、嵌套绕过；且天然支持多方言 |
| 模型输出"说明文字 + JSON 围栏" | 兼顾前端流式打字机体验和结构化解析可靠性（有兜底正则） |
| 助手消息落库为完整 JSON | 会话可回放、评测可复用同一条管线（collect_answer） |
| 评测判定用"结果集等价"而非 SQL 文本比对 | 同一问题有无数种等价 SQL 写法，比对结果才是业务想要的"对不对" |
| 连接器缓存（远程库连接池） | 避免每次提问重建 SQLAlchemy 引擎 |

## 4. 常见修改怎么做

### 新增一种数据源（如 Excel、ClickHouse、API 数据集）
1. `engine/connectors.py`：实现 `Connector` 子类（`tables` + `execute_select` + `dialect`）；
2. 在 `create_connector` 工厂注册；`models.py` 的 `DataSource.kind` 放行新值；
3. 路由层加对应的创建端点（参考 `connect_database`）。
管线、评测、前端**不需要任何改动**。

### 新增一种图表
1. `agent/charts.py`：`build_chart` 里加推断分支，输出新的 `spec.kind`；
2. 前端 `lib/echarts.ts` 的 `buildChartOption` 加对应分支；
3. `components/chat/ChartCard.tsx` 的 `KIND_META` 加名称/图标。

### 换模型 / 接私有模型
不改代码。环境变量：`MODEL_PROVIDER=openai`、`OPENAI_BASE_URL` 指向 vLLM/Ollama、
`MODEL_NAME` 即可。要求：实现 OpenAI 兼容的 `/chat/completions`（stream）。

### 调整提示词
`agent/pipeline.py` 的 `_system_prompt` / `_user_prompt`。**改完去评测页跑一遍回归**。

### 新增 API 端点
1. `schemas.py` 定义请求/响应模型；
2. `routers/` 对应文件加路由函数（鉴权：`user: User = Depends(get_current_user)`）；
3. `main.py` 注册新 router（如果是新文件）。

## 5. 评测模块（差异化能力）

```
EvalItem(question, gold_sql) ──→ POST /api/evals/run
    对每条:
      1. 黄金 SQL 过 _guard_sql 后执行 → 标准结果
      2. collect_answer() 跑完整管线 → 生成结果
      3. _results_equal(): 列数 + 行多重集比较（浮点 6 位舍入）
    → 准确率报告 + 每条明细（标准/生成 SQL 对照）
```

用法：交付前给客户出验收报告；改提示词/换模型后回归，防止效果退化。

## 6. 已知边界（M1 待办）

- 无数据库迁移工具（开发期删库重建；上线前引入 Alembic）
- 远程库连接凭据明文存库（M1 加对称加密）
- 无行列级权限注入（M3，在 `_guard_sql` 基础上扩展）
- 跨数据源 JOIN 不支持（每次提问绑定单一数据源）
- 评测判定仅结果集等价（M1 支持部分匹配/口径说明）
