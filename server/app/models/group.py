from sqlalchemy import Boolean, Column, Integer, String, DateTime, ForeignKey, func, UniqueConstraint, Float
from app.db.session import Base

class Group(Base):
    __tablename__ = 'groups'
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    invite_code = Column(String, unique=True, nullable=False, index=True)
    owner_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    max_members = Column(Integer, default=10)
    is_public = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class GroupMember(Base):
    __tablename__ = 'group_members'
    id = Column(Integer, primary_key=True)
    group_id = Column(Integer, ForeignKey('groups.id'), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    role = Column(String, default='member')
    joined_at = Column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint('group_id', 'user_id', name='uq_group_user'),)

class Slot(Base):
    __tablename__ = 'slots'
    id = Column(Integer, primary_key=True)
    group_id = Column(Integer, ForeignKey('groups.id'), nullable=False)
    slot_date = Column(String, nullable=False)
    slot_hour = Column(Integer, nullable=False)
    open_at = Column(String, nullable=False)
    close_at = Column(String, nullable=False)
    status = Column(String, default='open')
    __table_args__ = (UniqueConstraint('group_id', 'slot_date', 'slot_hour', name='uq_group_date_hour'),)

class Post(Base):
    __tablename__ = 'posts'
    id = Column(Integer, primary_key=True)
    group_id = Column(Integer, ForeignKey('groups.id'), nullable=False)
    slot_id = Column(Integer, ForeignKey('slots.id'), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    media_type = Column(String, nullable=False)
    file_url = Column(String, nullable=False)
    thumbnail_url = Column(String, nullable=True)
    caption_text = Column(String, nullable=True)
    text_x = Column(Float, default=0.08)
    text_y = Column(Float, default=0.1)
    text_color = Column(String, default='#FFFFFF')
    text_size = Column(Integer, default=32)
    filter_name = Column(String, default='none')
    music_name = Column(String, default='none')
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint('slot_id', 'user_id', name='uq_slot_user'),)

class Comment(Base):
    __tablename__ = 'comments'
    id = Column(Integer, primary_key=True)
    post_id = Column(Integer, ForeignKey('posts.id'), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    parent_id = Column(Integer, ForeignKey('comments.id'), nullable=True)
    content = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class CommentReaction(Base):
    __tablename__ = 'comment_reactions'
    id = Column(Integer, primary_key=True)
    comment_id = Column(Integer, ForeignKey('comments.id'), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    emoji = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint('comment_id', 'user_id', name='uq_comment_user_reaction'),)

class Like(Base):
    __tablename__ = 'likes'
    id = Column(Integer, primary_key=True)
    post_id = Column(Integer, ForeignKey('posts.id'), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint('post_id', 'user_id', name='uq_post_user_like'),)

class DailyVideo(Base):
    __tablename__ = 'daily_videos'
    id = Column(Integer, primary_key=True)
    group_id = Column(Integer, ForeignKey('groups.id'), nullable=False)
    video_date = Column(String, nullable=False)
    output_url = Column(String, nullable=True)
    status = Column(String, default='pending')
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ChatMessage(Base):
    __tablename__ = 'chat_messages'
    id = Column(Integer, primary_key=True)
    group_id = Column(Integer, ForeignKey('groups.id'), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    content = Column(String, nullable=True)
    message_type = Column(String, default='text')
    media_url = Column(String, nullable=True)
    media_type = Column(String, nullable=True)
    quote_post_id = Column(Integer, ForeignKey('posts.id'), nullable=True)
    quote_caption = Column(String, nullable=True)
    quote_thumbnail_url = Column(String, nullable=True)
    quote_author_nickname = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class UserStory(Base):
    __tablename__ = 'user_stories'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    media_type = Column(String, nullable=False)
    file_url = Column(String, nullable=False)
    caption_text = Column(String, nullable=True)
    is_muted = Column(String, default='false')
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
