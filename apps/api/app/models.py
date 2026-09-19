from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def gen_id() -> str:
    import uuid

    return uuid.uuid4().hex


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=gen_id)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    role: Mapped[str] = mapped_column(String(16), default="admin")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class DataSource(Base):
    __tablename__ = "datasources"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=gen_id)
    name: Mapped[str] = mapped_column(String(128))
    original_name: Mapped[str] = mapped_column(String(256))
    # csv: 本地上传文件；database: 外部数据库连接
    kind: Mapped[str] = mapped_column(String(16), default="csv")
    file_path: Mapped[str] = mapped_column(String(512), default="")
    connection_json: Mapped[str] = mapped_column(Text, default="{}")
    # 统一的结构描述: [{name: 表名, columns: [{name, type}]}]
    schema_json: Mapped[str] = mapped_column(Text, default="[]")
    row_count: Mapped[int] = mapped_column(Integer, default=0)
    workspace_id: Mapped[str] = mapped_column(String(32), default="default", index=True)
    created_by: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class EvalItem(Base):
    """评测集：黄金问题 + 标准答案 SQL（产品的差异化能力基础）。"""

    __tablename__ = "eval_items"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=gen_id)
    datasource_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("datasources.id", ondelete="CASCADE"), index=True
    )
    question: Mapped[str] = mapped_column(Text)
    gold_sql: Mapped[str] = mapped_column(Text)
    note: Mapped[str] = mapped_column(String(256), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class DashboardItem(Base):
    """仪表盘卡片：保存 SQL + 图表配置（非数据快照），打开时重新执行取最新数据。"""

    __tablename__ = "dashboard_items"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=gen_id)
    title: Mapped[str] = mapped_column(String(128))
    datasource_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("datasources.id", ondelete="CASCADE"), index=True
    )
    sql: Mapped[str] = mapped_column(Text)
    chart_hint: Mapped[str] = mapped_column(String(16), default="bar")
    created_by: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=gen_id)
    title: Mapped[str] = mapped_column(String(128), default="新的分析")
    workspace_id: Mapped[str] = mapped_column(String(32), default="default", index=True)
    created_by: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    # 删除 = 归档（软删除）；NULL 为活跃，非 NULL 为已归档
    archived_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=gen_id)
    conversation_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("conversations.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(16))  # user | assistant
    content: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
