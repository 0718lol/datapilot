"""分析管线：读取表结构 → 生成 SQL → 安全校验 → 执行 → 出图。

以生成器形式逐阶段产出事件字典，由路由层转换为 SSE 流；
collect_answer 提供非流式的完整结果（评测模块复用同一管线）。
"""

import json
import re
from collections.abc import Iterator
from typing import Any

import sqlglot
from sqlglot import exp

from ..config import settings
from ..engine.connectors import Connector, connector_for_datasource
from ..engine.duckdb_manager import QueryError
from . import charts, gateway

STAGES = {
    "schema": "读取表结构",
    "generate": "生成 SQL",
    "review": "安全校验",
    "execute": "执行查询",
    "visualize": "构建图表",
}

# 不同 sqlglot 版本的节点类名略有差异，按名称安全获取
_FORBIDDEN_NODES = tuple(
    node
    for node in (
        getattr(exp, name, None)
        for name in (
            "Insert", "Update", "Delete", "Create", "Drop", "Alter",
            "Attach", "Detach", "Copy", "Command", "Pragma", "Set",
            "Use", "Into", "Merge", "TruncateTable",
        )
    )
    if node is not None
)


class PipelineError(Exception):
    def __init__(self, stage: str, message: str) -> None:
        super().__init__(message)
        self.stage = stage
        self.message = message


def run_question(
    question: str,
    datasource: dict[str, Any],
    history: list[dict[str, str]] | None = None,
) -> Iterator[dict[str, Any]]:
    """datasource: {id, name, kind, connection_json, schema_json}"""

    yield {"type": "status", "stage": "schema", "label": STAGES["schema"]}
    connector: Connector | None = None
    try:
        connector = connector_for_datasource(datasource)
        tables = connector.tables() or _tables_from_json(datasource)
    except QueryError as e:
        raise PipelineError("schema", str(e)) from None

    yield {"type": "status", "stage": "generate", "label": STAGES["generate"]}
    system = _system_prompt()
    user = _user_prompt(question, _schema_context(tables), history)
    buffer = ""
    try:
        for token in gateway.stream_completion(system, user):
            buffer += token
            yield {"type": "token", "text": token}
    except gateway.GatewayError as e:
        raise PipelineError("generate", str(e)) from None

    explanation, sql_raw, chart_hint = _parse_response(buffer)
    if not sql_raw:
        raise PipelineError("generate", "模型未能产出 SQL，请稍后重试或换个问法。")

    yield {"type": "status", "stage": "review", "label": STAGES["review"]}
    try:
        sql = _guard_sql(sql_raw, connector.dialect)
    except QueryError as e:
        raise PipelineError("review", str(e)) from None
    yield {"type": "sql", "sql": sql, "explanation": explanation}

    yield {"type": "status", "stage": "execute", "label": STAGES["execute"]}
    try:
        columns, rows = connector.execute_select(sql)
    except QueryError as e:
        raise PipelineError("execute", str(e)) from None

    yield {
        "type": "result",
        "columns": columns,
        "rows": rows[:50],
        "row_count": len(rows),
    }

    yield {"type": "status", "stage": "visualize", "label": STAGES["visualize"]}
    spec = charts.build_chart(columns, rows, chart_hint)
    yield {"type": "chart", "spec": spec}


def collect_answer(
    question: str, datasource: dict[str, Any], history: list[dict[str, str]] | None = None
) -> dict[str, Any]:
    """非流式执行完整管线，返回最终结果（评测模块使用）。"""
    result: dict[str, Any] = {
        "explanation": "",
        "sql": None,
        "columns": [],
        "rows": [],
        "row_count": 0,
        "chartSpec": None,
        "error": None,
    }
    try:
        for event in run_question(question, datasource, history):
            if event["type"] == "sql":
                result["sql"] = event["sql"]
                result["explanation"] = event["explanation"]
            elif event["type"] == "result":
                result["columns"] = event["columns"]
                result["rows"] = event["rows"]
                result["row_count"] = event["row_count"]
            elif event["type"] == "chart":
                result["chartSpec"] = event["spec"]
    except PipelineError as e:
        result["error"] = {"stage": e.stage, "message": e.message}
    return result


