from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.group import DailyVideo, Group, GroupMember, Slot, Post
from app.models.user import User
from app.services.render_service import render_daily_video

router = APIRouter()
APP_TIMEZONE = ZoneInfo('Asia/Seoul')


def local_now() -> datetime:
    return datetime.now(APP_TIMEZONE)


def rolling_window_key(now: datetime) -> str:
    return f'rolling-{now.strftime("%Y-%m-%d")}-{now.hour:02d}'


def rolling_window_points(now: datetime) -> list[tuple[str, int]]:
    window_start = now - timedelta(hours=24)
    cursor = window_start.replace(minute=0, second=0, microsecond=0)
    end = now.replace(minute=0, second=0, microsecond=0)
    points: list[tuple[str, int]] = []
    while cursor <= end:
        points.append((cursor.strftime('%Y-%m-%d'), cursor.hour))
        cursor += timedelta(hours=1)
    return points


@router.post('/group/{group_id}/daily')
def generate_daily_video(group_id: int, date: str | None = None, db: Session = Depends(get_db)):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail='Group not found')

    members = (
        db.query(User)
        .join(GroupMember, GroupMember.user_id == User.id)
        .filter(GroupMember.group_id == group_id)
        .order_by(GroupMember.joined_at.asc())
        .all()
    )
    if not members:
        raise HTTPException(status_code=400, detail='그룹 멤버가 없습니다.')

    now = local_now()
    window_points = rolling_window_points(now)
    target_dates = sorted({slot_date for slot_date, _ in window_points})
    slots = db.query(Slot).filter(Slot.group_id == group_id, Slot.slot_date.in_(target_dates)).all()
    slots_by_key = {(slot.slot_date, slot.slot_hour): slot for slot in slots}
    posts = db.query(Post).filter(Post.group_id == group_id).join(Slot, Slot.id == Post.slot_id).filter(Slot.slot_date.in_(target_dates)).all()
    video_key = rolling_window_key(now)
    missing_detail = '최근 24시간 안에 요약할 기록이 없습니다.'

    posts_by_slot_user = {(post.slot_id, post.user_id): post for post in posts}

    slot_layouts = []
    for slot_date, hour in window_points:
        slot = slots_by_key.get((slot_date, hour))
        if not slot:
            continue

        entries = []
        has_any_post = False
        for member in members:
            post = posts_by_slot_user.get((slot.id, member.id))
            entries.append(
                {
                    'nickname': member.nickname,
                    'media_path': post.file_url if post else None,
                    'media_type': post.media_type if post else None,
                    'caption': post.caption_text if post else '',
                }
            )
            if post:
                has_any_post = True

        if has_any_post and entries:
            slot_layouts.append({'hour': hour, 'entries': entries})

    if not slot_layouts:
        raise HTTPException(status_code=400, detail=missing_detail)

    output_url = render_daily_video(group_id, video_key, slot_layouts)
    daily = db.query(DailyVideo).filter(DailyVideo.group_id == group_id, DailyVideo.video_date == video_key).order_by(DailyVideo.id.desc()).first()
    if daily:
        daily.output_url = output_url
        daily.status = 'done'
        db.add(daily)
    else:
        daily = DailyVideo(group_id=group_id, video_date=video_key, output_url=output_url, status='done')
        db.add(daily)
    db.commit()
    db.refresh(daily)
    return {'id': daily.id, 'status': daily.status, 'output_url': daily.output_url}

@router.get('/group/{group_id}/daily')
def get_daily_video(group_id: int, date: str | None = None, db: Session = Depends(get_db)):
    video_key = rolling_window_key(local_now())
    daily = db.query(DailyVideo).filter(DailyVideo.group_id == group_id, DailyVideo.video_date == video_key).order_by(DailyVideo.id.desc()).first()
    if not daily:
        return {'status': 'missing'}
    return {'status': daily.status, 'output_url': daily.output_url}
