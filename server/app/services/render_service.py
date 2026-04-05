from pathlib import Path
from typing import Sequence

import imageio.v2 as imageio
import numpy as np
from PIL import Image, ImageDraw, ImageFont


VIDEO_WIDTH = 1088
VIDEO_HEIGHT = 1920
FPS = 12
SLOT_DURATION = 1.6
BACKGROUND_COLOR = (10, 10, 10)
CARD_COLOR = (24, 20, 18)
LINE_COLOR = (69, 54, 44)
TEXT_COLOR = (247, 242, 236)
SUBTEXT_COLOR = (183, 170, 156)
ACCENT_COLOR = (212, 108, 61)
SERVER_ROOT = Path(__file__).resolve().parents[2]
GENERATED_ROOT = SERVER_ROOT / 'generated'
MEDIA_SUFFIXES = {'.jpg', '.jpeg', '.png', '.webp', '.bmp'}
VIDEO_SUFFIXES = {'.mp4', '.mov', '.m4v', '.avi'}


def _font(size: int):
    for path in (
        '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
        '/System/Library/Fonts/Supplemental/Helvetica.ttc',
        '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
        '/System/Library/Fonts/Supplemental/Arial.ttf',
    ):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _emoji_font(size: int):
    for path in (
        '/System/Library/Fonts/Apple Color Emoji.ttc',
        '/System/Library/Fonts/AppleColorEmoji.ttc',
        '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
    ):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _resolve_media_path(path_value: str | None) -> Path | None:
    if not path_value:
        return None
    candidate = SERVER_ROOT / path_value.lstrip('/') if path_value.startswith('/') else SERVER_ROOT / path_value
    return candidate if candidate.exists() else None