# --------------------------------------------------------------------------
# 提示词
# --------------------------------------------------------------------------

def _tables_from_json(datasource: dict[str, Any]) -> list[dict[str, Any]]:
    return json.loads(datasource.get("schema_json") or "[]")


def _schema_context(tables: list[dict[str, Any]]) -> str:
    blocks = []
    for t in tables:
        cols = "\n".join(f"- {c['name']} ({c['type']})" for c in t.get("columns", []))
        blocks.append(f"表 {t['name']}\n{cols}")
    return "\n\n".join(blocks)


def _system_prompt() -> str:
    return (
        "你是数据分析助手 DataPilot。用户会提供数据库中的表结构和分析问题，"
        "你的任务是基于表结构写出正确的 SQL 并简要解释思路。\n"
        "硬性要求：\n"
        "1. 只允许生成一条只读的 SELECT/WITH 查询，绝不生成任何修改数据的语句。\n"
        "2. 含中文或特殊字符的表名、列名必须用双引号包裹。\n"
        "3. 聚合结果应配合 ORDER BY，需要时使用 LIMIT 控制行数。\n"
        "4. 输出格式：先用不超过 120 字的中文说明分析思路；然后单独一行输出 ```json 围栏代码块，"
        '内容为 {"sql": "生成的SQL", "chart_hint": "bar|line|table"}。\n'
        "5. chart_hint 选择：时间序列用 line，类别对比用 bar，其余用 table。"
    )


def _user_prompt(
    question: str, schema_ctx: str, history: list[dict[str, str]] | None
) -> str:
    parts = [f"# 可用表结构\n{schema_ctx}"]
    if history:
        turns = "\n".join(f"{h['role']}: {h['content']}" for h in history[-6:])
        parts.append(f"# 近期对话\n{turns}")
    parts.append(f"# 分析问题\n{question}")
    return "\n\n".join(parts)


# --------------------------------------------------------------------------
# 响应解析与 SQL 防护
# --------------------------------------------------------------------------

def _parse_response(text: str) -> tuple[str, str | None, str | None]:
    """解析"说明文字 + ```json 围栏"的模型输出。"""
    explanation = text
    sql = None
    hint = None

    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    candidate = None
    if fence:
        candidate = fence.group(1)
        explanation = text[: fence.start()].strip()
    else:
        # 兜底：取最后一个包含 "sql" 键的 JSON 对象
        for match in re.finditer(r"\{[^{}]*\"sql\"[^{}]*\}", text, re.DOTALL):
            candidate = match.group(0)
        if candidate:
            explanation = text[: text.rfind(candidate)].strip()

    if candidate:
        try:
            obj = json.loads(candidate)
            sql = (obj.get("sql") or "").strip() or None
            hint = obj.get("chart_hint")
        except json.JSONDecodeError:
            sql = None
    return explanation, sql, hint


def _guard_sql(sql: str, dialect: str = "duckdb") -> str:
    """安全防护：单条语句、只读 SELECT、强制行数上限。"""
    sql = sql.strip().rstrip(";").strip()
    if not sql:
        raise QueryError("SQL 为空。")
    try:
        statements = sqlglot.parse(sql, read=dialect)
    except sqlglot.errors.ParseError as e:
        raise QueryError(f"SQL 语法解析失败：{e}") from None
    if len(statements) != 1 or statements[0] is None:
        raise QueryError("只允许执行单条查询语句。")
    tree = statements[0]
    if not isinstance(tree, exp.Select):
        raise QueryError("只允许 SELECT 查询语句。")
    for node in tree.walk():
        if isinstance(node, _FORBIDDEN_NODES):
            raise QueryError("检测到非只读操作，已拦截。")
    if tree.args.get("limit") is None:
        sql = f"SELECT * FROM ({sql}) AS _guarded LIMIT {settings.max_rows}"
    return sql
