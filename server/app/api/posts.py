from datetime import datetime, timedelta
from pathlib import Path
from fastapi import APIRouter, Depends, Form, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.group import Slot, Post, Like
from app.models.user import User

router = APIRouter()
UPLOAD_DIR = Path('uploads')
UPLOAD_DIR.mkdir(exist_ok=True)

@router.post('/slot/{slot_id}')
async def upload_post(
    slot_id: int,
    file: UploadFile = File(...),
    media_type: str = Form(...),
    is_muted: bool = Form(False),
    caption_text: str = Form(''),
    text_x: float = Form(0.08),
    text_y: float = Form(0.1),
    text_color: str = Form('#FFFFFF'),
    text_size: int = Form(32),
    filter_name: str = Form('none'),
    music_name: str = Form('none'),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    slot = db.query(Slot).filter(Slot.id == slot_id).first()
    if not slot:
        raise HTTPException(status_code=404, detail='Slot not found')
    open_at = datetime.fromisoformat(slot.open_at)
    close_at = open_at + timedelta(hours=1)
    if slot.close_at != close_at.isoformat() or slot.status != ('open' if datetime.now() < close_at else 'closed'):
        slot.close_at = close_at.isoformat()
        slot.status = 'open' if datetime.now() < close_at else 'closed'
        db.add(slot)
        db.commit()
    if datetime.now() > close_at:
        raise HTTPException(status_code=400, detail='Upload window closed')

    out = UPLOAD_DIR / f"{slot_id}_{current_user.id}_{file.filename}"
    out.write_bytes(await file.read())
    public_url = f"/uploads/{out.name}"

    post = db.query(Post).filter(Post.slot_id == slot_id, Post.user_id == current_user.id).first()
    if post:
        raise HTTPException(status_code=400, detail='이번 시간에는 이미 업로드했어요.')

    post = Post(group_id=slot.group_id, slot_id=slot_id, user_id=current_user.id, media_type=media_type, file_url=public_url)
    db.add(post)
    post.media_type = media_type
    post.caption_text = caption_text
    post.text_x = text_x
    post.text_y = text_y
    post.text_color = text_color
    post.text_size = text_size
    post.filter_name = filter_name
    post.music_name = music_name
    post.file_url = public_url
    db.commit()
    db.refresh(post)
    return {'id': post.id, 'file_url': post.file_url, 'is_muted': is_muted}

@router.post('/{post_id}/like')
def like_post(post_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    like = db.query(Like).filter(Like.post_id == post_id, Like.user_id == current_user.id).first()
    if like:
        db.delete(like)
        db.commit()
        return {'liked': False}
    db.add(Like(post_id=post_id, user_id=current_user.id))
    db.commit()
    return {'liked': True}
