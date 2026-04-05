from pathlib import Path
from datetime import datetime, timedelta, UTC
import os
import random
import smtplib
from email.message import EmailMessage
from dotenv import load_dotenv

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.group import Group, GroupMember
from app.models.user import User, Follow, Block, EmailVerification
from app.schemas.auth import EmailRequestIn, EmailRequestOut, EmailVerifyIn, EmailVerifyOut, SignupIn, LoginIn, TokenOut, ProfileOut
from app.core.security import hash_password, verify_password, create_access_token, create_email_verification_token, decode_access_token

load_dotenv(Path(__file__).resolve().parents[2] / '.env')

router = APIRouter()
UPLOAD_DIR = Path('uploads/profile')
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

SMTP_HOST = os.getenv('SMTP_HOST')
SMTP_PORT = int(os.getenv('SMTP_PORT', '587'))
SMTP_USERNAME = os.getenv('SMTP_USERNAME')
SMTP_PASSWORD = os.getenv('SMTP_PASSWORD')
SMTP_FROM = os.getenv('SMTP_FROM', SMTP_USERNAME or 'no-reply@withlog.local')
SMTP_USE_SSL = os.getenv('SMTP_USE_SSL', 'false').lower() == 'true' or SMTP_PORT == 465
SMTP_USE_STARTTLS = os.getenv('SMTP_USE_STARTTLS', 'true').lower() == 'true'


def utc_now_naive() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def send_verification_email(email: str, code: str):
    if not SMTP_HOST or not SMTP_USERNAME or not SMTP_PASSWORD:
        return False

    message = EmailMessage()
    message['Subject'] = 'withlog 이메일 인증 코드'
    message['From'] = SMTP_FROM
    message['To'] = email
    message.set_content(f'withlog 인증 코드는 {code} 입니다. 10분 안에 입력해 주세요.')

    try:
        if SMTP_USE_SSL:
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT) as server:
                server.login(SMTP_USERNAME, SMTP_PASSWORD)
                server.send_message(message)
        else:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
                if SMTP_USE_STARTTLS:
                    server.starttls()
                server.login(SMTP_USERNAME, SMTP_PASSWORD)
                server.send_message(message)
        return True
    except Exception:
        return False

@router.post('/signup', response_model=TokenOut)
def signup(payload: SignupIn, db: Session = Depends(get_db)):
    exists = db.query(User).filter(User.email == payload.email).first()
    if exists:
        raise HTTPException(status_code=400, detail='Email already exists')
    try:
        verification_claims = decode_access_token(payload.verification_token)
    except Exception as exc:
        raise HTTPException(status_code=400, detail='이메일 인증이 필요합니다.') from exc
    if verification_claims.get('type') != 'email_verification' or verification_claims.get('sub') != payload.email:
        raise HTTPException(status_code=400, detail='이메일 인증이 유효하지 않습니다.')
    verification = db.query(EmailVerification).filter(EmailVerification.email == payload.email).first()
    if not verification or not verification.verified:
        raise HTTPException(status_code=400, detail='이메일 인증이 완료되지 않았습니다.')
    user = User(email=payload.email, password_hash=hash_password(payload.password), nickname=payload.nickname)
    db.add(user)
    db.commit()
    db.refresh(user)
    db.delete(verification)
    db.commit()
    return TokenOut(access_token=create_access_token(str(user.id)))

@router.post('/login', response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail='Invalid credentials')
    return TokenOut(access_token=create_access_token(str(user.id)))


@router.post('/email/request', response_model=EmailRequestOut)
def request_email_verification(payload: EmailRequestIn, db: Session = Depends(get_db)):
    exists = db.query(User).filter(User.email == payload.email).first()
    if exists:
        raise HTTPException(status_code=400, detail='이미 가입된 이메일입니다.')

    code = f'{random.randint(0, 999999):06d}'
    verification = db.query(EmailVerification).filter(EmailVerification.email == payload.email).first()
    expires_at = utc_now_naive() + timedelta(minutes=10)
    if verification:
        verification.code = code
        verification.verified = False
        verification.expires_at = expires_at
        db.add(verification)
    else:
        verification = EmailVerification(email=payload.email, code=code, verified=False, expires_at=expires_at)
        db.add(verification)
    db.commit()

    delivered = send_verification_email(payload.email, code)
    return EmailRequestOut(sent=delivered, dev_code=None if delivered else code)


