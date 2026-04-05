# Hourly Group Story — Full-stack starter

This is a polished starter for a social app where up to 10 members join by invite code, upload a photo or video every hour within a 30-minute window, add draggable text overlays, and receive a daily auto-generated recap video.

## What is included
- Expo React Native app
- FastAPI backend
- JWT auth
- Profile settings
- Invite-code based groups (max 10)
- Hourly slots (00~30 minutes)
- Photo/video post upload with caption, text position, filter selection, music selection
- Story-style feed UI
- Likes and comments
- Push notification scaffolding
- Daily recap rendering scaffolding with FFmpeg

## What still needs real infrastructure hookup
- Real file uploads to S3/R2
- Real push provider credentials (Expo push)
- Real background queue (Celery / RQ)
- FFmpeg production templates and font assets
- Full e2e testing

## Structure
- `mobile/` Expo app
- `server/` FastAPI server

## Local network note
- When testing from a phone or another device on the same Wi-Fi, run FastAPI with `uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload`.
- Then point the mobile app to your Mac's LAN IP such as `http://192.168.219.101:8000`.

## Environment files
- Mobile: create `mobile/.env` from [`mobile/.env.example`](/Users/hyunho/Downloads/setlog_clone/mobile/.env.example) and set `EXPO_PUBLIC_API_URL`.
- Server: create `server/.env` from [`server/.env.example`](/Users/hyunho/Downloads/setlog_clone/server/.env.example).
- Email sender settings live in `server/.env`:
  - `SMTP_HOST`
  - `SMTP_PORT`
  - `SMTP_USERNAME`
  - `SMTP_PASSWORD`
  - `SMTP_FROM`
  - `SMTP_USE_STARTTLS`
  - `SMTP_USE_SSL`
