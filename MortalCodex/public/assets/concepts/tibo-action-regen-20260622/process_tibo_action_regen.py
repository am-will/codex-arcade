#!/usr/bin/env python3
"""Slice the Tibo action-regeneration imagegen rows into runtime strips."""

from __future__ import annotations

import json
import statistics
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parent
RAW = ROOT / "raw"
RUNTIME = ROOT / "runtime"
CELLS = ROOT / "cells"
MASKS = ROOT / "masks"
REVIEWS = ROOT / "reviews"


@dataclass(frozen=True)
class Anim:
    name: str
    frames: int
    frame_w: int = 320
    frame_h: int = 320
    fps: int = 8
    loop: bool = False
    y_bias: int = 0


ANIMS = (
    Anim("idle", 6, fps=10, loop=True),
    Anim("walk", 6, fps=8, loop=True),
    Anim("jump", 4, fps=8, y_bias=-22),
    Anim("crouch", 4, fps=8, y_bias=10),
    Anim("block", 3, fps=8),
    Anim("light", 4, fps=12),
    Anim("heavy", 5, fps=10),
    Anim("special", 6, frame_w=512, fps=12),
    Anim("knockdown", 5, fps=8, y_bias=12),
)

STANDING_TARGET_HEIGHT = 284
LOW_TARGET_HEIGHT = 214
KNOCKDOWN_TARGET_HEIGHT = 180
BASELINE = 304


def main() -> None:
    for folder in (RUNTIME, CELLS, MASKS, REVIEWS):
        folder.mkdir(parents=True, exist_ok=True)

    cut_rows = {anim.name: chroma_cut(Image.open(RAW / f"{anim.name}-raw-magenta.png").convert("RGBA")) for anim in ANIMS}
    base_scale = determine_base_scale(cut_rows)
    report: dict[str, object] = {
        "method": "imagegen action rows, magenta chroma key, equal row slicing, shared body-scale normalization",
        "baseScale": base_scale,
        "standingTargetHeight": STANDING_TARGET_HEIGHT,
        "animations": {},
    }

    review_rows: list[tuple[Anim, list[Image.Image]]] = []
    for anim in ANIMS:
        cells, row_report = process_anim(anim, cut_rows[anim.name], base_scale)
        strip = hstack(cells)
        mask = hstack([cell.getchannel("A").convert("RGBA") for cell in cells])
        strip.save(RUNTIME / f"{anim.name}.png")
        mask.save(MASKS / f"{anim.name}-alpha-mask.png")
        for idx, cell in enumerate(cells):
            cell.save(CELLS / f"{anim.name}-{idx:02d}.png")
        report["animations"][anim.name] = row_report
        review_rows.append((anim, cells))

    (ROOT / "tibo-action-regen-report.json").write_text(json.dumps(report, indent=2) + "\n")
    build_review(review_rows).save(ROOT / "tibo-action-regen-runtime-review.png")


def determine_base_scale(rows: dict[str, Image.Image]) -> float:
    heights: list[int] = []
    for name in ("idle", "walk", "block", "light", "heavy"):
        row = rows[name]
        frames = next(anim.frames for anim in ANIMS if anim.name == name)
        for crop, _ in overlapped_slices(row, frames):
            bbox = crop.getchannel("A").getbbox()
            if bbox:
                heights.append(bbox[3] - bbox[1])
    if not heights:
        return 1.0
    return STANDING_TARGET_HEIGHT / statistics.median(heights)


def process_anim(anim: Anim, row: Image.Image, base_scale: float) -> tuple[list[Image.Image], dict[str, object]]:
    output: list[Image.Image] = []
    frame_reports: list[dict[str, object]] = []
    source_slices = special_slices(row) if anim.name == "special" else overlapped_slices(row, anim.frames)
    for idx, (crop, center_x) in enumerate(source_slices):
        bbox = crop.getchannel("A").getbbox()
        if bbox is None:
            raise ValueError(f"{anim.name} frame {idx} is empty")
        cleaned_crop = keep_component_near(crop, center_x)
        bbox = cleaned_crop.getchannel("A").getbbox()
        if bbox is None:
            raise ValueError(f"{anim.name} frame {idx} became empty after cleanup")
        tight = cleaned_crop.crop(pad_box(bbox, cleaned_crop.size, 12))
        scale = scale_for_frame(anim, tight, base_scale)
        placed = place_in_runtime_frame(tight, anim, scale)
        alpha = placed.getchannel("A")
        output.append(placed)
        frame_reports.append(
            {
                "frame": idx,
                "sourceBox": bbox,
                "runtimeBox": alpha.getbbox(),
                "scale": scale,
            }
        )
    return output, {"frameWidth": anim.frame_w, "frameHeight": anim.frame_h, "frameCount": anim.frames, "fps": anim.fps, "loop": anim.loop, "frames": frame_reports}


