from datetime import datetime, timedelta
from pathlib import Path
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.group import Group, GroupMember, Slot, Post, Like, Comment, DailyVideo, ChatMessage
from app.models.user import User
from app.schemas.group import GroupCreateIn, JoinGroupIn, ChatMessageIn, ChatSharePostIn
from app.utils.invite import generate_invite_code

router = APIRouter()
INVITE_LINK_PREFIX = 'withlog://join?code='
CHAT_UPLOAD_DIR = Path('uploads/chat')
CHAT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def serialize_chat_message(message: ChatMessage, author: User | None):
    return {
        'id': message.id,
        'content': message.content,
        'message_type': message.message_type,
        'media_url': message.media_url,
        'media_type': message.media_type,
        'reply': (
            {
                'message_id': message.reply_message_id,
                'content': message.reply_content,
                'author_nickname': message.reply_author_nickname,
            }
            if message.reply_message_id
            else None
        ),
        'quote': (
            {
                'post_id': message.quote_post_id,
                'caption': message.quote_caption,
                'thumbnail_url': message.quote_thumbnail_url,
                'author_nickname': message.quote_author_nickname,
            }
            if message.quote_post_id
            else None
        ),
        'created_at': message.created_at.isoformat() if message.created_at else None,
        'user': {
            'id': author.id if author else message.user_id,
            'nickname': author.nickname if author else 'Unknown',
            'profile_image': author.profile_image if author else None,
        },
    }


def serialize_group(group: Group, db: Session):
    members = (
        db.query(User)
        .join(GroupMember, GroupMember.user_id == User.id)
        .filter(GroupMember.group_id == group.id)
        .order_by(GroupMember.joined_at.asc())
        .all()
    )
    return {
        'id': group.id,
        'name': group.name,
        'invite_code': group.invite_code,
        'invite_link': f'{INVITE_LINK_PREFIX}{group.invite_code}',
        'member_count': len(members),
        'max_members': group.max_members,
        'is_public': group.is_public,
        'owner_id': group.owner_id,
        'members': [{'id': member.id, 'nickname': member.nickname, 'profile_image': member.profile_image} for member in members],
    }


