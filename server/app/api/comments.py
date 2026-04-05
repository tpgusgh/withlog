from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.group import Comment
from app.models.user import User
from app.schemas.group import CommentIn

router = APIRouter()

@router.post('/post/{post_id}')
def create_comment(post_id: int, payload: CommentIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    comment = Comment(post_id=post_id, user_id=current_user.id, content=payload.content)
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return {'id': comment.id, 'content': comment.content}

@router.get('/post/{post_id}')
def list_comments(post_id: int, db: Session = Depends(get_db)):
    comments = db.query(Comment).filter(Comment.post_id == post_id).order_by(Comment.created_at.asc()).all()
    return [{'id': c.id, 'content': c.content} for c in comments]
