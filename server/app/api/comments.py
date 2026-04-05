from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.group import Comment, CommentReaction, GroupMember, Post
from app.models.user import User
from app.schemas.group import CommentIn, CommentReactionIn

router = APIRouter()
ALLOWED_REACTIONS = {'❤️', '😂', '🔥', '😮', '👏'}

def get_post_for_member(post_id: int, db: Session, current_user: User) -> Post:
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail='Post not found')
    membership = db.query(GroupMember).filter(GroupMember.group_id == post.group_id, GroupMember.user_id == current_user.id).first()
    if not membership:
        raise HTTPException(status_code=403, detail='Not a member of this group')
    return post


def serialize_comment(
    comment: Comment,
    author: User | None,
    current_user: User,
    reaction_rows: list[tuple[str, int]],
    my_reaction: str | None,
    replies: list[dict] | None = None,
):
    return {
        'id': comment.id,
        'content': comment.content,
        'parent_id': comment.parent_id,
        'created_at': comment.created_at.isoformat() if comment.created_at else None,
        'reply_count': len(replies or []),
        'my_reaction': my_reaction,
        'reactions': [{'emoji': emoji, 'count': count} for emoji, count in reaction_rows],
        'user': {
            'id': author.id if author else comment.user_id,
            'nickname': author.nickname if author else 'Unknown',
            'profile_image': author.profile_image if author else None,
        },
        'replies': replies or [],
    }


@router.post('/post/{post_id}')
def create_comment(post_id: int, payload: CommentIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    post = get_post_for_member(post_id, db, current_user)
    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail='댓글 내용을 입력해 주세요.')
    if payload.parent_id is not None:
        parent = db.query(Comment).filter(Comment.id == payload.parent_id, Comment.post_id == post.id).first()
        if not parent:
            raise HTTPException(status_code=404, detail='답글을 달 댓글을 찾을 수 없습니다.')
    comment = Comment(post_id=post.id, user_id=current_user.id, parent_id=payload.parent_id, content=content)
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return {
        'id': comment.id,
        'content': comment.content,
        'parent_id': comment.parent_id,
        'created_at': comment.created_at.isoformat() if comment.created_at else None,
    }

@router.get('/post/{post_id}')
def list_comments(post_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    post = get_post_for_member(post_id, db, current_user)
    comments = db.query(Comment).filter(Comment.post_id == post.id).order_by(Comment.created_at.asc()).all()
    if not comments:
        return []

    user_ids = {comment.user_id for comment in comments}
    authors = {user.id: user for user in db.query(User).filter(User.id.in_(user_ids)).all()}
    comment_ids = [comment.id for comment in comments]

    reaction_counts = (
        db.query(CommentReaction.comment_id, CommentReaction.emoji, func.count(CommentReaction.id))
        .filter(CommentReaction.comment_id.in_(comment_ids))
        .group_by(CommentReaction.comment_id, CommentReaction.emoji)
        .all()
    )
    reactions_by_comment: dict[int, list[tuple[str, int]]] = {}
    for comment_id, emoji, count in reaction_counts:
        reactions_by_comment.setdefault(comment_id, []).append((emoji, count))

    my_reactions = {
        reaction.comment_id: reaction.emoji
        for reaction in db.query(CommentReaction).filter(CommentReaction.comment_id.in_(comment_ids), CommentReaction.user_id == current_user.id).all()
    }

    replies_by_parent: dict[int, list[dict]] = {}
    roots: list[dict] = []
    for comment in comments:
        serialized = serialize_comment(
            comment=comment,
            author=authors.get(comment.user_id),
            current_user=current_user,
            reaction_rows=reactions_by_comment.get(comment.id, []),
            my_reaction=my_reactions.get(comment.id),
        )
        if comment.parent_id is None:
            roots.append(serialized)
        else:
            replies_by_parent.setdefault(comment.parent_id, []).append(serialized)

    for root in roots:
        root['replies'] = replies_by_parent.get(root['id'], [])
        root['reply_count'] = len(root['replies'])

    return roots


@router.post('/{comment_id}/reaction')
def react_to_comment(
    comment_id: int,
    payload: CommentReactionIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comment = db.query(Comment).filter(Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail='Comment not found')
    get_post_for_member(comment.post_id, db, current_user)

    emoji = payload.emoji.strip()
    if emoji not in ALLOWED_REACTIONS:
        raise HTTPException(status_code=400, detail='지원하지 않는 반응입니다.')

    existing = db.query(CommentReaction).filter(CommentReaction.comment_id == comment_id, CommentReaction.user_id == current_user.id).first()
    if existing and existing.emoji == emoji:
        db.delete(existing)
        db.commit()
        return {'emoji': None}
    if existing:
        existing.emoji = emoji
        db.add(existing)
        db.commit()
        return {'emoji': emoji}

    db.add(CommentReaction(comment_id=comment_id, user_id=current_user.id, emoji=emoji))
    db.commit()
    return {'emoji': emoji}
