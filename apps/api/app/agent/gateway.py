"""模型网关：统一 OpenAI 兼容流式接口；mock 提供方用于无 Key 演示。"""

import json
import time
from collections.abc import Iterator
from typing import Any

import httpx

from ..config import settings


class GatewayError(Exception):
    pass


def stream_completion(system: str, user: str) -> Iterator[str]:
    """逐 token 产出模型输出文本。"""
    provider = settings.model_provider.lower()
    if provider == "mock":
        yield from _mock_stream(system, user)
        return
    yield from _openai_stream(system, user)


def _openai_stream(system: str, user: str) -> Iterator[str]:
    url = settings.openai_base_url.rstrip("/") + "/chat/completions"
    headers = {"Authorization": f"Bearer {settings.openai_api_key}"}
    body = {
        "model": settings.model_name,
        "stream": True,
        "temperature": 0,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    try:
        with httpx.Client(timeout=180) as client:
            with client.stream("POST", url, headers=headers, json=body) as resp:
                if resp.status_code != 200:
                    resp.read()
                    raise GatewayError(
                        f"模型接口返回 {resp.status_code}：{resp.text[:300]}"
                    )
                for line in resp.iter_lines():
                    if not line.startswith("data:"):
                        continue
                    payload = line[5:].strip()
                    if payload == "[DONE]":
                        break
                    try:
                        delta = json.loads(payload)["choices"][0].get("delta", {})
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue
                    text = delta.get("content")
                    if text:
                        yield text
    except httpx.HTTPError as e:
        raise GatewayError(f"无法连接模型接口：{e}") from None


# --------------------------------------------------------------------------
# mock 提供方：根据 schema 上下文生成一个合理的演示回答
# --------------------------------------------------------------------------

def _mock_stream(system: str, user: str) -> Iterator[str]:
    ctx = _mock_pick_table(user)
    text = _mock_answer_text(ctx)
    for i in range(0, len(text), 6):
        yield text[i : i + 6]
        time.sleep(0.015)


def _mock_pick_table(user_prompt: str) -> dict[str, Any]:
    """从提示词里的 schema 段落解析出第一个表和可用的列。"""
    tables: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    for line in user_prompt.splitlines():
        if line.startswith("表 "):
            name = line.split()[1].strip()
            current = {"name": name, "columns": []}
            tables.append(current)
        elif current is not None and line.strip().startswith("- "):
            col = line.strip()[2:].split("(")[0].strip()
            ctype = line.split("(")[1].rstrip(")") if "(" in line else "VARCHAR"
            current["columns"].append({"name": col, "type": ctype.upper()})
    if not tables:
        tables = [{"name": "unknown_table", "columns": []}]

    table = tables[0]
    numeric = [
        c for c in table["columns"] if c["type"] in ("BIGINT", "INTEGER", "DOUBLE", "FLOAT", "DECIMAL", "HUGEINT", "REAL", "INT", "SMALLINT", "TINYINT", "NUMERIC")
    ]
    categorical = [
        c
        for c in table["columns"]
        if c not in numeric
        and (
            c["type"].startswith("VARCHAR")
            or "CHAR" in c["type"]
            or "TEXT" in c["type"]
            or c["type"] in ("STRING",)
        )
    ]
    table["numeric"] = numeric
    table["categorical"] = categorical
    return table


def _q(ident: str) -> str:
    return '"' + ident.replace('"', '""') + '"'


def _mock_answer_text(table: dict[str, Any]) -> str:
    name = table["name"]
    numeric = table["numeric"]
    categorical = table["categorical"]

    if numeric and categorical:
        num, cat = numeric[0]["name"], categorical[0]["name"]
        sql = (
            f"SELECT {_q(cat)} AS 维度, SUM({_q(num)}) AS 汇总值 "
            f"FROM {_q(name)} GROUP BY 1 ORDER BY 2 DESC LIMIT 20"
        )
        explanation = (
            f"这是内置演示模式（未配置模型 API Key），用于验证产品闭环。\n\n"
            f"针对你的问题，我基于表 {name} 做了聚合分析：按 {cat} 分组，"
            f"对 {num} 求和，并按结果降序排列。配置真实模型后，同样的提问会得到"
            f"经过语义理解的 SQL 与解读。"
        )
        chart_hint = "bar"
    elif numeric:
        num = numeric[0]["name"]
        sql = f"SELECT * FROM {_q(name)} LIMIT 20"
        explanation = (
            f"这是内置演示模式。表 {name} 中未识别到文本维度列，"
            f"先返回前 20 行原始数据供你预览 {num} 等数值字段。"
        )
        chart_hint = "table"
    else:
        sql = f"SELECT * FROM {_q(name)} LIMIT 20"
        explanation = (
            f"这是内置演示模式。表 {name} 中没有识别到数值列，"
            f"先返回前 20 行原始数据供你预览字段内容。"
        )
        chart_hint = "table"

    payload = json.dumps(
        {"sql": sql, "chart_hint": chart_hint}, ensure_ascii=False
    )
    return f"{explanation}\n\n```json\n{payload}\n```"
