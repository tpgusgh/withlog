from sqlalchemy import Boolean, Column, Integer, String, DateTime, func, ForeignKey, UniqueConstraint
from app.db.session import Base

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    nickname = Column(String, nullable=False)
    profile_image = Column(String, nullable=True)
    is_public = Column(Boolean, nullable=False, default=True)
    intro = Column(String, nullable=False, default='')
    push_enabled = Column(Boolean, nullable=False, default=True)
    music_preview = Column(Boolean, nullable=False, default=True)
    theme_mode = Column(String, nullable=False, default='light')
    timezone_label = Column(String, nullable=False, default='Asia/Seoul')
    quiet_hours_enabled = Column(Boolean, nullable=False, default=False)
    quiet_hours = Column(String, nullable=False, default='22:00 - 08:00')
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Follow(Base):
    __tablename__ = 'follows'
    id = Column(Integer, primary_key=True)
    follower_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    following_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint('follower_id', 'following_id', name='uq_follow_pair'),)


class Block(Base):
    __tablename__ = 'blocks'
    id = Column(Integer, primary_key=True)
    blocker_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    blocked_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint('blocker_id', 'blocked_id', name='uq_block_pair'),)


class EmailVerification(Base):
    __tablename__ = 'email_verifications'
    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, nullable=False, index=True)
    code = Column(String, nullable=False)
    verified = Column(Boolean, default=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