def scale_for_frame(anim: Anim, image: Image.Image, base_scale: float) -> float:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        return base_scale
    width = bbox[2] - bbox[0]
    height = bbox[3] - bbox[1]

    # Preserve a shared body scale for standing actions, but cap unusually wide
    # effects/knockdown poses so they fit the runtime cell without clipping.
    scale = base_scale
    if anim.name == "crouch":
        scale = min(base_scale, LOW_TARGET_HEIGHT / max(height, 1))
    elif anim.name == "knockdown":
        scale = min(base_scale, KNOCKDOWN_TARGET_HEIGHT / max(height, 1))
    elif anim.name == "jump":
        scale = min(base_scale, 264 / max(height, 1))
    elif anim.name == "special":
        body_box = fighter_body_bbox(image)
        if body_box:
            body_h = body_box[3] - body_box[1]
            scale = STANDING_TARGET_HEIGHT / max(body_h, 1)

    max_w = anim.frame_w - 22
    max_h = 292 if anim.name in {"idle", "walk", "block", "light", "heavy", "special"} else anim.frame_h - 18
    if width * scale > max_w:
        scale = max_w / width
    if height * scale > max_h:
        scale = max_h / height
    return scale


def fighter_body_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    """Estimate the human silhouette bbox while ignoring bright energy VFX."""
    rgba = image.convert("RGBA")
    pix = rgba.load()
    xs: list[int] = []
    ys: list[int] = []
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, a = pix[x, y]
            if a < 18:
                continue
            bright_energy = g > 150 and r > 80 and b < 130 and g - max(r, b) > 28
            pale_portal = r > 185 and g > 185 and b > 150
            if bright_energy or pale_portal:
                continue
            xs.append(x)
            ys.append(y)
    if not xs:
        return None
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def place_in_runtime_frame(image: Image.Image, anim: Anim, scale: float) -> Image.Image:
    bbox = image.getchannel("A").getbbox()
    assert bbox is not None
    image = image.crop(bbox)
    resized = image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.Resampling.LANCZOS)
    resized = clean_alpha(resized)
    cell = Image.new("RGBA", (anim.frame_w, anim.frame_h), (0, 0, 0, 0))
    rb = resized.getchannel("A").getbbox()
    assert rb is not None
    left = (anim.frame_w - resized.width) // 2
    if anim.name == "special":
        left = 44
    top = BASELINE + anim.y_bias - resized.height
    if anim.name == "jump":
        top = max(8, min(top, 58))
    if anim.name == "knockdown":
        top = min(BASELINE + anim.y_bias - resized.height, anim.frame_h - resized.height - 4)
    top = max(2, min(top, anim.frame_h - resized.height - 2))
    left = max(2, min(left, anim.frame_w - resized.width - 2))
    cell.alpha_composite(resized, (left, top))
    return cell


def equal_slices(row: Image.Image, count: int) -> list[Image.Image]:
    return [row.crop((round(i * row.width / count), 0, round((i + 1) * row.width / count), row.height)) for i in range(count)]


def overlapped_slices(row: Image.Image, count: int, margin: int = 86) -> list[tuple[Image.Image, int]]:
    slices: list[tuple[Image.Image, int]] = []
    for i in range(count):
        left = round(i * row.width / count)
        right = round((i + 1) * row.width / count)
        crop_left = max(0, left - margin)
        crop_right = min(row.width, right + margin)
        center_x = round((left + right) / 2) - crop_left
        slices.append((row.crop((crop_left, 0, crop_right, row.height)), center_x))
    return slices


