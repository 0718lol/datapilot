import json
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..config import settings
from ..db import get_db
from ..engine.connectors import DatabaseConnector, test_connection
from ..engine.duckdb_manager import QueryError, duck_manager, sanitize_table_name
from ..models import DataSource, User
from ..schemas import ColumnInfo, DataSourceOut, DatabaseConnectRequest, TableInfo

router = APIRouter(prefix="/api/datasources", tags=["datasources"])

# 外部库连接缓存需要的最小信息（删除数据源时清理用）


def _to_out(ds: DataSource) -> DataSourceOut:
    return DataSourceOut(
        id=ds.id,
        name=ds.name,
        original_name=ds.original_name,
        kind=ds.kind,
        row_count=ds.row_count,
        tables=[TableInfo(**t) for t in json.loads(ds.schema_json or "[]")],
        created_at=ds.created_at.isoformat(),
    )


def workspace_datasources(db: Session, workspace_id: str = "default") -> list[DataSource]:
    return (
        db.query(DataSource)
        .filter(DataSource.workspace_id == workspace_id)
        .order_by(DataSource.created_at.desc())
        .all()
    )


def get_datasource_or_404(db: Session, ds_id: str) -> DataSource:
    ds = db.query(DataSource).filter_by(id=ds_id).first()
    if ds is None:
        raise HTTPException(status_code=404, detail="数据源不存在")
    return ds


@router.get("", response_model=list[DataSourceOut])
def list_datasources(db=Depends(get_db), user: User = Depends(get_current_user)):
    return [_to_out(ds) for ds in workspace_datasources(db)]


@router.post("/upload", response_model=DataSourceOut)
async def upload_csv(
    file: UploadFile = File(...),
    db=Depends(get_db),
    user: User = Depends(get_current_user),
):
    name = file.filename or "untitled.csv"
    if not name.lower().endswith((".csv", ".tsv")):
        raise HTTPException(status_code=400, detail="目前仅支持上传 CSV 文件")

    content = await file.read()
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(
            status_code=400, detail=f"文件超过 {settings.max_upload_mb}MB 限制"
        )
    if not content.strip():
        raise HTTPException(status_code=400, detail="文件内容为空")

    ds = DataSource(
        kind="csv", name=Path(name).stem, original_name=name, created_by=user.username
    )
    upload_dir = Path(settings.data_dir) / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / f"{ds.id}.csv"
    file_path.write_bytes(content)
    ds.file_path = str(file_path)

    # 视图名 = 清洗后的数据源名；重名时追加 id 片段保证唯一
    table_name = sanitize_table_name(ds.name)
    if duck_manager.view_exists(table_name):
        table_name = f"{table_name}_{ds.id[:6]}"
    ds.name = table_name

    try:
        columns, row_count = duck_manager.register_csv(ds.name, str(file_path))
    except QueryError as e:
        file_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(e)) from None

    ds.row_count = row_count
    ds.schema_json = json.dumps(
        [{"name": ds.name, "columns": columns}], ensure_ascii=False
    )
    db.add(ds)
    db.commit()
    db.refresh(ds)
    return _to_out(ds)


@router.post("/database/test")
def test_database_connection(
    body: DatabaseConnectRequest, user: User = Depends(get_current_user)
):
    if not DatabaseConnector.supports(body.type):
        raise HTTPException(status_code=400, detail=f"暂不支持的数据库类型：{body.type}")
    try:
        tables = test_connection(body.model_dump())
    except Exception as e:  # noqa: BLE001 连接失败的原因原样反馈给用户
        raise HTTPException(status_code=400, detail=f"连接失败：{e}") from None
    return {"ok": True, "tables": tables}


@router.post("/database", response_model=DataSourceOut)
def connect_database(
    body: DatabaseConnectRequest,
    db=Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not DatabaseConnector.supports(body.type):
        raise HTTPException(status_code=400, detail=f"暂不支持的数据库类型：{body.type}")
    try:
        tables = test_connection(body.model_dump())
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"连接失败：{e}") from None
    if not tables:
        raise HTTPException(status_code=400, detail="连接成功，但数据库中没有表")

    ds = DataSource(
        kind="database",
        name=body.name or body.database,
        original_name=f"{body.type}://{body.database}",
        connection_json=json.dumps(body.model_dump()),
        schema_json=json.dumps(tables, ensure_ascii=False),
        row_count=0,
        created_by=user.username,
    )
    db.add(ds)
    db.commit()
    db.refresh(ds)
    return _to_out(ds)


@router.delete("/{ds_id}")
def delete_datasource(
    ds_id: str, db=Depends(get_db), user: User = Depends(get_current_user)
):
    ds = get_datasource_or_404(db, ds_id)
    if ds.kind == "csv":
        duck_manager.drop_view(ds.name)
        Path(ds.file_path).unlink(missing_ok=True)
    db.delete(ds)
    db.commit()
    return {"ok": True}
