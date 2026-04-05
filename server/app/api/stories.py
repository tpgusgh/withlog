from datetime import datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.group import UserStory
from app.models.user import Block, Follow, User

router = APIRouter()
SERVER_ROOT = Path(__file__).resolve().parents[2]
UPLOAD_DIR = SERVER_ROOT / 'uploads' / 'stories'
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def delete_local_story_file(path_value: str | None):
    if not path_value or not path_value.startswith('/uploads/'):
        return
    target = SERVER_ROOT / path_value.lstrip('/')
    try:
        if target.exists() and target.is_file():
            target.unlink()
    except OSError:
        pass


def serialize_story(story: UserStory, user: User):
    return {
        'id': story.id,
        'caption': story.caption_text,
        'file_url': story.file_url,
        'media_type': story.media_type,
        'is_muted': story.is_muted == 'true',
        'created_at': story.created_at.isoformat() if story.created_at else None,
        'user': {
            'id': user.id,
            'nickname': user.nickname,
            'profile_image': user.profile_image,
        },
    }


@router.post('')
async def create_story(
    file: UploadFile = File(...),
    media_type: str = Form(...),
    caption_text: str = Form(''),
    is_muted: bool = Form(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    output = UPLOAD_DIR / f'{current_user.id}_{int(datetime.now().timestamp())}_{file.filename}'
    output.write_bytes(await file.read())
    story = UserStory(
        user_id=current_user.id,
        media_type=media_type,
        file_url=f'/uploads/stories/{output.name}',
        caption_text=caption_text,
        is_muted='true' if is_muted else 'false',
    )
    db.add(story)
    db.commit()
    db.refresh(story)
    return serialize_story(story, current_user)


@router.get('/feed')
def story_feed(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cutoff = datetime.now() - timedelta(hours=24)
    following_ids = {
        follow.following_id
        for follow in db.query(Follow).filter(Follow.follower_id == current_user.id).all()
    }
    blocked_ids = {
        block.blocked_id
        for block in db.query(Block).filter(Block.blocker_id == current_user.id).all()
    } | {
        block.blocker_id
        for block in db.query(Block).filter(Block.blocked_id == current_user.id).all()
    }
    visible_user_ids = {current_user.id, *following_ids} - blocked_ids
    if not visible_user_ids:
        return []

    stories = (
        db.query(UserStory)
        .filter(UserStory.created_at >= cutoff, UserStory.user_id.in_(visible_user_ids))
        .order_by(UserStory.created_at.desc())
        .all()
    )
    seen_user_ids: set[int] = set()
    result = []
    for story in stories:
      if story.user_id in seen_user_ids:
        continue
      user = db.query(User).filter(User.id == story.user_id).first()
      if not user:
        continue
      seen_user_ids.add(story.user_id)
      result.append(serialize_story(story, user))
    return result


@router.get('/user/{user_id}')
def list_user_stories(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cutoff = datetime.now() - timedelta(hours=24)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail='User not found')
    stories = (
        db.query(UserStory)
        .filter(UserStory.user_id == user_id, UserStory.created_at >= cutoff)
        .order_by(UserStory.created_at.asc())
        .all()
    )
    return [serialize_story(story, user) for story in stories]


@router.delete('/{story_id}')
def delete_story(story_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    story = db.query(UserStory).filter(UserStory.id == story_id).first()
    if not story:
        raise HTTPException(status_code=404, detail='Story not found')
    if story.user_id != current_user.id:
        raise HTTPException(status_code=403, detail='본인 스토리만 삭제할 수 있어요.')
    delete_local_story_file(story.file_url)
    db.delete(story)
    db.commit()
    return {'message': 'deleted', 'story_id': story_id}
