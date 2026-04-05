# Quick start

## Mobile
```bash
cd mobile
npm install
cp .env.example .env
npx expo start
```

`mobile/.env` 안에서 `EXPO_PUBLIC_API_URL`을 앱이 붙을 서버 주소로 맞추면 됩니다.

### Android build
`logo.png`를 기준으로 앱 아이콘/스플래시가 `mobile/assets/`에 연결돼 있습니다.

```bash
cd mobile
npx eas build --platform android --profile production
```

실제 Play Store 업로드 전에 아래 값은 본인 기준으로 바꿔야 합니다.
- `mobile/app.json`의 `android.package`

Play Store 제출은:

```bash
cd mobile
npx eas submit --platform android --profile production
```

## Server
```bash
cd server
python3 -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Optional email verification SMTP
실제 이메일 인증 메일을 보내려면 `server/.env`에 아래 값을 채우세요. 발신 주소는 `SMTP_FROM`입니다.

```bash
SECRET_KEY=change-me-to-a-long-random-secret
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your@email.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=your@email.com
SMTP_USE_STARTTLS=true
# 465 SSL 서버면:
# SMTP_PORT=465
# SMTP_USE_SSL=true
```

설정이 없으면 개발용 인증코드가 회원가입 화면에 표시됩니다.

## Recommended next steps
1. Replace demo auth with real JWT decoding dependency.
2. Store files in Cloudflare R2 or S3.
3. Add Redis queue and background rendering worker.
4. Add Expo push token registration endpoint.
5. Replace placeholder daily render with real FFmpeg pipeline.
