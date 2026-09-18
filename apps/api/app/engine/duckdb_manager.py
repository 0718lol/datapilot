"""DuckDB 引擎管理：数据源注册为视图，提供受控的只读查询。"""

import decimal
import datetime as dt
import re
import threading
from pathlib import Path
from typing import Any

import duckdb


class QueryError(Exception):
    """SQL 校验或执行失败。"""


def sanitize_table_name(stem: str) -> str:
    """把文件名清洗成合法的 DuckDB 标识符（保留中文）。"""
    name = re.sub(r"[^\w\u4e00-\u9fff]+", "_", stem).strip("_")
    if not name:
        name = "table"
    if name[0].isdigit():
        name = f"t_{name}"
    return name


class DuckManager:
    def __init__(self) -> None:
        self._conn = duckdb.connect(":memory:")
        self._lock = threading.RLock()

    # ---------- 数据源管理 ----------

    def view_exists(self, name: str) -> bool:
        with self._lock:
            row = self._conn.execute(
                "SELECT COUNT(*) FROM information_schema.tables "
                "WHERE table_schema = 'main' AND table_name = ?",
                [name],
            ).fetchone()
        return bool(row and row[0])

    def register_csv(self, table_name: str, file_path: str | Path) -> tuple[list[dict], int]:
        """把 CSV 注册为以 table_name 命名的视图，返回 (columns, row_count)。"""
        path = Path(file_path).resolve().as_posix().replace("'", "''")
        view = sanitize_table_name(table_name)
        with self._lock:
            try:
                self._conn.execute(
                    f'CREATE OR REPLACE VIEW "{view}" AS '
                    f"SELECT * FROM read_csv_auto('{path}', header=true)"
                )
                described = self._conn.execute(f'DESCRIBE "{view}"').fetchall()
                columns = [{"name": row[0], "type": row[1]} for row in described]
                row_count = self._conn.execute(f'SELECT COUNT(*) FROM "{view}"').fetchone()[0]
            except duckdb.Error as e:
                raise QueryError(f"CSV 解析失败：{e}") from None
        return columns, int(row_count)

    def drop_view(self, table_name: str) -> None:
        with self._lock:
            self._conn.execute(
                f'DROP VIEW IF EXISTS "{sanitize_table_name(table_name)}"'
            )

    # ---------- 查询 ----------

    def execute_select(self, sql: str) -> tuple[list[str], list[list[Any]]]:
        with self._lock:
            try:
                cursor = self._conn.cursor()
                cursor.execute(sql)
                columns = [d[0] for d in cursor.description]
                rows = [list(r) for r in cursor.fetchall()]
            except duckdb.Error as e:
                raise QueryError(f"查询执行失败：{e}") from None
        return columns, [[_jsonify(v) for v in row] for row in rows]


def _jsonify(v: Any) -> Any:
    if v is None or isinstance(v, (bool, int, str)):
        return v
    if isinstance(v, float):
        return v if v == v and v not in (float("inf"), float("-inf")) else str(v)
    if isinstance(v, decimal.Decimal):
        return float(v)
    if isinstance(v, (dt.datetime, dt.date, dt.time)):
        return v.isoformat(sep=" " if isinstance(v, dt.datetime) else "T")
    if isinstance(v, dt.timedelta):
        return str(v)
    return str(v)


duck_manager = DuckManager()
