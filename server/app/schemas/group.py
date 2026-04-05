from pydantic import BaseModel

class GroupCreateIn(BaseModel):
    name: str
    max_members: int = 10
    is_public: bool = False

class JoinGroupIn(BaseModel):
    invite_code: str

class CommentIn(BaseModel):
    content: str
    parent_id: int | None = None


class CommentReactionIn(BaseModel):
    emoji: str


class ChatMessageIn(BaseModel):
    content: str
    quote_post_id: int | None = None


class ChatSharePostIn(BaseModel):
    post_id: int
    mode: str = 'quote'
