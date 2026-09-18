# DataPilot

**私有化部署的对话式数据分析 Copilot。** 上传 CSV 或连接数据库，用自然语言提问，
自动生成 SQL、执行查询、绘制图表 —— 全部数据与模型不出域。

## 功能

- **对话式分析**：流式回答（状态步骤 → 解读 → SQL → 图表 → 结果表），全程可溯源
- **双数据源**：CSV 上传（DuckDB 引擎）+ 外部数据库（PostgreSQL / MySQL / SQLite）
- **SQL 安全部**：语法树级只读校验（拦截 DDL/DML/PRAGMA/ATTACH）、强制行数上限、超时保护
- **图表**：自动推断柱状图 / 折线图 / 表格，支持全屏、下载 PNG、结果导出 CSV
- **评测验收**（差异化）：黄金问答集 → 一键准确率报告，部署前验收、迭代后回归
- **私有化**：Docker Compose 一键部署；模型走 OpenAI 兼容接口（可接 vLLM/Ollama 本地模型）
- 深浅色主题、会话管理、JWT 登录

## 快速开始

### 方式一：Docker Compose（推荐）

```bash
cp .env.example .env        # 按需修改模型配置与管理员账号
docker compose up --build
# 打开 http://localhost:8080，默认账号 admin / admin123
```

### 方式二：本地开发

```bash
# 后端（终端 1）
cd apps/api
python -m venv ../../.venv
../../.venv/Scripts/pip install -r requirements.txt   # Linux/macOS 去掉 Scripts
../../.venv/Scripts/python -m uvicorn app.main:app --port 8000

# 前端（终端 2）
cd apps/web
npm install
npm run dev        # 打开 http://localhost:5173
```

### 接入真实模型（可选）

不配置时使用内置演示模型（mock），可完整体验产品闭环。
接入真实模型只需改 `.env`：

```env
MODEL_PROVIDER=openai
OPENAI_BASE_URL=http://your-vllm-server:9997/v1   # 或 https://api.openai.com/v1
OPENAI_API_KEY=sk-xxx
MODEL_NAME=qwen2.5-32b-instruct
```

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | React 18 · TypeScript · Vite · Tailwind CSS 4 · ECharts 5 · Zustand · TanStack Query |
| 后端 | FastAPI · SQLAlchemy · DuckDB · sqlglot（SQL 防护） |
| 模型 | OpenAI 兼容接口（OpenAI / DeepSeek / Qwen / vLLM / Ollama） |
| 部署 | Docker Compose（web / api / postgres） |

## 目录结构

```
datapilot/
├── apps/web/          React 前端（工作台 / 数据源 / 评测 / 设置）
├── apps/api/          FastAPI 后端
│   └── app/
│       ├── routers/   HTTP 层
│       ├── agent/     分析管线（网关 / 管线 / 图表）
│       └── engine/    Connector 数据访问抽象
├── packages/shared/   前后端共享类型（M1 接入 OpenAPI 生成）
├── docs/ARCHITECTURE.md   架构与修改指南（改代码前必读）
└── samples/           演示数据（sales_demo.csv）
```

## 开发路线

- [x] **M0**（当前）：CSV + 数据库连接、对话分析闭环、SQL 安全部、评测模块、一键部署
- [ ] **M1**：语义层（指标口径管理）、半自动语义构建、纠错记忆、OpenAPI 类型生成、Alembic
- [ ] **M2**：仪表盘、行列级权限注入、多工作区与角色
- [ ] **M3**：交付流水线（License、升级）、审计日志

## 定位

与主流开源 ChatBI（WrenAI / SQLBot / SuperSonic 等）相比，DataPilot 的差异点在
**评测验收**（部署前量化"在你的数据上到底准不准"）和 **SQL 溯源透明度**
（每个答案可展开看到依据的表、口径与生成的 SQL）。
