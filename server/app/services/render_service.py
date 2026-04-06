from functools import lru_cache
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
TEXT_FONT_PATHS = (
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    '/System/Library/Fonts/Supplemental/Helvetica.ttc',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
)
UNICODE_FONT_PATHS = (
    '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
    '/usr/share/fonts/opentype/unifont/unifont.otf',
    '/usr/share/fonts/opentype/unifont/unifont_upper.otf',
    '/usr/share/fonts/opentype/unifont/unifont_jp.otf',
)
EMOJI_FONT_PATHS = (
    '/System/Library/Fonts/Apple Color Emoji.ttc',
    '/System/Library/Fonts/AppleColorEmoji.ttc',
    '/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf',
    '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
    '/usr/share/fonts/opentype/unifont/unifont.otf',
)
EMOJI_JOINERS = {0x200D, 0xFE0E, 0xFE0F, 0x20E3}
BITMAP_EMOJI_SIZE = 109


def _load_font(paths: Sequence[str], size: int):
    for path in paths:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _contains_unicode_text(text: str) -> bool:
    return any(ord(char) > 127 and not _is_emoji_codepoint(ord(char)) for char in text)


def _font(size: int, text: str = ''):
    if _contains_unicode_text(text):
        return _load_font(UNICODE_FONT_PATHS + TEXT_FONT_PATHS, size)
    return _load_font(TEXT_FONT_PATHS + UNICODE_FONT_PATHS, size)


def _emoji_font(size: int):
    return _load_font(EMOJI_FONT_PATHS, size)