def special_slices(row: Image.Image) -> list[tuple[Image.Image, int]]:
    """Use wide, overlapping windows because generated special frames contain beams."""
    width = row.width
    base_boxes = [(0, 390), (245, 720), (535, 1055), (830, 1425), (1115, 1785), (1620, 1881)]
    ratio = width / 1881
    slices: list[tuple[Image.Image, int]] = []
    for left, right in base_boxes:
        l = max(0, round(left * ratio))
        r = min(width, round(right * ratio))
        slices.append((row.crop((l, 0, r, row.height)), (r - l) // 2))
    return slices


def chroma_cut(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    pix = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pix[x, y]
            is_magenta = r > 170 and b > 145 and g < 120 and r - g > 80 and b - g > 70
            if is_magenta:
                pix[x, y] = (255, 255, 255, 0)
            elif a:
                if r > 155 and b > 145 and g < 120:
                    r = min(r, 190)
                    b = min(b, 190)
                pix[x, y] = (r, g, b, a)
    return clean_alpha(image)


def remove_loose_components(image: Image.Image) -> Image.Image:
    """Drop disconnected slivers from neighboring generated frames."""
    image = image.copy()
    alpha = image.getchannel("A")
    pix = alpha.load()
    width, height = image.size
    seen: set[tuple[int, int]] = set()
    components: list[tuple[int, tuple[int, int, int, int], list[tuple[int, int]]]] = []

    for y in range(height):
        for x in range(width):
            if (x, y) in seen or pix[x, y] < 18:
                continue
            stack = [(x, y)]
            seen.add((x, y))
            points: list[tuple[int, int]] = []
            min_x = max_x = x
            min_y = max_y = y
            while stack:
                cx, cy = stack.pop()
                points.append((cx, cy))
                min_x = min(min_x, cx)
                max_x = max(max_x, cx)
                min_y = min(min_y, cy)
                max_y = max(max_y, cy)
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < width and 0 <= ny < height and (nx, ny) not in seen and pix[nx, ny] >= 18:
                        seen.add((nx, ny))
                        stack.append((nx, ny))
            components.append((len(points), (min_x, min_y, max_x + 1, max_y + 1), points))

    if not components:
        return image

    largest_area = max(area for area, _, _ in components)
    keep: set[tuple[int, int]] = set()
    for area, box, points in components:
        touches_side = box[0] <= 2 or box[2] >= width - 2
        tiny = area < max(80, largest_area * 0.018)
        narrow_edge_sliver = touches_side and area < largest_area * 0.45
        if not tiny and not narrow_edge_sliver:
            keep.update(points)

    rgba = image.load()
    for y in range(height):
        for x in range(width):
            if pix[x, y] >= 18 and (x, y) not in keep:
                rgba[x, y] = (255, 255, 255, 0)
    return clean_alpha(image)


def keep_component_near(image: Image.Image, center_x: int) -> Image.Image:
    """Keep the connected silhouette/effect closest to the intended frame center."""
    image = image.copy()
    alpha = image.getchannel("A")
    pix = alpha.load()
    width, height = image.size
    seen: set[tuple[int, int]] = set()
    components: list[tuple[int, float, tuple[int, int, int, int], list[tuple[int, int]]]] = []

    for y in range(height):
        for x in range(width):
            if (x, y) in seen or pix[x, y] < 18:
                continue
            stack = [(x, y)]
            seen.add((x, y))
            points: list[tuple[int, int]] = []
            min_x = max_x = x
            min_y = max_y = y
            sum_x = 0
            while stack:
                cx, cy = stack.pop()
                points.append((cx, cy))
                sum_x += cx
                min_x = min(min_x, cx)
                max_x = max(max_x, cx)
                min_y = min(min_y, cy)
                max_y = max(max_y, cy)
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < width and 0 <= ny < height and (nx, ny) not in seen and pix[nx, ny] >= 18:
                        seen.add((nx, ny))
                        stack.append((nx, ny))
            area = len(points)
            if area < 80:
                continue
            centroid_x = sum_x / max(area, 1)
            components.append((area, centroid_x, (min_x, min_y, max_x + 1, max_y + 1), points))

    if not components:
        return image

    largest_area = max(area for area, _, _, _ in components)
    meaningful = [component for component in components if component[0] >= max(160, largest_area * 0.02)]
    target_component = min(
        meaningful,
        key=lambda component: (
            abs(component[1] - center_x),
            -component[0],
        ),
    )
    keep: set[tuple[int, int]] = set(target_component[3])

    rgba = image.load()
    for y in range(height):
        for x in range(width):
            if pix[x, y] >= 18 and (x, y) not in keep:
                rgba[x, y] = (255, 255, 255, 0)
    return clean_alpha(image)


def clean_alpha(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A").filter(ImageFilter.MedianFilter(3))
    image = image.copy()
    image.putalpha(alpha)
    return image


def pad_box(box: tuple[int, int, int, int], size: tuple[int, int], pad: int) -> tuple[int, int, int, int]:
    return (max(0, box[0] - pad), max(0, box[1] - pad), min(size[0], box[2] + pad), min(size[1], box[3] + pad))


def hstack(images: list[Image.Image]) -> Image.Image:
    if not images:
        raise ValueError("no images")
    out = Image.new("RGBA", (sum(img.width for img in images), max(img.height for img in images)), (0, 0, 0, 0))
    x = 0
    for img in images:
        out.alpha_composite(img, (x, 0))
        x += img.width
    return out


def build_review(rows: list[tuple[Anim, list[Image.Image]]]) -> Image.Image:
    label_w = 70
    gap = 10
    row_h = 340
    width = label_w + max(sum(cell.width for cell in cells) + gap * (len(cells) - 1) for _, cells in rows)
    height = row_h * len(rows)
    review = Image.new("RGBA", (width, height), (26, 26, 31, 255))
    draw = ImageDraw.Draw(review)
    for row_idx, (anim, cells) in enumerate(rows):
        y = row_idx * row_h
        draw.text((4, y + 8), anim.name, fill=(235, 235, 235, 255))
        x = label_w
        for idx, cell in enumerate(cells):
            tile = checker(cell.width, cell.height)
            tile.alpha_composite(cell, (0, 0))
            review.alpha_composite(tile, (x, y))
            draw.rectangle((x, y, x + cell.width - 1, y + cell.height - 1), outline=(116, 116, 0, 255))
            draw.text((x + 4, y + 4), str(idx), fill=(245, 245, 70, 255))
            x += cell.width + gap
    return review


def checker(width: int, height: int) -> Image.Image:
    img = Image.new("RGBA", (width, height), (33, 33, 39, 255))
    draw = ImageDraw.Draw(img)
    size = 16
    for y in range(0, height, size):
        for x in range(0, width, size):
            fill = (47, 47, 56, 255) if (x // size + y // size) % 2 else (34, 34, 41, 255)
            draw.rectangle((x, y, x + size - 1, y + size - 1), fill=fill)
    return img


if __name__ == "__main__":
    main()
