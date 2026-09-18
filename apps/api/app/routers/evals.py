"""评测模块 —— DataPilot 的差异化能力。

在企业私有化交付中，客户最关心的是"这套系统在我的数据上到底准不准"。
评测集（黄金问题 + 标准 SQL）让部署前后都能量化回答质量：

1. 部署前：用客户真实问题建评测集，出准确率报告，作为验收依据；
2. 迭代中：改提示词 / 换模型 / 升级检索后回归跑分，防止效果退化（ChatBI 的 CI）。

判定方式 M0 采用"结果集等价"：生成的 SQL 与黄金 SQL 的结果
（列数 + 行多重集）一致即通过，不要求 SQL 文本一致。
"""

import json  # noqa: F401  预留：评测项导入导出
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..agent import pipeline
from ..auth import get_current_user
from ..db import get_db
from ..engine.connectors import connector_for_datasource
from ..engine.duckdb_manager import QueryError
from ..models import DataSource, EvalItem, User
from ..schemas import EvalItemCreate, EvalRunRequest
from .datasources import get_datasource_or_404

router = APIRouter(prefix="/api/evals", tags=["evals"])


@router.get("")
def list_eval_items(datasource_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    get_datasource_or_404(db, datasource_id)
    items = (
        db.query(EvalItem)
        .filter(EvalItem.datasource_id == datasource_id)
        .order_by(EvalItem.created_at.asc())
        .all()
    )
    return [
        {
            "id": i.id,
            "question": i.question,
            "gold_sql": i.gold_sql,
            "note": i.note,
            "created_at": i.created_at.isoformat(),
        }
        for i in items
    ]


@router.post("")
def create_eval_item(body: EvalItemCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    ds = get_datasource_or_404(db, body.datasource_id)
    # 黄金 SQL 也走安全防护，保证跑分时只读
    connector = connector_for_datasource(_ds_ctx(ds))
    try:
        pipeline._guard_sql(body.gold_sql, connector.dialect)
    except QueryError as e:
        raise HTTPException(status_code=400, detail=f"黄金 SQL 不合法：{e}") from None
    item = EvalItem(
        datasource_id=body.datasource_id,
        question=body.question,
        gold_sql=body.gold_sql.strip(),
        note=body.note[:200],
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"id": item.id, "ok": True}


@router.delete("/{item_id}")
def delete_eval_item(item_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    item = db.query(EvalItem).filter_by(id=item_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="评测项不存在")
    db.delete(item)
    db.commit()
    return {"ok": True}


@router.post("/run")
def run_evals(body: EvalRunRequest, db: Session = Depends(get_db), user=Depends(get_current_user)):
    ds = get_datasource_or_404(db, body.datasource_id)
    ds_ctx = _ds_ctx(ds)
    items = db.query(EvalItem).filter(EvalItem.datasource_id == ds.id).all()
    if not items:
        raise HTTPException(status_code=400, detail="该数据源还没有评测项，先添加黄金问答对")

    connector = connector_for_datasource(ds_ctx)
    results = []
    passed = 0
    for item in items:
        detail: dict[str, Any] = {"question": item.question, "gold_sql": item.gold_sql}

        # 1) 执行黄金 SQL
        try:
            gold_sql = pipeline._guard_sql(item.gold_sql, connector.dialect)
            gold_cols, gold_rows = connector.execute_select(gold_sql)
            detail["gold_row_count"] = len(gold_rows)
        except QueryError as e:
            detail.update(passed=False, failure=f"黄金 SQL 执行失败：{e}")
            results.append(detail)
            continue

        # 2) 生成并执行模型 SQL
        answer = pipeline.collect_answer(item.question, ds_ctx)
        detail["generated_sql"] = answer.get("sql")
        detail["explanation"] = answer.get("explanation", "")[:200]
        if answer.get("error"):
            detail.update(passed=False, failure=answer["error"]["message"])
            results.append(detail)
            continue

        # 3) 结果集等价比较
        ok = _results_equal(gold_cols, gold_rows, answer["columns"], answer["rows"])
        detail.update(passed=ok)
        if not ok:
            detail["failure"] = (
                f"结果不一致：黄金 {len(gold_rows)} 行 / 生成 {answer['row_count']} 行，"
                "或数值不同"
            )
        else:
            passed += 1
        results.append(detail)

    total = len(items)
    return {
        "datasource_id": ds.id,
        "total": total,
        "passed": passed,
        "accuracy": round(passed / total, 4) if total else 0,
        "items": results,
    }


def _results_equal(
    cols_a: list[str], rows_a: list[list[Any]], cols_b: list[str], rows_b: list[list[Any]]
) -> bool:
    if len(cols_a) != len(cols_b) or len(rows_a) != len(rows_b):
        return False

    def norm(row: list[Any]) -> tuple:
        out = []
        for v in row:
            if isinstance(v, float):
                v = round(v, 6)
            elif isinstance(v, bool):
                v = int(v)
            out.append(v)
        return tuple(out)

    return sorted(map(norm, rows_a)) == sorted(map(norm, rows_b))


def _ds_ctx(ds: DataSource) -> dict[str, Any]:
    return {
        "id": ds.id,
        "name": ds.name,
        "kind": ds.kind,
        "connection_json": ds.connection_json,
        "schema_json": ds.schema_json,
    }
