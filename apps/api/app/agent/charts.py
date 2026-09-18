"""根据查询结果自动构建图表规格（前端据此渲染 ECharts）。"""

import datetime as dt
from typing import Any


def build_chart(
    columns: list[str], rows: list[list[Any]], hint: str | None
) -> dict[str, Any]:
    if not rows or len(columns) < 2:
        return {"kind": "table"}

    profile = [_classify(_column_values(columns, rows, i)) for i in range(len(columns))]
    numeric_idx = [i for i, p in enumerate(profile) if p == "numeric"]
    temporal_idx = [i for i, p in enumerate(profile) if p == "temporal"]
    categorical_idx = [
        i for i, p in enumerate(profile) if p == "categorical" and i not in numeric_idx
    ]

    kind = (hint or "").lower()
    if kind not in ("bar", "line", "table"):
        kind = ""

    x: int | None = None
    y: list[int] = []
    if temporal_idx and numeric_idx and kind != "bar":
        x, y = temporal_idx[0], numeric_idx[:3]
        kind = "line"
    elif categorical_idx and numeric_idx and kind != "line":
        x, y = categorical_idx[0], numeric_idx[:2]
        kind = "bar"
    else:
        kind = "table"

    if kind == "table" or x is None:
        return {"kind": "table"}

    x_field = columns[x]
    y_fields = [columns[i] for i in y]
    data = [
        {columns[i]: row[i] for i in range(len(columns))}
        for row in rows
    ]
    if kind == "bar":
        data = sorted(data, key=lambda d: _num(d.get(y_fields[0])), reverse=True)[:20]

    return {
        "kind": kind,
        "xField": x_field,
        "yFields": y_fields,
        "data": data,
    }


def _column_values(columns: list[str], rows: list[list[Any]], idx: int) -> list[Any]:
    return [row[idx] for row in rows[:50] if row[idx] is not None]


def _classify(values: list[Any]) -> str:
    if not values:
        return "empty"
    sample = values[:20]
    if all(isinstance(v, bool) for v in sample):
        return "categorical"
    if all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in sample):
        return "numeric"
    if all(isinstance(v, str) for v in sample):
        try:
            for v in sample:
                dt.datetime.fromisoformat(v.replace("T", " ").replace("Z", ""))
            return "temporal"
        except ValueError:
            pass
        distinct = set(values)
        if len(distinct) <= max(20, len(values) // 2):
            return "categorical"
    return "text"


def _num(v: Any) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return float("-inf")