@router.get('')
def list_groups(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    groups = (
        db.query(Group)
        .join(GroupMember, GroupMember.group_id == Group.id)
        .filter(GroupMember.user_id == current_user.id)
        .order_by(Group.created_at.desc())
        .all()
    )
    return [serialize_group(group, db) for group in groups]

@router.post('')
def create_group(payload: GroupCreateIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    invite = generate_invite_code()
    if payload.max_members < 2 or payload.max_members > 10:
        raise HTTPException(status_code=400, detail='max_members must be between 2 and 10')
    group = Group(name=payload.name, owner_id=current_user.id, invite_code=invite, max_members=payload.max_members, is_public=payload.is_public)
    db.add(group)
    db.commit()
    db.refresh(group)
    db.add(GroupMember(group_id=group.id, user_id=current_user.id, role='owner'))
    db.commit()
    return serialize_group(group, db)


@router.get('/public')
def list_public_groups(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    joined_group_ids = {
        membership.group_id
        for membership in db.query(GroupMember).filter(GroupMember.user_id == current_user.id).all()
    }
    query = db.query(Group).filter(Group.is_public.is_(True))
    if joined_group_ids:
        query = query.filter(Group.id.notin_(joined_group_ids))
    groups = query.order_by(Group.created_at.desc()).all()
    available_groups = []
    for group in groups:
        count = db.query(func.count(GroupMember.id)).filter(GroupMember.group_id == group.id).scalar() or 0
        if count < group.max_members:
            available_groups.append(group)
    return [serialize_group(group, db) for group in available_groups]

@router.post('/join')
def join_group(payload: JoinGroupIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    group = db.query(Group).filter(Group.invite_code == payload.invite_code).first()
    if not group:
        raise HTTPException(status_code=404, detail='Group not found')
    count = db.query(func.count(GroupMember.id)).filter(GroupMember.group_id == group.id).scalar() or 0
    if count >= group.max_members:
        raise HTTPException(status_code=400, detail='Group is full')
    exists = db.query(GroupMember).filter(GroupMember.group_id == group.id, GroupMember.user_id == current_user.id).first()
    if not exists:
        db.add(GroupMember(group_id=group.id, user_id=current_user.id))
        db.commit()
    return {'message': 'joined', 'group_id': group.id}


@router.post('/{group_id}/join-public')
def join_public_group(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    group = db.query(Group).filter(Group.id == group_id, Group.is_public.is_(True)).first()
    if not group:
        raise HTTPException(status_code=404, detail='공개 그룹을 찾을 수 없습니다.')
    count = db.query(func.count(GroupMember.id)).filter(GroupMember.group_id == group.id).scalar() or 0
    if count >= group.max_members:
        raise HTTPException(status_code=400, detail='Group is full')
    exists = db.query(GroupMember).filter(GroupMember.group_id == group.id, GroupMember.user_id == current_user.id).first()
    if not exists:
        db.add(GroupMember(group_id=group.id, user_id=current_user.id))
        db.commit()
    return {'message': 'joined', 'group_id': group.id}


@router.delete('/{group_id}/leave')
def leave_group(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    membership = db.query(GroupMember).filter(GroupMember.group_id == group_id, GroupMember.user_id == current_user.id).first()
    if not membership:
        raise HTTPException(status_code=404, detail='Membership not found')

    group = db.query(Group).filter(Group.id == group_id).first()
    if group and group.owner_id == current_user.id:
        raise HTTPException(status_code=400, detail='Owner cannot leave the group')

    db.delete(membership)
    db.commit()
    return {'message': 'left', 'group_id': group_id}


@router.delete('/{group_id}/members/{user_id}')
def remove_group_member(group_id: int, user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail='Group not found')
    if group.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail='Only owner can remove members')
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail='Owner cannot remove themselves')

    membership = db.query(GroupMember).filter(GroupMember.group_id == group_id, GroupMember.user_id == user_id).first()
    if not membership:
        raise HTTPException(status_code=404, detail='Membership not found')

    db.delete(membership)
    db.commit()
    return {'message': 'removed', 'group_id': group_id, 'user_id': user_id}


@router.delete('/{group_id}')
def delete_group(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail='Group not found')
    if group.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail='Only owner can delete the group')

    slots = db.query(Slot).filter(Slot.group_id == group_id).all()
    slot_ids = [slot.id for slot in slots]
    posts = db.query(Post).filter(Post.group_id == group_id).all()
    post_ids = [post.id for post in posts]

    if post_ids:
        db.query(Like).filter(Like.post_id.in_(post_ids)).delete(synchronize_session=False)
        db.query(Comment).filter(Comment.post_id.in_(post_ids)).delete(synchronize_session=False)
    if slot_ids:
        db.query(Post).filter(Post.slot_id.in_(slot_ids)).delete(synchronize_session=False)
        db.query(Slot).filter(Slot.id.in_(slot_ids)).delete(synchronize_session=False)

    db.query(DailyVideo).filter(DailyVideo.group_id == group_id).delete(synchronize_session=False)
    db.query(GroupMember).filter(GroupMember.group_id == group_id).delete(synchronize_session=False)
    db.delete(group)
    db.commit()
    return {'message': 'deleted', 'group_id': group_id}

@router.get('/{group_id}')
def get_group(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    membership = db.query(GroupMember).filter(GroupMember.group_id == group_id, GroupMember.user_id == current_user.id).first()
    if not membership:
        raise HTTPException(status_code=403, detail='Not a member of this group')
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail='Group not found')
    return serialize_group(group, db)

@router.get('/{group_id}/current-slot')
def current_slot(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    membership = db.query(GroupMember).filter(GroupMember.group_id == group_id, GroupMember.user_id == current_user.id).first()
    if not membership:
        raise HTTPException(status_code=403, detail='Not a member of this group')
    now = datetime.now()
    slot_hour = now.hour
    slot_date = now.strftime('%Y-%m-%d')
    open_at = now.replace(minute=0, second=0, microsecond=0)
    close_at = open_at + timedelta(hours=1)
    slot = db.query(Slot).filter(Slot.group_id == group_id, Slot.slot_date == slot_date, Slot.slot_hour == slot_hour).first()
    if not slot:
        slot = Slot(group_id=group_id, slot_date=slot_date, slot_hour=slot_hour, open_at=open_at.isoformat(), close_at=close_at.isoformat(), status='open' if now < close_at else 'closed')
        db.add(slot)
        db.commit()
        db.refresh(slot)
    else:
        expected_close_at = datetime.fromisoformat(slot.open_at) + timedelta(hours=1)
        if slot.close_at != expected_close_at.isoformat() or slot.status != ('open' if now < expected_close_at else 'closed'):
            slot.close_at = expected_close_at.isoformat()
            slot.status = 'open' if now < expected_close_at else 'closed'
            db.add(slot)
            db.commit()
            db.refresh(slot)
    return {'slot_id': slot.id, 'slot_date': slot.slot_date, 'slot_hour': slot.slot_hour, 'open_at': slot.open_at, 'close_at': slot.close_at, 'is_open': now < datetime.fromisoformat(slot.close_at)}

@router.get('/{group_id}/feed')
def group_feed(group_id: int, date: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    membership = db.query(GroupMember).filter(GroupMember.group_id == group_id, GroupMember.user_id == current_user.id).first()
    if not membership:
        raise HTTPException(status_code=403, detail='Not a member of this group')
    slots = db.query(Slot).filter(Slot.group_id == group_id, Slot.slot_date == date).order_by(Slot.slot_hour.asc()).all()
    result = []
    for slot in slots:
        posts = db.query(Post).filter(Post.slot_id == slot.id).all()
        serialized_posts = []
        for post in posts:
            author = db.query(User).filter(User.id == post.user_id).first()
            like_count = db.query(func.count(Like.id)).filter(Like.post_id == post.id).scalar() or 0
            liked_by_me = (
                db.query(Like.id)
                .filter(Like.post_id == post.id, Like.user_id == current_user.id)
                .first()
                is not None
            )
            comment_count = db.query(func.count(Comment.id)).filter(Comment.post_id == post.id).scalar() or 0
            serialized_posts.append({
                'id': post.id,
                'caption': post.caption_text,
                'file_url': post.file_url,
                'media_type': post.media_type,
                'filter': post.filter_name,
                'music': post.music_name,
                'is_muted': False,
                'created_at': post.created_at.isoformat() if post.created_at else None,
                'likes': like_count,
                'liked_by_me': liked_by_me,
                'comments': comment_count,
                'user': {
                    'id': author.id if author else post.user_id,
                    'nickname': author.nickname if author else 'Unknown',
                    'profile_image': author.profile_image if author else None,
                },
            })
        result.append({'hour': slot.slot_hour, 'posts': serialized_posts})
    return result


@router.get('/{group_id}/chat')
def list_group_chat(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    membership = db.query(GroupMember).filter(GroupMember.group_id == group_id, GroupMember.user_id == current_user.id).first()
    if not membership:
        raise HTTPException(status_code=403, detail='Not a member of this group')

    messages = (
        db.query(ChatMessage, User)
        .join(User, User.id == ChatMessage.user_id)
        .filter(ChatMessage.group_id == group_id)
        .order_by(ChatMessage.created_at.asc())
        .limit(100)
        .all()
    )
    return [serialize_chat_message(message, author) for message, author in messages]


@router.post('/{group_id}/chat')
def create_group_chat(group_id: int, payload: ChatMessageIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    membership = db.query(GroupMember).filter(GroupMember.group_id == group_id, GroupMember.user_id == current_user.id).first()
    if not membership:
        raise HTTPException(status_code=403, detail='Not a member of this group')
    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail='메시지를 입력해 주세요.')

    message = ChatMessage(group_id=group_id, user_id=current_user.id, content=content, message_type='text')
    if payload.reply_message_id is not None:
        replied = db.query(ChatMessage).filter(ChatMessage.id == payload.reply_message_id, ChatMessage.group_id == group_id).first()
        if replied:
            replied_author = db.query(User).filter(User.id == replied.user_id).first()
            message.reply_message_id = replied.id
            message.reply_content = replied.content or ('사진을 보냈어요' if replied.media_url else '')
            message.reply_author_nickname = replied_author.nickname if replied_author else 'Unknown'
    if payload.quote_post_id is not None:
        post = db.query(Post).filter(Post.id == payload.quote_post_id, Post.group_id == group_id).first()
        if post:
            author = db.query(User).filter(User.id == post.user_id).first()
            message.quote_post_id = post.id
            message.quote_caption = post.caption_text
            message.quote_thumbnail_url = post.file_url
            message.quote_author_nickname = author.nickname if author else 'Unknown'
    db.add(message)
    db.commit()
    db.refresh(message)
    return serialize_chat_message(message, current_user)


@router.post('/{group_id}/chat/upload')
async def upload_group_chat_media(
    group_id: int,
    file: UploadFile = File(...),
    content: str = Form(''),
    quote_post_id: int | None = Form(default=None),
    reply_message_id: int | None = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    membership = db.query(GroupMember).filter(GroupMember.group_id == group_id, GroupMember.user_id == current_user.id).first()
    if not membership:
        raise HTTPException(status_code=403, detail='Not a member of this group')

    output = CHAT_UPLOAD_DIR / f'{group_id}_{current_user.id}_{int(datetime.now().timestamp())}_{file.filename}'
    output.write_bytes(await file.read())

    message = ChatMessage(
        group_id=group_id,
        user_id=current_user.id,
        content=content.strip() or None,
        message_type='image',
        media_url=f'/uploads/chat/{output.name}',
        media_type='image',
    )
    if reply_message_id is not None:
        replied = db.query(ChatMessage).filter(ChatMessage.id == reply_message_id, ChatMessage.group_id == group_id).first()
        if replied:
            replied_author = db.query(User).filter(User.id == replied.user_id).first()
            message.reply_message_id = replied.id
            message.reply_content = replied.content or ('사진을 보냈어요' if replied.media_url else '')
            message.reply_author_nickname = replied_author.nickname if replied_author else 'Unknown'
    if quote_post_id is not None:
        post = db.query(Post).filter(Post.id == quote_post_id, Post.group_id == group_id).first()
        if post:
            author = db.query(User).filter(User.id == post.user_id).first()
            message.quote_post_id = post.id
            message.quote_caption = post.caption_text
            message.quote_thumbnail_url = post.file_url
            message.quote_author_nickname = author.nickname if author else 'Unknown'

    db.add(message)
    db.commit()
    db.refresh(message)
    return serialize_chat_message(message, current_user)


@router.post('/{group_id}/chat/share-post')
def share_group_post(group_id: int, payload: ChatSharePostIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    membership = db.query(GroupMember).filter(GroupMember.group_id == group_id, GroupMember.user_id == current_user.id).first()
    if not membership:
        raise HTTPException(status_code=403, detail='Not a member of this group')

    post = db.query(Post).filter(Post.id == payload.post_id, Post.group_id == group_id).first()
    if not post:
        raise HTTPException(status_code=404, detail='Post not found')
    author = db.query(User).filter(User.id == post.user_id).first()

    if payload.mode == 'heart':
        like = db.query(Like).filter(Like.post_id == post.id, Like.user_id == current_user.id).first()
        if not like:
            db.add(Like(post_id=post.id, user_id=current_user.id))
            db.commit()

    message = ChatMessage(
        group_id=group_id,
        user_id=current_user.id,
        content='하트를 보냈어요' if payload.mode == 'heart' else '사진을 인용했어요',
        message_type='heart' if payload.mode == 'heart' else 'quote',
        quote_post_id=post.id,
        quote_caption=post.caption_text,
        quote_thumbnail_url=post.file_url,
        quote_author_nickname=author.nickname if author else 'Unknown',
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return serialize_chat_message(message, current_user)
