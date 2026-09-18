import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import Base, SessionLocal, engine
from .engine.duckdb_manager import duck_manager
from .models import DataSource, User
from .auth import hash_password
from .routers import auth, conversations, datasources, evals, settings as settings_router


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
    app.include_router(evals.router)
    app.include_router(settings_router.router)

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    @app.on_event("startup")
    def startup():
        _init_storage()
        _seed()

    return app


def _init_storage() -> None:
    Path(settings.data_dir).mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)


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
