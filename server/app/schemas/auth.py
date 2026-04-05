from pydantic import BaseModel, EmailStr

class EmailRequestIn(BaseModel):
    email: EmailStr

class EmailVerifyIn(BaseModel):
    email: EmailStr
    code: str

class SignupIn(BaseModel):
    email: EmailStr
    password: str
    nickname: str
    verification_token: str

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class TokenOut(BaseModel):
    access_token: str
    token_type: str = 'bearer'


class EmailRequestOut(BaseModel):
    sent: bool = True
    expires_in_seconds: int = 600
    dev_code: str | None = None


class EmailVerifyOut(BaseModel):
    verified: bool = True
    verification_token: str


class ProfileOut(BaseModel):
    id: int
    email: EmailStr
    nickname: str
    profile_image: str | None = None
    is_public: bool = True
    intro: str = ''
    push_enabled: bool = True
    music_preview: bool = True
    theme_mode: str = 'light'
    timezone_label: str = 'Asia/Seoul'
    quiet_hours_enabled: bool = False
    quiet_hours: str = '22:00 - 08:00'
    follower_count: int = 0
    following_count: int = 0
