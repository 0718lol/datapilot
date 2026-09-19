"""仪表盘：对话中保存的图表，打开时重新执行 SQL 取最新数据。"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..agent import charts, pipeline
from ..auth import get_current_user
from ..db import get_db
from ..engine.connectors import connector_for_datasource
from ..engine.duckdb_manager import QueryError
from ..models import DashboardItem, DataSource, User
from ..schemas import DashboardItemOut, DashboardSaveRequest
from .datasources import ds_to_ctx, get_datasource_or_404

router = APIRouter(prefix="/api/dashboards", tags=["dashboards"])


@router.get("", response_model=list[DashboardItemOut])
def list_items(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    items = db.query(DashboardItem).order_by(DashboardItem.created_at.asc()).all()
    out = []
    for it in items:
        ds = db.get(DataSource, it.datasource_id)
        out.append(
            DashboardItemOut(
                id=it.id,
                title=it.title,
                datasource_id=it.datasource_id,
                datasource_name=ds.name if ds else "(已删除)",
                sql=it.sql,
                chart_hint=it.chart_hint,
                created_at=it.created_at.isoformat(),
            )
        )
    return out


@router.post("", response_model=DashboardItemOut)
def save_item(body: DashboardSaveRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ds = get_datasource_or_404(db, body.datasource_id)
    connector = connector_for_datasource(ds_to_ctx(ds))
    try:
        sql = pipeline._guard_sql(body.sql, connector.dialect)
    except QueryError as e:
        raise HTTPException(status_code=400, detail=f"SQL 不合法：{e}") from None

    item = DashboardItem(
        title=body.title.strip()[:100] or "未命名图表",
        datasource_id=ds.id,
        sql=sql,
        chart_hint=body.chart_hint if body.chart_hint in ("bar", "line", "table") else "table",
        created_by=user.username,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return DashboardItemOut(
        id=item.id,
        title=item.title,
        datasource_id=item.datasource_id,
        datasource_name=ds.name,
        sql=item.sql,
        chart_hint=item.chart_hint,
        created_at=item.created_at.isoformat(),
    )


@router.delete("/{item_id}")
def delete_item(item_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    item = db.query(DashboardItem).filter_by(id=item_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="仪表盘卡片不存在")
    db.delete(item)
    db.commit()
    return {"ok": True}


@router.get("/{item_id}/data")
def item_data(item_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    item = db.query(DashboardItem).filter_by(id=item_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="仪表盘卡片不存在")
    ds = db.get(DataSource, item.datasource_id)
    if ds is None:
        raise HTTPException(status_code=400, detail="该图表的数据源已删除")

    connector = connector_for_datasource(ds_to_ctx(ds))
    try:
        sql = pipeline._guard_sql(item.sql, connector.dialect)
        columns, rows = connector.execute_select(sql)
    except QueryError as e:
        raise HTTPException(status_code=400, detail=str(e)) from None

    spec: dict[str, Any] = charts.build_chart(columns, rows, item.chart_hint)
    return {
        "columns": columns,
        "rows": rows[:200],
        "row_count": len(rows),
        "chartSpec": spec,
    }
