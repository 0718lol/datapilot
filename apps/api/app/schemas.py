"""API 请求/响应的 Pydantic 模型。"""

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str


class MeResponse(BaseModel):
    username: str
    role: str


class ColumnInfo(BaseModel):
    name: str
    type: str


class TableInfo(BaseModel):
    name: str
    columns: list[ColumnInfo]


class DataSourceOut(BaseModel):
    id: str
    name: str
    original_name: str
    kind: str  # csv | database
    row_count: int
    tables: list[TableInfo]
    created_at: str


class DatabaseConnectRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    type: str  # postgres | mysql | sqlite
    host: str = ""
    port: int | None = None
    database: str
    username: str = ""
    password: str = ""
    connect_now: bool = True  # False 表示仅测试不保存


class ConversationCreate(BaseModel):
    title: str | None = None


class ConversationOut(BaseModel):
    id: str
    title: str
    created_at: str


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    datasource_id: str | None = None  # 为空则用第一个数据源


class EvalItemCreate(BaseModel):
    datasource_id: str
    question: str = Field(min_length=1, max_length=2000)
    gold_sql: str = Field(min_length=1)
    note: str = ""


class EvalRunRequest(BaseModel):
    datasource_id: str
