"""数据源连接器抽象。

所有数据源（CSV 文件、外部数据库）都实现同一个 Connector 接口，
分析管线只依赖接口，不关心底层是什么存储。

新增一种数据源只需：
1. 实现一个 BaseConnector 子类（tables + execute_select + dialect）；
2. 在 create_connector 的工厂里注册分发逻辑。
"""

import threading
from abc import ABC, abstractmethod
from typing import Any
from urllib.parse import quote_plus

import duckdb
import sqlalchemy
from sqlalchemy import create_engine, text

from .duckdb_manager import QueryError, duck_manager, sanitize_table_name


class Connector(ABC):
    """单一数据源的读写门面。dialect 用于 sqlglot 方言校验。"""

    dialect: str = "duckdb"

    @abstractmethod
    def tables(self) -> list[dict[str, Any]]:
        """返回 [{name, columns: [{name, type}]}]"""

    @abstractmethod
    def execute_select(self, sql: str) -> tuple[list[str], list[list[Any]]]:
        """执行一条已通过安全校验的 SELECT，返回 (columns, rows)。"""

    def close(self) -> None: ...


class CsvConnector(Connector):
    """本地上传的 CSV：由 DuckDB 内存引擎承载，表名 = 清洗后的数据源名。"""

    dialect = "duckdb"

    def __init__(self, table_name: str) -> None:
        self.table_name = sanitize_table_name(table_name)

    def tables(self) -> list[dict[str, Any]]:
        with duck_manager._lock:
            try:
                described = duck_manager._conn.execute(f'DESCRIBE "{self.table_name}"').fetchall()
            except duckdb.Error:
                return []
        return [{"name": self.table_name, "columns": [{"name": r[0], "type": r[1]} for r in described]}]

    def execute_select(self, sql: str) -> tuple[list[str], list[list[Any]]]:
        return duck_manager.execute_select(sql)


class DatabaseConnector(Connector):
    """外部数据库：MySQL / PostgreSQL / SQLite，经 SQLAlchemy 连接池访问。"""

    SUPPORTED = {"postgres", "mysql", "sqlite"}

    def __init__(self, connection: dict[str, Any]) -> None:
        self.connection = connection
        self._engine = create_engine(self._build_url(), pool_pre_ping=True, pool_size=5)

    @classmethod
    def supports(cls, db_type: str) -> bool:
        return db_type in cls.SUPPORTED

    def _build_url(self) -> str:
        c = self.connection
        db_type = c.get("type", "")
        if db_type == "postgres":
            return (
                f"postgresql+psycopg2://{quote_plus(c['username'])}:{quote_plus(c['password'])}"
                f"@{c['host']}:{c.get('port', 5432)}/{c['database']}"
            )
        if db_type == "mysql":
            return (
                f"mysql+pymysql://{quote_plus(c['username'])}:{quote_plus(c['password'])}"
                f"@{c['host']}:{c.get('port', 3306)}/{c['database']}?charset=utf8mb4"
            )
        if db_type == "sqlite":
            return f"sqlite:///{c['database']}"
        raise QueryError(f"暂不支持的数据库类型：{db_type}")

    @property
    def dialect(self) -> str:
        return {"postgres": "postgres", "mysql": "mysql", "sqlite": "sqlite"}[
            self.connection.get("type", "")
        ]

    def tables(self) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = []
        with self._engine.connect() as conn:
            inspector = sqlalchemy.inspect(conn)
            for table in inspector.get_table_names():
                cols = [
                    {"name": col["name"], "type": str(col["type"]).upper()}
                    for col in inspector.get_columns(table)
                ]
                result.append({"name": table, "columns": cols})
        return result

    def execute_select(self, sql: str) -> tuple[list[str], list[list[Any]]]:
        from .duckdb_manager import _jsonify

        try:
            with self._engine.connect() as conn:
                result = conn.execute(text(sql))
                columns = list(result.keys())
                rows = [list(r) for r in result.fetchall()]
        except sqlalchemy.exc.SQLAlchemyError as e:
            raise QueryError(f"查询执行失败：{str(e).splitlines()[0][:300]}") from None
        return columns, [[_jsonify(v) for v in row] for row in rows]

    def close(self) -> None:
        self._engine.dispose()


# 连接器缓存：同一数据源复用连接（远程库连接池有开销）
_cache: dict[str, Connector] = {}
_lock = threading.Lock()


def create_connector(kind: str, *, table_name: str = "", connection: dict | None = None) -> Connector:
    if kind == "csv":
        return CsvConnector(table_name)
    if kind == "database":
        conn = connection or {}
        if not DatabaseConnector.supports(conn.get("type", "")):
            raise QueryError(f"暂不支持的数据库类型：{conn.get('type')}")
        key = f"db:{conn.get('type')}:{conn.get('host')}:{conn.get('port')}:{conn.get('database')}:{conn.get('username')}"
        with _lock:
            if key not in _cache:
                _cache[key] = DatabaseConnector(conn)
            return _cache[key]
    raise QueryError(f"未知的数据源类型：{kind}")


def connector_for_datasource(ds) -> Connector:
    """按 DataSource（ORM 对象或 dict）构建（带缓存的）连接器。"""
    import json

    def field(name: str) -> Any:
        return ds[name] if isinstance(ds, dict) else getattr(ds, name)

    if field("kind") == "csv":
        return create_connector("csv", table_name=field("name"))
    return create_connector("database", connection=json.loads(field("connection_json") or "{}"))


def test_connection(connection: dict) -> list[dict[str, Any]]:
    """测试外部数据库连通性，返回表结构（不落缓存）。"""
    connector = DatabaseConnector(connection)
    try:
        return connector.tables()
    finally:
        connector.close()
