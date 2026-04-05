from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.group import DailyVideo, Group, GroupMember, Slot, Post
from app.models.user import User
from app.services.render_service import render_daily_video

router = APIRouter()

@router.post('/group/{group_id}/daily')
def generate_daily_video(group_id: int, date: str, db: Session = Depends(get_db)):
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

    slots = db.query(Slot).filter(Slot.group_id == group_id, Slot.slot_date == date).all()
    slots_by_hour = {slot.slot_hour: slot for slot in slots}
    posts = db.query(Post).filter(Post.group_id == group_id).join(Slot, Slot.id == Post.slot_id).filter(Slot.slot_date == date).all()
    posts_by_slot_user = {(post.slot_id, post.user_id): post for post in posts}
    has_any_post = any(posts_by_slot_user.values())
    if not has_any_post:
        raise HTTPException(status_code=400, detail='이 날짜에는 요약할 기록이 없습니다.')

    slot_layouts = []
    for hour in range(24):
        slot = slots_by_hour.get(hour)
        entries = []
        for member in members:
            post = posts_by_slot_user.get((slot.id, member.id)) if slot else None
            entries.append(
                {
                    'nickname': member.nickname,
                    'media_path': post.file_url if post else None,
                    'media_type': post.media_type if post else None,
                    'caption': post.caption_text if post else '',
                }
            )
        slot_layouts.append({'hour': hour, 'entries': entries})

    output_url = render_daily_video(group_id, date, slot_layouts)
    daily = db.query(DailyVideo).filter(DailyVideo.group_id == group_id, DailyVideo.video_date == date).order_by(DailyVideo.id.desc()).first()
    if daily:
        daily.output_url = output_url
        daily.status = 'done'
        db.add(daily)
    else:
        daily = DailyVideo(group_id=group_id, video_date=date, output_url=output_url, status='done')
        db.add(daily)
    db.commit()
    db.refresh(daily)
    return {'id': daily.id, 'status': daily.status, 'output_url': daily.output_url}

@router.get('/group/{group_id}/daily')
def get_daily_video(group_id: int, date: str, db: Session = Depends(get_db)):
    daily = db.query(DailyVideo).filter(DailyVideo.group_id == group_id, DailyVideo.video_date == date).order_by(DailyVideo.id.desc()).first()
    if not daily:
        return {'status': 'missing'}
    return {'status': daily.status, 'output_url': daily.output_url}