def _fit_cover(image: Image.Image, width: int, height: int) -> Image.Image:
    source = image.convert('RGB')
    scale = max(width / source.width, height / source.height)
    resized = source.resize((max(1, int(source.width * scale)), max(1, int(source.height * scale))))
    left = max((resized.width - width) // 2, 0)
    top = max((resized.height - height) // 2, 0)
    return resized.crop((left, top, left + width, top + height))


def _load_visual(path_value: str | None, width: int, height: int) -> Image.Image | None:
    resolved = _resolve_media_path(path_value)
    if not resolved:
        return None
    suffix = resolved.suffix.lower()
    try:
        if suffix in MEDIA_SUFFIXES:
            return _fit_cover(Image.open(resolved), width, height)
        if suffix in VIDEO_SUFFIXES:
            reader = imageio.get_reader(str(resolved))
            try:
                frame = reader.get_data(0)
            finally:
                reader.close()
            return _fit_cover(Image.fromarray(frame), width, height)
    except Exception:
        return None
    return None


def _text_size(draw: ImageDraw.ImageDraw, text: str, font) -> tuple[float, float]:
    _, _, right, bottom = draw.textbbox((0, 0), text, font=font)
    return float(right), float(bottom)


def _draw_centered(
    draw: ImageDraw.ImageDraw,
    text: str,
    center_x: int,
    y: int,
    font,
    fill,
    stroke_width: int = 0,
    stroke_fill=None,
):
    width, height = _text_size(draw, text, font)
    draw.text(
        (center_x - width / 2, y),
        text,
        font=font,
        fill=fill,
        stroke_width=stroke_width,
        stroke_fill=stroke_fill,
    )
    return width, height


def _placeholder_card(hour: int, nickname: str, width: int, height: int) -> Image.Image:
    image = Image.new('RGB', (width, height), CARD_COLOR)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((0, 0, width - 1, height - 1), radius=28, outline=LINE_COLOR, width=2)
    draw.text(
        (40, 34),
        nickname,
        fill=TEXT_COLOR,
        font=_font(max(22, min(30, height // 10))),
        stroke_width=1,
        stroke_fill=(0, 0, 0),
    )

    hour_font = _font(max(34, min(58, height // 5)))
    emoji_font = _emoji_font(max(34, min(52, height // 5)))
    center_x = width // 2
    start_y = max(height // 3 - 18, 86)
    _, hour_height = _draw_centered(
        draw,
        f'{hour:02d}:00',
        center_x,
        start_y,
        hour_font,
        TEXT_COLOR,
        stroke_width=2,
        stroke_fill=(0, 0, 0),
    )
    sleepy_y = start_y + hour_height + 22
    sleepy_gap = 24
    sleepy_left_x = center_x - sleepy_gap
    sleepy_right_x = center_x + sleepy_gap
    _, sleepy_height = _draw_centered(
        draw,
        '😴',
        sleepy_left_x,
        sleepy_y,
        emoji_font,
        TEXT_COLOR,
        stroke_width=2,
        stroke_fill=(0, 0, 0),
    )
    _draw_centered(
        draw,
        '💤',
        sleepy_right_x,
        sleepy_y + max(4, sleepy_height * 0.12),
        emoji_font,
        TEXT_COLOR,
        stroke_width=2,
        stroke_fill=(0, 0, 0),
    )
    return image


def _media_card(path_value: str | None, hour: int, nickname: str, caption: str, width: int, height: int) -> Image.Image:
    visual = _load_visual(path_value, width, height)
    if visual is None:
        return _placeholder_card(hour, nickname, width, height)

    image = visual.convert('RGB')
    draw = ImageDraw.Draw(image)
    draw.text(
        (40, 34),
        nickname,
        fill=TEXT_COLOR,
        font=_font(max(22, min(30, height // 10))),
        stroke_width=1,
        stroke_fill=(0, 0, 0),
    )

    center_x = width // 2
    time_font = _font(max(34, min(58, height // 5)))
    caption_font = _font(max(20, min(26, height // 11)))
    time_top = max(height // 2 - 66, 120)
    _, time_height = _draw_centered(
        draw,
        f'{hour:02d}:00',
        center_x,
        time_top,
        time_font,
        TEXT_COLOR,
        stroke_width=2,
        stroke_fill=(0, 0, 0),
    )
    clean_caption = (caption or '').strip()
    if clean_caption:
        max_len = 28
        display_caption = clean_caption if len(clean_caption) <= max_len else f'{clean_caption[:max_len]}...'
        _draw_centered(
            draw,
            display_caption,
            center_x,
            time_top + 18 + time_height,
            caption_font,
            TEXT_COLOR,
            stroke_width=2,
            stroke_fill=(0, 0, 0),
        )
    return image


def _slot_frame(hour: int, entries: Sequence[dict]) -> np.ndarray:
    canvas = Image.new('RGB', (VIDEO_WIDTH, VIDEO_HEIGHT), BACKGROUND_COLOR)
    draw = ImageDraw.Draw(canvas)
    draw.text((40, 28), f'{hour:02d}:00', fill=TEXT_COLOR, font=_font(34), stroke_width=1, stroke_fill=(0, 0, 0))
    draw.text((40, 72), 'today recap', fill=SUBTEXT_COLOR, font=_font(24), stroke_width=1, stroke_fill=(0, 0, 0))

    member_count = max(len(entries), 1)
    vertical_gap = 18
    horizontal_padding = 18
    available_height = VIDEO_HEIGHT - vertical_gap * (member_count + 1)
    base_height = max(120, available_height // member_count)

    offset_y = vertical_gap
    consumed_height = 0
    card_width = VIDEO_WIDTH - horizontal_padding * 2
    for index, entry in enumerate(entries):
        card_height = available_height - consumed_height if index == member_count - 1 else base_height
        consumed_height += card_height
        card = _media_card(
            entry.get('media_path'),
            hour,
            entry.get('nickname') or 'Unknown',
            entry.get('caption') or '',
            card_width,
            card_height,
        )
        canvas.paste(card, (horizontal_padding, offset_y))
        offset_y += card_height + vertical_gap

    return np.array(canvas)


def render_daily_video(group_id: int, date_str: str, slot_layouts: Sequence[dict]) -> str:
    GENERATED_ROOT.mkdir(exist_ok=True)
    output = GENERATED_ROOT / f'group_{group_id}_{date_str}.mp4'
    frames_per_slot = max(1, int(FPS * SLOT_DURATION))

    with imageio.get_writer(str(output), fps=FPS, codec='libx264', format='FFMPEG') as writer:
        for slot in slot_layouts:
            frame = _slot_frame(slot.get('hour', 0), slot.get('entries', []))
            for _ in range(frames_per_slot):
                writer.append_data(frame)

    return f"/generated/{output.name}"
