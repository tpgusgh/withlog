import asyncio
from contextlib import suppress
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from app.api import auth, groups, posts, videos, comments, stories
from app.db.session import Base, SessionLocal, engine
from app.models.group import ChatMessage, Comment, CommentReaction, Like, Post, UserStory

Base.metadata.create_all(bind=engine)
UPLOAD_ROOT = Path('uploads')
RETENTION_DAYS = 7


def ensure_runtime_columns():
    with engine.begin() as connection:
        existing_user_columns = {
            row[1]
            for row in connection.execute(text("PRAGMA table_info('users')")).fetchall()
        }
        if 'is_public' not in existing_user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT 1"))
        user_required_columns = {
            'intro': "ALTER TABLE users ADD COLUMN intro VARCHAR NOT NULL DEFAULT ''",
            'push_enabled': "ALTER TABLE users ADD COLUMN push_enabled BOOLEAN NOT NULL DEFAULT 1",
            'music_preview': "ALTER TABLE users ADD COLUMN music_preview BOOLEAN NOT NULL DEFAULT 1",
            'theme_mode': "ALTER TABLE users ADD COLUMN theme_mode VARCHAR NOT NULL DEFAULT 'light'",
            'timezone_label': "ALTER TABLE users ADD COLUMN timezone_label VARCHAR NOT NULL DEFAULT 'Asia/Seoul'",
            'quiet_hours_enabled': "ALTER TABLE users ADD COLUMN quiet_hours_enabled BOOLEAN NOT NULL DEFAULT 0",
            'quiet_hours': "ALTER TABLE users ADD COLUMN quiet_hours VARCHAR NOT NULL DEFAULT '22:00 - 08:00'",
        }
        for column, statement in user_required_columns.items():
            if column not in existing_user_columns:
                connection.execute(text(statement))
        existing_group_columns = {
            row[1]
            for row in connection.execute(text("PRAGMA table_info('groups')")).fetchall()
        }
        if 'is_public' not in existing_group_columns:
            connection.execute(text("ALTER TABLE groups ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT 0"))

        existing_columns = {
            row[1]
            for row in connection.execute(text("PRAGMA table_info('chat_messages')")).fetchall()
        }
        required_columns = {
            'message_type': "ALTER TABLE chat_messages ADD COLUMN message_type VARCHAR DEFAULT 'text'",
            'media_url': "ALTER TABLE chat_messages ADD COLUMN media_url VARCHAR",
            'media_type': "ALTER TABLE chat_messages ADD COLUMN media_type VARCHAR",
            'reply_message_id': "ALTER TABLE chat_messages ADD COLUMN reply_message_id INTEGER",
            'reply_content': "ALTER TABLE chat_messages ADD COLUMN reply_content VARCHAR",
            'reply_author_nickname': "ALTER TABLE chat_messages ADD COLUMN reply_author_nickname VARCHAR",
            'quote_post_id': "ALTER TABLE chat_messages ADD COLUMN quote_post_id INTEGER",
            'quote_caption': "ALTER TABLE chat_messages ADD COLUMN quote_caption VARCHAR",
            'quote_thumbnail_url': "ALTER TABLE chat_messages ADD COLUMN quote_thumbnail_url VARCHAR",
            'quote_author_nickname': "ALTER TABLE chat_messages ADD COLUMN quote_author_nickname VARCHAR",
        }
        for column, statement in required_columns.items():
            if column not in existing_columns:
                connection.execute(text(statement))

        existing_comment_columns = {
            row[1]
            for row in connection.execute(text("PRAGMA table_info('comments')")).fetchall()
        }
        if 'parent_id' not in existing_comment_columns:
            connection.execute(text("ALTER TABLE comments ADD COLUMN parent_id INTEGER"))


def delete_local_upload(path_value: str | None):
    if not path_value or not path_value.startswith('/uploads/'):
        return
    target = Path(path_value.lstrip('/'))
    try:
        if target.exists() and target.is_file():
            target.unlink()
    except OSError:
        pass


def cleanup_expired_media():
    cutoff = datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)
    with SessionLocal() as session:
        expired_posts = session.query(Post).filter(Post.created_at < cutoff).all()
        expired_post_ids = [post.id for post in expired_posts]
        for post in expired_posts:
            delete_local_upload(post.file_url)
            delete_local_upload(post.thumbnail_url)

        if expired_post_ids:
            expired_comment_ids = [
                row[0]
                for row in session.query(Comment.id).filter(Comment.post_id.in_(expired_post_ids)).all()
            ]
            if expired_comment_ids:
                session.query(CommentReaction).filter(CommentReaction.comment_id.in_(expired_comment_ids)).delete(synchronize_session=False)
            session.query(Like).filter(Like.post_id.in_(expired_post_ids)).delete(synchronize_session=False)
            session.query(Comment).filter(Comment.post_id.in_(expired_post_ids)).delete(synchronize_session=False)
            expired_post_ids_sql = ','.join(str(post_id) for post_id in expired_post_ids)
            if expired_post_ids_sql:
                session.execute(
                    text(
                        f"""
                        UPDATE chat_messages
                        SET quote_post_id = NULL,
                            quote_caption = NULL,
                            quote_thumbnail_url = NULL,
                            quote_author_nickname = NULL
                        WHERE quote_post_id IN ({expired_post_ids_sql})
                        """
                    )
                )
            for post in expired_posts:
                session.delete(post)

        expired_stories = session.query(UserStory).filter(UserStory.created_at < cutoff).all()
        for story in expired_stories:
            delete_local_upload(story.file_url)
            session.delete(story)

        expired_chat_media = (
            session.query(ChatMessage)
            .filter(ChatMessage.created_at < cutoff, ChatMessage.media_url.is_not(None))
            .all()
        )
        for message in expired_chat_media:
            delete_local_upload(message.media_url)
            message.media_url = None
            message.media_type = None

        session.commit()


async def cleanup_worker():
    while True:
        cleanup_expired_media()
        await asyncio.sleep(60 * 60)


ensure_runtime_columns()

app = FastAPI(title="Hourly Group Story API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(groups.router, prefix="/groups", tags=["groups"])
app.include_router(posts.router, prefix="/posts", tags=["posts"])
app.include_router(comments.router, prefix="/comments", tags=["comments"])
app.include_router(videos.router, prefix="/videos", tags=["videos"])
app.include_router(stories.router, prefix="/stories", tags=["stories"])
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.on_event('startup')
async def startup_cleanup():
    cleanup_expired_media()
    app.state.cleanup_task = asyncio.create_task(cleanup_worker())


@app.on_event('shutdown')
async def shutdown_cleanup():
    task = getattr(app.state, 'cleanup_task', None)
    if task:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task

@app.get("/")
def root():
    return {"message": "Hourly Group Story API running"}