@router.post('/email/verify', response_model=EmailVerifyOut)
def verify_email_code(payload: EmailVerifyIn, db: Session = Depends(get_db)):
    verification = db.query(EmailVerification).filter(EmailVerification.email == payload.email).first()
    if not verification:
        raise HTTPException(status_code=404, detail='인증 요청을 먼저 해주세요.')
    expires_at = verification.expires_at
    if expires_at.tzinfo is not None:
        expires_at = expires_at.astimezone(UTC).replace(tzinfo=None)
    if expires_at < utc_now_naive():
        raise HTTPException(status_code=400, detail='인증번호가 만료됐습니다.')
    if verification.code != payload.code:
        raise HTTPException(status_code=400, detail='인증번호가 올바르지 않습니다.')

    verification.verified = True
    db.add(verification)
    db.commit()
    return EmailVerifyOut(verification_token=create_email_verification_token(payload.email))


def serialize_profile(user: User, db: Session):
    follower_count = db.query(func.count(Follow.id)).filter(Follow.following_id == user.id).scalar() or 0
    following_count = db.query(func.count(Follow.id)).filter(Follow.follower_id == user.id).scalar() or 0
    return {
        'id': user.id,
        'email': user.email,
        'nickname': user.nickname,
        'profile_image': user.profile_image,
        'is_public': user.is_public,
        'intro': user.intro or '',
        'push_enabled': user.push_enabled,
        'music_preview': user.music_preview,
        'theme_mode': user.theme_mode or 'light',
        'timezone_label': user.timezone_label or 'Asia/Seoul',
        'quiet_hours_enabled': user.quiet_hours_enabled,
        'quiet_hours': user.quiet_hours or '22:00 - 08:00',
        'follower_count': follower_count,
        'following_count': following_count,
    }


def get_blocked_user_ids(current_user_id: int, db: Session) -> set[int]:
    blocked_by_me = {
        block.blocked_id
        for block in db.query(Block).filter(Block.blocker_id == current_user_id).all()
    }
    blocked_me = {
        block.blocker_id
        for block in db.query(Block).filter(Block.blocked_id == current_user_id).all()
    }
    return blocked_by_me | blocked_me


def serialize_public_groups_for_user(target_user: User, viewer: User, db: Session):
    public_groups = (
        db.query(Group)
        .join(GroupMember, GroupMember.group_id == Group.id)
        .filter(GroupMember.user_id == target_user.id, Group.is_public.is_(True))
        .order_by(Group.created_at.desc())
        .all()
    )
    viewer_group_ids = {
        membership.group_id
        for membership in db.query(GroupMember).filter(GroupMember.user_id == viewer.id).all()
    }
    result = []
    for group in public_groups:
        member_count = db.query(func.count(GroupMember.id)).filter(GroupMember.group_id == group.id).scalar() or 0
        result.append({
            'id': group.id,
            'name': group.name,
            'member_count': member_count,
            'max_members': group.max_members,
            'is_joined': group.id in viewer_group_ids,
        })
    return result


def parse_since(value: str | None) -> datetime:
    if not value:
        return utc_now_naive() - timedelta(minutes=1)
    try:
        normalized = value.replace('Z', '+00:00')
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is not None:
            parsed = parsed.astimezone(UTC).replace(tzinfo=None)
        return parsed
    except ValueError:
        return utc_now_naive() - timedelta(minutes=1)


