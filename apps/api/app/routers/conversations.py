import json
from collections.abc import Iterator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from ..agent import pipeline
from ..auth import get_current_user
from ..db import SessionLocal, get_db
from ..models import Conversation, Message, User, utcnow
from ..schemas import AskRequest, ConversationCreate, ConversationOut
from .datasources import get_datasource_or_404

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


@router.get("", response_model=list[ConversationOut])
def list_conversations(
    archived: bool = False,
    db=Depends(get_db),
    user: User = Depends(get_current_user),
):
    """archived=False 列活跃会话，True 列已归档会话。"""
    q = db.query(Conversation)
    q = q.filter(Conversation.archived_at.isnot(None) if archived else Conversation.archived_at.is_(None))
    rows = q.order_by(Conversation.created_at.desc()).limit(100).all()
    return [
        ConversationOut(id=c.id, title=c.title, created_at=c.created_at.isoformat())
        for c in rows
    ]


@router.post("", response_model=ConversationOut)
def create_conversation(
    body: ConversationCreate | None = None,
    db=Depends(get_db),
    user: User = Depends(get_current_user),
):
    title = (body.title if body and body.title else None) or "新的分析"
    conv = Conversation(title=title[:50], created_by=user.username)
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return ConversationOut(
        id=conv.id, title=conv.title, created_at=conv.created_at.isoformat()
    )


@router.delete("/archive/purge")
def purge_archived(db=Depends(get_db), user: User = Depends(get_current_user)):
    """彻底清空归档（不可恢复）。"""
    ids = [c.id for c in db.query(Conversation).filter(Conversation.archived_at.isnot(None)).all()]
    if ids:
        db.query(Message).filter(Message.conversation_id.in_(ids)).delete(
            synchronize_session=False
        )
        db.query(Conversation).filter(Conversation.id.in_(ids)).delete(
            synchronize_session=False
        )
        db.commit()
    return {"ok": True, "deleted": len(ids)}


@router.delete("/{conv_id}")
def delete_conversation(conv_id: str, db=Depends(get_db), user: User = Depends(get_current_user)):
    """删除 = 移入归档（软删除），可在归档中恢复或彻底删除。"""
    conv = db.query(Conversation).filter_by(id=conv_id).first()
    if conv is None:
        raise HTTPException(status_code=404, detail="会话不存在")
    if conv.archived_at is None:
        conv.archived_at = utcnow()
        db.commit()
    return {"ok": True, "archived": True}


@router.delete("/{conv_id}/permanent")
def delete_conversation_permanently(
    conv_id: str, db=Depends(get_db), user: User = Depends(get_current_user)
):
    conv = db.query(Conversation).filter_by(id=conv_id).first()
    if conv is None:
        raise HTTPException(status_code=404, detail="会话不存在")
    db.query(Message).filter(Message.conversation_id == conv_id).delete()
    db.delete(conv)
    db.commit()
    return {"ok": True}


@router.post("/{conv_id}/restore")
def restore_conversation(conv_id: str, db=Depends(get_db), user: User = Depends(get_current_user)):
    conv = db.query(Conversation).filter_by(id=conv_id).first()
    if conv is None:
        raise HTTPException(status_code=404, detail="会话不存在")
    conv.archived_at = None
    db.commit()
    return {"ok": True}


@router.delete("")
def clear_conversations(db=Depends(get_db), user: User = Depends(get_current_user)):
    """清空活跃会话 = 全部移入归档。"""
    now = utcnow()
    count = (
        db.query(Conversation)
        .filter(Conversation.archived_at.is_(None))
        .update({Conversation.archived_at: now}, synchronize_session=False)
    )
    db.commit()
    return {"ok": True, "archived": count}


@router.get("/{conv_id}/messages")
def get_messages(conv_id: str, db=Depends(get_db), user=Depends(get_current_user)):
    conv = db.query(Conversation).filter_by(id=conv_id).first()
    if conv is None:
        raise HTTPException(status_code=404, detail="会话不存在")
    rows = (
        db.query(Message)
        .filter(Message.conversation_id == conv_id)
        .order_by(Message.created_at.asc())
        .all()
    )
    return [
        {"id": m.id, "role": m.role, "content": json.loads(m.content or "{}")}
        for m in rows
    ]


@router.post("/{conv_id}/ask")
def ask(
    conv_id: str,
    body: AskRequest,
    db=Depends(get_db),
    user: User = Depends(get_current_user),
) -> StreamingResponse:
    conv = db.query(Conversation).filter_by(id=conv_id).first()
    if conv is None:
        raise HTTPException(status_code=404, detail="会话不存在")

    ds = get_datasource_or_404(db, body.datasource_id) if body.datasource_id else None
    if ds is None:
        from .datasources import workspace_datasources

        candidates = workspace_datasources(db, conv.workspace_id)
        if not candidates:
            raise HTTPException(status_code=400, detail="请先上传 CSV 或连接数据库再提问")
        ds = candidates[0]

    ds_ctx = {
        "id": ds.id,
        "name": ds.name,
        "kind": ds.kind,
        "connection_json": ds.connection_json,
        "schema_json": ds.schema_json,
    }

    history_rows = (
        db.query(Message)
        .filter(Message.conversation_id == conv_id)
        .order_by(Message.created_at.asc())
        .all()
    )
    history = []
    for m in history_rows[-8:]:
        content = json.loads(m.content or "{}")
        if m.role == "user":
            history.append({"role": "user", "content": content.get("text", "")})
        else:
            sql = content.get("sql")
            if sql:
                history.append({"role": "assistant", "content": f"SQL: {sql}"})

    user_msg = Message(
        conversation_id=conv_id,
        role="user",
        content=json.dumps({"text": body.question}, ensure_ascii=False),
    )
    if conv.title == "新的分析":
        conv.title = body.question[:30]
    db.add(user_msg)
    db.commit()

    def event_stream() -> Iterator[str]:
        events: dict[str, dict] = {}
        error: dict | None = None
        try:
            for event in pipeline.run_question(body.question, ds_ctx, history):
                events[event["type"]] = event
                yield _sse(event)
        except pipeline.PipelineError as e:
            error = {"stage": e.stage, "message": e.message}
            yield _sse({"type": "error", "stage": e.stage, "message": e.message})
        except Exception as e:  # noqa: BLE001 兜底，保证流不静默中断
            error = {"stage": "unknown", "message": f"服务内部错误：{e}"}
            yield _sse({"type": "error", "stage": "unknown", "message": str(e)})

        _persist_assistant_message(conv_id, body.question, events, error)
        yield _sse({"type": "done"})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


def _persist_assistant_message(
    conv_id: str, question: str, events: dict[str, dict], error: dict | None
) -> None:
    sql_event = events.get("sql", {})
    result = events.get("result", {})
    content = {
        "question": question,
        "explanation": sql_event.get("explanation", ""),
        "sql": sql_event.get("sql"),
        "chartSpec": events.get("chart", {}).get("spec"),
        "columns": result.get("columns", []),
        "rows": result.get("rows", []),
        "rowCount": result.get("row_count", 0),
    }
    if error:
        content["error"] = error
    db = SessionLocal()
    try:
        db.add(
            Message(
                conversation_id=conv_id,
                role="assistant",
                content=json.dumps(content, ensure_ascii=False),
            )
        )
        db.commit()
    finally:
        db.close()
