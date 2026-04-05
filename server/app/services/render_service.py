from pathlib import Path
from typing import Sequence

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from moviepy import ColorClip, CompositeVideoClip, ImageClip, VideoFileClip, concatenate_videoclips


VIDEO_WIDTH = 1080
VIDEO_HEIGHT = 1920
FPS = 24
SLOT_DURATION = 1.6
BACKGROUND_COLOR = (10, 10, 10)
CARD_COLOR = (23, 23, 23)
LINE_COLOR = (42, 42, 42)
TEXT_COLOR = (247, 242, 236)
SUBTEXT_COLOR = (183, 170, 156)
SERVER_ROOT = Path(__file__).resolve().parents[2]
GENERATED_ROOT = SERVER_ROOT / 'generated'


def _font(size: int):
    try:
        return ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Unicode.ttf', size)
    except OSError:
        try:
            return ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', size)
        except OSError:
            return ImageFont.load_default()


def _resolve_media_path(path_value: str | None) -> Path | None:
    if not path_value:
        return None
    if path_value.startswith('/'):
        candidate = SERVER_ROOT / path_value.lstrip('/')
    else:
        candidate = SERVER_ROOT / path_value
    return candidate if candidate.exists() else None


def _placeholder_clip(hour: int, nickname: str, width: int, height: int):
    image = Image.new('RGB', (width, height), CARD_COLOR)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((0, 0, width - 1, height - 1), radius=28, outline=LINE_COLOR, width=2)

    draw.text((36, 28), nickname, fill=TEXT_COLOR, font=_font(34))
    hour_text = f'{hour:02d}:00'
    _, _, hour_right, _ = draw.textbbox((0, 0), hour_text, font=_font(54))
    _, _, emoji_right, _ = draw.textbbox((0, 0), '😴💤', font=_font(74))
    draw.text(((width - hour_right) / 2, height * 0.34), hour_text, fill=TEXT_COLOR, font=_font(54))
    draw.text(((width - emoji_right) / 2, height * 0.52), '😴💤', fill=TEXT_COLOR, font=_font(74))
    return ImageClip(np.array(image)).with_duration(SLOT_DURATION)


def _label_clip(hour: int, nickname: str, width: int, height: int):
    image = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((24, 20, 280, 116), radius=24, fill=(0, 0, 0, 150))
    draw.text((46, 34), f'{hour:02d}:00', fill=TEXT_COLOR, font=_font(36))
    draw.text((46, 74), nickname, fill=SUBTEXT_COLOR, font=_font(24))
    return ImageClip(np.array(image)).with_duration(SLOT_DURATION)


def _media_clip(path_value: str, hour: int, nickname: str, width: int, height: int):
    resolved = _resolve_media_path(path_value)
    if not resolved:
        return _placeholder_clip(hour, nickname, width, height)

    suffix = resolved.suffix.lower()
    base = ColorClip((width, height), color=BACKGROUND_COLOR).with_duration(SLOT_DURATION)
    if suffix in {'.mp4', '.mov', '.m4v', '.avi'}:
        clip = VideoFileClip(str(resolved)).without_audio()
        if clip.duration and clip.duration > SLOT_DURATION:
            clip = clip.subclipped(0, SLOT_DURATION)
        clip = clip.with_duration(SLOT_DURATION)
    else:
        clip = ImageClip(str(resolved)).with_duration(SLOT_DURATION)

    scale = min(width / clip.w, height / clip.h)
    fitted = clip.resized(scale).with_position(('center', 'center'))
    labeled = _label_clip(hour, nickname, width, height).with_position((0, 0))
    return CompositeVideoClip([base, fitted, labeled], size=(width, height)).with_duration(SLOT_DURATION)


def _slot_clip(hour: int, entries: Sequence[dict]):
    member_count = max(len(entries), 1)
    segment_heights = []
    base_height = VIDEO_HEIGHT // member_count
    consumed_height = 0
    for index in range(member_count):
        height = VIDEO_HEIGHT - consumed_height if index == member_count - 1 else base_height
        segment_heights.append(height)
        consumed_height += height
    segments = [ColorClip((VIDEO_WIDTH, VIDEO_HEIGHT), color=BACKGROUND_COLOR).with_duration(SLOT_DURATION)]

    offset_y = 0
    for index, entry in enumerate(entries):
        segment_height = segment_heights[index]
        segment = (
            _media_clip(entry.get('media_path') or '', hour, entry.get('nickname') or 'Unknown', VIDEO_WIDTH, segment_height)
            if entry.get('media_path')
            else _placeholder_clip(hour, entry.get('nickname') or 'Unknown', VIDEO_WIDTH, segment_height)
        ).with_position((0, offset_y))
        segments.append(segment)
        if index < len(entries) - 1:
            divider = ColorClip((VIDEO_WIDTH, 6), color=BACKGROUND_COLOR).with_duration(SLOT_DURATION).with_position((0, offset_y + segment_height - 3))
            segments.append(divider)
        offset_y += segment_height

    return CompositeVideoClip(segments, size=(VIDEO_WIDTH, VIDEO_HEIGHT)).with_duration(SLOT_DURATION)


def render_daily_video(group_id: int, date_str: str, slot_layouts: Sequence[dict]) -> str:
    GENERATED_ROOT.mkdir(exist_ok=True)
    output = GENERATED_ROOT / f'group_{group_id}_{date_str}.mp4'
    slot_clips = [_slot_clip(slot.get('hour', 0), slot.get('entries', [])) for slot in slot_layouts]
    final_clip = concatenate_videoclips(slot_clips, method='compose')
    final_clip.write_videofile(
        str(output),
        fps=FPS,
        codec='libx264',
        audio=False,
        logger=None,
    )
    final_clip.close()
    for clip in slot_clips:
        clip.close()
    return f"/generated/{output.name}"
