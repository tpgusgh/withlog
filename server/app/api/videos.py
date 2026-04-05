from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.group import DailyVideo, Slot, Post
from app.services.render_service import render_daily_video

router = APIRouter()

@router.post('/group/{group_id}/daily')
def generate_daily_video(group_id: int, date: str, db: Session = Depends(get_db)):
    slots = db.query(Slot).filter(Slot.group_id == group_id, Slot.slot_date == date).all()
    clip_paths = []
    for slot in slots:
        posts = db.query(Post).filter(Post.slot_id == slot.id).all()
        clip_paths.extend([p.file_url for p in posts])
    output_url = render_daily_video(group_id, date, clip_paths)
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
