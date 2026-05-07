from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..auth import get_current_user
from ..routers.companies import _get_company_with_access
from .. import models
from ..services.ai_service import process_chat

router = APIRouter(prefix="/companies", tags=["chatbot"])

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: list[ChatMessage]

class ChatResponse(BaseModel):
    reply: str

@router.post("/{company_id}/chat", response_model=ChatResponse)
def handle_chat(
    company_id: int,
    payload: ChatRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Ensure user has access to this company
    _get_company_with_access(db, company_id, current_user)
    
    # Process the chat via ai_service
    messages_dicts = [{"role": m.role, "content": m.content} for m in payload.messages]
    
    reply_text = process_chat(
        db=db, 
        company_id=company_id, 
        messages=messages_dicts, 
        user_id=current_user.id
    )
    
    return ChatResponse(reply=reply_text)
