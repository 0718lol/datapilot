import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .config import settings
from .db import Base, SessionLocal, engine
from .engine.duckdb_manager import duck_manager
from .models import DataSource, User
from .auth import hash_password
from .routers import auth, conversations, dashboards, datasources, evals, settings as settings_router


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name, version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            o.strip() for o in settings.cors_origins.split(",") if o.strip()
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth.router)
    app.include_router(datasources.router)
    app.include_router(conversations.router)
    app.include_router(dashboards.router)
    app.include_router(evals.router)
    app.include_router(settings_router.router)

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    @app.get("/")
    def root():
        """根路径友好提示：这里是 API 服务，页面在前端端口。"""
        return {
            "app": "DataPilot API",
            "hint": "这里是后端 API，没有网页。请打开前端界面：",
            "frontend_dev": "http://localhost:5173  (npm run dev)",
            "frontend_docker": "http://localhost:8080  (docker compose up)",
            "api_docs": "/docs",
        }

    @app.on_event("startup")
    def startup():
        _init_storage()
        _seed()

    return app


def _init_storage() -> None:
    Path(settings.data_dir).mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    _migrate()


def _migrate() -> None:
    """轻量迁移：create_all 只建新表不加列，已有表缺的列在此补齐。

    达到 Alembic 引入门槛前的过渡方案。
    """
    import sqlalchemy

    insp = sqlalchemy.inspect(engine)
    if "conversations" in insp.get_table_names():
        cols = [c["name"] for c in insp.get_columns("conversations")]
        if "archived_at" not in cols:
            col_type = "TIMESTAMP" if engine.dialect.name == "postgresql" else "DATETIME"
            with engine.begin() as conn:
                conn.execute(
                    text(f"ALTER TABLE conversations ADD COLUMN archived_at {col_type}")
                )


def _seed() -> None:
    db = SessionLocal()
    try:
        if db.query(User).filter_by(username=settings.admin_username).first() is None:
            db.add(
                User(
                    username=settings.admin_username,
                    password_hash=hash_password(settings.admin_password),
                    role="admin",
                )
            )
            db.commit()
        # 重启后重新注册 CSV 数据源视图（DuckDB 视图不持久化）
        for ds in db.query(DataSource).filter(DataSource.kind == "csv").all():
            if ds.file_path and Path(ds.file_path).exists():
                try:
                    duck_manager.register_csv(ds.name, ds.file_path)
                except Exception:  # noqa: BLE001 启动时单个数据源失败不阻塞
                    continue
    finally:
        db.close()


app = create_app()
