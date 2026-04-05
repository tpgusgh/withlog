from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.group import DailyVideo, Group, GroupMember, Slot, Post, UserStory
from app.models.user import User


def seed_demo_data(db: Session):
    existing_groups = db.query(Group).count()
    if existing_groups > 0:
        return

    seeds = [
        ('demo@example.com', '현호', 'https://i.pravatar.cc/240?img=12'),
        ('minsu@example.com', '민수', 'https://i.pravatar.cc/240?img=15'),
        ('jiwoo@example.com', '지우', 'https://i.pravatar.cc/240?img=32'),
        ('seoyoon@example.com', '서윤', 'https://i.pravatar.cc/240?img=47'),
    ]
    users: list[User] = []
    for email, nickname, profile_image in seeds:
        user = db.query(User).filter(User.email == email).first()
        if user is None:
            user = User(email=email, password_hash=hash_password('password123'), nickname=nickname, profile_image=profile_image)
            db.add(user)
            db.commit()
            db.refresh(user)
        users.append(user)

    group = Group(
        name='withlog 크루',
        owner_id=users[0].id,
        invite_code='WITHLOG',
        max_members=6,
    )
    db.add(group)
    db.commit()
    db.refresh(group)

    db.add_all([
        GroupMember(group_id=group.id, user_id=users[0].id, role='owner'),
        GroupMember(group_id=group.id, user_id=users[1].id, role='member'),
        GroupMember(group_id=group.id, user_id=users[2].id, role='member'),
        GroupMember(group_id=group.id, user_id=users[3].id, role='member'),
    ])
    db.commit()

    now = datetime.now()
    slot_date = now.strftime('%Y-%m-%d')
    slot_hour = now.hour
    open_at = now.replace(minute=0, second=0, microsecond=0)
    close_at = open_at + timedelta(minutes=30)
    slot = Slot(
        group_id=group.id,
        slot_date=slot_date,
        slot_hour=slot_hour,
        open_at=open_at.isoformat(),
        close_at=close_at.isoformat(),
        status='open' if now < close_at else 'closed',
    )
    db.add(slot)
    db.commit()
    db.refresh(slot)

    demo_posts = [
        ('https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1200&q=80&auto=format&fit=crop', '오늘도 달려~', users[0].id, 'warm'),
        ('https://images.unsplash.com/photo-1514565131-fce0801e5785?w=1200&q=80&auto=format&fit=crop', '일 끝남!', users[1].id, 'cool'),
        ('https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=1200&q=80&auto=format&fit=crop', '카페 도착', users[2].id, 'vivid'),
    ]

    for index, (file_url, caption, user_id, filter_name) in enumerate(demo_posts):
        db.add(
            Post(
                group_id=group.id,
                slot_id=slot.id,
                user_id=user_id,
                media_type='image',
                file_url=file_url,
                caption_text=caption,
                filter_name=filter_name,
                music_name='none',
                text_x=0.12,
                text_y=0.56 + index * 0.03,
            )
        )
    for user, caption in [(users[0], '홈 스토리 테스트'), (users[1], '오늘의 순간')] :
        db.add(
            UserStory(
                user_id=user.id,
                media_type='image',
                file_url='https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1200&q=80&auto=format&fit=crop',
                caption_text=caption,
                is_muted='false',
            )
        )
    yesterday = now - timedelta(days=1)
    db.add(
        DailyVideo(
            group_id=group.id,
            video_date=yesterday.strftime('%Y-%m-%d'),
            output_url='https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
            status='done',
        )
    )
    db.commit()