@router.get('/me', response_model=ProfileOut)
def me(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return serialize_profile(current_user, db)


@router.get('/activity')
def get_activity(since: str | None = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    since_at = parse_since(since)
    blocked_ids = get_blocked_user_ids(current_user.id, db)
    group_ids = [
        membership.group_id
        for membership in db.query(GroupMember).filter(GroupMember.user_id == current_user.id).all()
    ]
    if not group_ids:
        return {'events': [], 'checked_at': utc_now_naive().isoformat()}

    groups_by_id = {
        group.id: group
        for group in db.query(Group).filter(Group.id.in_(group_ids)).all()
    }

    post_events = []
    posts = (
        db.query(Group, Post, User)
        .join(Post, Post.group_id == Group.id)
        .join(User, User.id == Post.user_id)
        .filter(Group.id.in_(group_ids), Post.user_id != current_user.id, Post.created_at > since_at)
        .order_by(Post.created_at.asc())
        .all()
    )
    for group, post, author in posts:
        if author.id in blocked_ids:
            continue
        post_events.append({
            'id': f'post-{post.id}',
            'type': 'slot_post',
            'group_id': group.id,
            'group_name': group.name,
            'actor_id': author.id,
            'actor_nickname': author.nickname,
            'created_at': post.created_at.isoformat() if post.created_at else None,
            'message': post.caption_text or '',
        })

    chat_events = []
    chat_messages = (
        db.query(Group, ChatMessage, User)
        .join(ChatMessage, ChatMessage.group_id == Group.id)
        .join(User, User.id == ChatMessage.user_id)
        .filter(Group.id.in_(group_ids), ChatMessage.user_id != current_user.id, ChatMessage.created_at > since_at)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )
    for group, message, author in chat_messages:
        if author.id in blocked_ids or message.message_type == 'heart':
            continue
        chat_events.append({
            'id': f'chat-{message.id}',
            'type': 'chat_message',
            'group_id': group.id,
            'group_name': group.name,
            'actor_id': author.id,
            'actor_nickname': author.nickname,
            'created_at': message.created_at.isoformat() if message.created_at else None,
            'message': message.content or message.quote_caption or '',
        })

    events = sorted([*post_events, *chat_events], key=lambda item: item.get('created_at') or '')
    return {'events': events, 'checked_at': utc_now_naive().isoformat()}


@router.patch('/me', response_model=ProfileOut)
async def update_me(
    nickname: str = Form(...),
    is_public: bool = Form(True),
    intro: str = Form(''),
    push_enabled: bool = Form(True),
    music_preview: bool = Form(True),
    theme_mode: str = Form('light'),
    timezone_label: str = Form('Asia/Seoul'),
    quiet_hours_enabled: bool = Form(False),
    quiet_hours: str = Form('22:00 - 08:00'),
    profile_image: UploadFile | None = File(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user.nickname = nickname
    current_user.is_public = is_public
    current_user.intro = intro
    current_user.push_enabled = push_enabled
    current_user.music_preview = music_preview
    current_user.theme_mode = theme_mode if theme_mode in {'light', 'dark'} else 'light'
    current_user.timezone_label = timezone_label
    current_user.quiet_hours_enabled = quiet_hours_enabled
    current_user.quiet_hours = quiet_hours

    if profile_image is not None:
        ext = Path(profile_image.filename or 'profile.jpg').suffix or '.jpg'
        output = UPLOAD_DIR / f"user_{current_user.id}{ext}"
        output.write_bytes(await profile_image.read())
        current_user.profile_image = f"/uploads/profile/{output.name}"

    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return serialize_profile(current_user, db)


@router.get('/users')
def list_users(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    blocked_ids = get_blocked_user_ids(current_user.id, db)
    users_query = db.query(User).filter(User.id != current_user.id, User.is_public.is_(True))
    if blocked_ids:
        users_query = users_query.filter(User.id.notin_(blocked_ids))
    users = users_query.order_by(User.nickname.asc()).all()
    following_ids = {
        follow.following_id
        for follow in db.query(Follow).filter(Follow.follower_id == current_user.id).all()
    }
    result = []
    for user in users:
        result.append({
            'id': user.id,
            'email': user.email,
            'nickname': user.nickname,
            'profile_image': user.profile_image,
            'is_following': user.id in following_ids,
            'follower_count': db.query(func.count(Follow.id)).filter(Follow.following_id == user.id).scalar() or 0,
            'following_count': db.query(func.count(Follow.id)).filter(Follow.follower_id == user.id).scalar() or 0,
        })
    return result


@router.get('/users/{user_id}')
def get_user_profile(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail='User not found')
    blocked = (
        db.query(Block.id)
        .filter(
            ((Block.blocker_id == current_user.id) & (Block.blocked_id == target.id))
            | ((Block.blocker_id == target.id) & (Block.blocked_id == current_user.id))
        )
        .first()
        is not None
    )
    if blocked:
        raise HTTPException(status_code=403, detail='차단된 사용자입니다.')

    is_following = (
        db.query(Follow.id)
        .filter(Follow.follower_id == current_user.id, Follow.following_id == target.id)
        .first()
        is not None
    )
    follows_you = (
        db.query(Follow.id)
        .filter(Follow.follower_id == target.id, Follow.following_id == current_user.id)
        .first()
        is not None
    )
    return {
        **serialize_profile(target, db),
        'is_following': is_following,
        'follows_you': follows_you,
        'is_blocked': (
            db.query(Block.id)
            .filter(Block.blocker_id == current_user.id, Block.blocked_id == target.id)
            .first()
            is not None
        ),
        'public_groups': serialize_public_groups_for_user(target, current_user, db),
    }


@router.get('/follows')
def get_follow_lists(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    blocked_ids = get_blocked_user_ids(current_user.id, db)
    following = (
        db.query(User)
        .join(Follow, Follow.following_id == User.id)
        .filter(Follow.follower_id == current_user.id)
        .order_by(User.nickname.asc())
        .all()
    )
    followers = (
        db.query(User)
        .join(Follow, Follow.follower_id == User.id)
        .filter(Follow.following_id == current_user.id)
        .order_by(User.nickname.asc())
        .all()
    )
    return {
        'following': [serialize_profile(user, db) for user in following if user.id not in blocked_ids],
        'followers': [serialize_profile(user, db) for user in followers if user.id not in blocked_ids],
    }


@router.post('/follow/{user_id}')
def follow_user(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail='자기 자신은 팔로우할 수 없습니다.')
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail='User not found')
    blocked = (
        db.query(Block.id)
        .filter(
            ((Block.blocker_id == current_user.id) & (Block.blocked_id == user_id))
            | ((Block.blocker_id == user_id) & (Block.blocked_id == current_user.id))
        )
        .first()
        is not None
    )
    if blocked:
        raise HTTPException(status_code=403, detail='차단 관계에서는 팔로우할 수 없습니다.')
    existing = db.query(Follow).filter(Follow.follower_id == current_user.id, Follow.following_id == user_id).first()
    if not existing:
        db.add(Follow(follower_id=current_user.id, following_id=user_id))
        db.commit()
    return {'following': True}


@router.delete('/follow/{user_id}')
def unfollow_user(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    existing = db.query(Follow).filter(Follow.follower_id == current_user.id, Follow.following_id == user_id).first()
    if existing:
        db.delete(existing)
        db.commit()
    return {'following': False}


@router.get('/blocks')
def get_block_list(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    blocked_users = (
        db.query(User)
        .join(Block, Block.blocked_id == User.id)
        .filter(Block.blocker_id == current_user.id)
        .order_by(User.nickname.asc())
        .all()
    )
    return {'blocked': [serialize_profile(user, db) for user in blocked_users]}


@router.post('/block/{user_id}')
def block_user(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail='자기 자신은 차단할 수 없습니다.')
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail='User not found')
    existing = db.query(Block).filter(Block.blocker_id == current_user.id, Block.blocked_id == user_id).first()
    if not existing:
        db.add(Block(blocker_id=current_user.id, blocked_id=user_id))
        db.commit()

    db.query(Follow).filter(
        ((Follow.follower_id == current_user.id) & (Follow.following_id == user_id))
        | ((Follow.follower_id == user_id) & (Follow.following_id == current_user.id))
    ).delete(synchronize_session=False)
    db.commit()
    return {'blocked': True}


@router.delete('/block/{user_id}')
def unblock_user(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    existing = db.query(Block).filter(Block.blocker_id == current_user.id, Block.blocked_id == user_id).first()
    if existing:
        db.delete(existing)
        db.commit()
    return {'blocked': False}