@lru_cache(maxsize=256)
def _emoji_image(text: str, target_size: int) -> Image.Image | None:
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf', BITMAP_EMOJI_SIZE)
    except OSError:
        try:
            fallback_font = _load_font(EMOJI_FONT_PATHS, target_size)
            canvas = Image.new('RGBA', (max(target_size * max(len(text), 1) * 2, 64), max(target_size * 2, 64)), (0, 0, 0, 0))
            draw = ImageDraw.Draw(canvas)
            bbox = draw.textbbox((0, 0), text, font=fallback_font)
            if bbox[2] <= bbox[0] or bbox[3] <= bbox[1]:
                return None
            draw.text((-bbox[0], -bbox[1]), text, font=fallback_font, embedded_color=True)
            return canvas.crop((0, 0, bbox[2] - bbox[0], bbox[3] - bbox[1]))
        except Exception:
            return None

    canvas_width = max(BITMAP_EMOJI_SIZE * max(len(text), 1) * 2, BITMAP_EMOJI_SIZE * 2)
    canvas = Image.new('RGBA', (canvas_width, BITMAP_EMOJI_SIZE * 2), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    bbox = draw.textbbox((0, 0), text, font=font, embedded_color=True)
    if bbox[2] <= bbox[0] or bbox[3] <= bbox[1]:
        return None
    draw.text((-bbox[0], -bbox[1]), text, font=font, embedded_color=True)
    cropped = canvas.crop((0, 0, bbox[2] - bbox[0], bbox[3] - bbox[1]))

    scale = target_size / max(cropped.height, 1)
    resized_width = max(1, int(round(cropped.width * scale)))
    resized_height = max(1, int(round(cropped.height * scale)))
    return cropped.resize((resized_width, resized_height), Image.Resampling.LANCZOS)


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
    left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
    return float(right - left), float(bottom - top)


def _is_emoji_codepoint(codepoint: int) -> bool:
    if codepoint in EMOJI_JOINERS or 0x1F3FB <= codepoint <= 0x1F3FF:
        return True
    return any(
        start <= codepoint <= end
        for start, end in (
            (0x00A9, 0x00AE),
            (0x203C, 0x3299),
            (0x1F000, 0x1FAFF),
        )
    )


def _split_text_runs(text: str) -> list[tuple[str, bool]]:
    runs: list[tuple[str, bool]] = []
    current = ''
    current_is_emoji: bool | None = None

    for char in text:
        is_emoji = _is_emoji_codepoint(ord(char))
        if current_is_emoji is None or is_emoji == current_is_emoji or (current_is_emoji and ord(char) in EMOJI_JOINERS):
            current += char
            current_is_emoji = is_emoji if current_is_emoji is None else current_is_emoji
            continue
        runs.append((current, bool(current_is_emoji)))
        current = char
        current_is_emoji = is_emoji

    if current:
        runs.append((current, bool(current_is_emoji)))
    return runs


def _text_segments_size(
    draw: ImageDraw.ImageDraw,
    text: str,
    text_font,
    emoji_font,
) -> tuple[float, float]:
    width = 0.0
    height = 0.0
    for segment, is_emoji in _split_text_runs(text):
        if is_emoji:
            emoji_image = _emoji_image(segment, max(emoji_font.size, 16))
            if emoji_image is not None:
                segment_width, segment_height = emoji_image.size
            else:
                segment_width, segment_height = _text_size(draw, segment, emoji_font)
        else:
            segment_width, segment_height = _text_size(draw, segment, text_font)
        width += segment_width
        height = max(height, segment_height)
    return width, height


def _fit_font(draw: ImageDraw.ImageDraw, text: str, max_width: int, preferred_size: int, minimum_size: int = 14):
    size = preferred_size
    while size >= minimum_size:
        font = _font(size, text)
        emoji_font = _emoji_font(max(minimum_size, size))
        width, _ = _text_segments_size(draw, text, font, emoji_font)
        if width <= max_width:
            return font
        size -= 2
    return _font(minimum_size, text)


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


def _draw_text_segments(
    image: Image.Image,
    draw: ImageDraw.ImageDraw,
    text: str,
    x: float,
    y: float,
    text_font,
    emoji_font,
    fill,
    stroke_width: int = 0,
    stroke_fill=None,
):
    current_x = x
    width = 0.0
    height = 0.0
    for segment, is_emoji in _split_text_runs(text):
        if is_emoji:
            emoji_image = _emoji_image(segment, max(emoji_font.size, 16))
            if emoji_image is not None:
                image.paste(emoji_image, (int(round(current_x)), int(round(y))), emoji_image)
                segment_width, segment_height = emoji_image.size
            else:
                segment_width, segment_height = _text_size(draw, segment, emoji_font)
                draw.text((current_x, y), segment, font=emoji_font, fill=fill, embedded_color=True)
        else:
            segment_width, segment_height = _text_size(draw, segment, text_font)
            draw.text(
                (current_x, y),
                segment,
                font=text_font,
                fill=fill,
                stroke_width=stroke_width,
                stroke_fill=stroke_fill,
            )
        current_x += segment_width
        width += segment_width
        height = max(height, segment_height)
    return width, height


def _draw_centered_segments(
    image: Image.Image,
    draw: ImageDraw.ImageDraw,
    text: str,
    center_x: int,
    y: int,
    text_font,
    emoji_font,
    fill,
    stroke_width: int = 0,
    stroke_fill=None,
):
    width, height = _text_segments_size(draw, text, text_font, emoji_font)
    _draw_text_segments(image, draw, text, center_x - width / 2, y, text_font, emoji_font, fill, stroke_width, stroke_fill)
    return width, height


def _draw_emoji_centered(
    image: Image.Image,
    draw: ImageDraw.ImageDraw,
    text: str,
    center_x: int,
    y: int,
    size: int,
):
    emoji_image = _emoji_image(text, size)
    if emoji_image is not None:
        left = int(round(center_x - emoji_image.width / 2))
        image.paste(emoji_image, (left, int(round(y))), emoji_image)
        return float(emoji_image.width), float(emoji_image.height)

    font = _emoji_font(size)
    width, height = _text_size(draw, text, font)
    draw.text((center_x - width / 2, y), text, font=font, embedded_color=True)
    return width, height


def _member_scale(member_count: int) -> tuple[int, int, int]:
    if member_count <= 2:
        return 30, 58, 26
    if member_count <= 4:
        return 28, 52, 24
    if member_count <= 6:
        return 24, 46, 22
    return 22, 40, 20


def _placeholder_card(hour: int, nickname: str, width: int, height: int, member_count: int) -> Image.Image:
    image = Image.new('RGB', (width, height), CARD_COLOR)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((0, 0, width - 1, height - 1), radius=28, outline=LINE_COLOR, width=2)
    nickname_size, time_size, caption_size = _member_scale(member_count)
    nickname_font = _fit_font(draw, nickname, width - 80, min(nickname_size, max(18, height // 8)), 16)
    nickname_emoji_font = _emoji_font(max(16, nickname_font.size))
    _draw_text_segments(image, draw, nickname, 40, 34, nickname_font, nickname_emoji_font, TEXT_COLOR, stroke_width=1, stroke_fill=(0, 0, 0))

    hour_font = _font(max(30, min(time_size, height // 4)), f'{hour:02d}:00')
    emoji_size = max(32, min(caption_size + 16, height // 4))
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
        ' ',
        sleepy_left_x,
        sleepy_y,
        hour_font,
        TEXT_COLOR,
    )
    _draw_emoji_centered(image, draw, '😴', sleepy_left_x, sleepy_y, emoji_size)
    _draw_emoji_centered(image, draw, '💤', sleepy_right_x, sleepy_y + max(4, sleepy_height * 0.12), emoji_size)
    return image


def _media_card(path_value: str | None, hour: int, nickname: str, caption: str, width: int, height: int, member_count: int) -> Image.Image:
    visual = _load_visual(path_value, width, height)
    if visual is None:
        return _placeholder_card(hour, nickname, width, height, member_count)

    image = visual.convert('RGB')
    draw = ImageDraw.Draw(image)
    nickname_size, time_size, caption_size = _member_scale(member_count)
    nickname_font = _fit_font(draw, nickname, width - 80, min(nickname_size, max(18, height // 8)), 16)
    nickname_emoji_font = _emoji_font(max(16, nickname_font.size))
    _draw_text_segments(image, draw, nickname, 40, 34, nickname_font, nickname_emoji_font, TEXT_COLOR, stroke_width=1, stroke_fill=(0, 0, 0))

    center_x = width // 2
    time_font = _font(max(30, min(time_size, height // 4)), f'{hour:02d}:00')
    caption_font = _fit_font(draw, (caption or '').strip()[:28] or ' ', width - 72, min(caption_size, max(18, height // 9)), 16)
    caption_emoji_font = _emoji_font(max(16, caption_font.size))
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
        _draw_centered_segments(
            image,
            draw,
            display_caption,
            center_x,
            time_top + 18 + time_height,
            caption_font,
            caption_emoji_font,
            TEXT_COLOR,
            stroke_width=2,
            stroke_fill=(0, 0, 0),
        )
    return image


def _slot_frame(hour: int, entries: Sequence[dict]) -> np.ndarray:
    canvas = Image.new('RGB', (VIDEO_WIDTH, VIDEO_HEIGHT), BACKGROUND_COLOR)
    draw = ImageDraw.Draw(canvas)
    draw.text((40, 28), f'{hour:02d}:00', fill=TEXT_COLOR, font=_font(34, f'{hour:02d}:00'), stroke_width=1, stroke_fill=(0, 0, 0))
    draw.text((40, 72), 'today recap', fill=SUBTEXT_COLOR, font=_font(24, 'today recap'), stroke_width=1, stroke_fill=(0, 0, 0))

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
            member_count,
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
