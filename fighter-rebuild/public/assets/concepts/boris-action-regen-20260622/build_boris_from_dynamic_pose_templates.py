#!/usr/bin/env python3
"""Build Boris runtime strips from dynamic Tibo pose templates.

Imagegen repeatedly returned unrelated poster/map outputs for Boris in this
thread. This script keeps the corrected dynamic pose timing from Tibo and
restyles the pixels into Boris's brown/gold heavyweight design.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parents[3]
TIBO = PROJECT / "public" / "assets" / "characters" / "tibo"
OUT = ROOT
RUNTIME = OUT / "runtime"
CELLS = OUT / "cells"
MASKS = OUT / "masks"
RAW = OUT / "raw"

ANIMS = {
    "idle": (6, 320),
    "walk": (6, 320),
    "jump": (4, 320),
    "crouch": (4, 320),
    "block": (3, 320),
    "light": (4, 320),
    "heavy": (5, 320),
    "special": (6, 512),
    "knockdown": (5, 320),
}


def main() -> None:
    for folder in (RUNTIME, CELLS, MASKS, RAW):
        folder.mkdir(parents=True, exist_ok=True)

    report: dict[str, object] = {"method": "dynamic Tibo pose templates restyled into Boris", "animations": {}}
    review_rows: list[tuple[str, list[Image.Image], int]] = []
    for name, (count, frame_w) in ANIMS.items():
        source = Image.open(TIBO / f"{name}.png").convert("RGBA")
        cells: list[Image.Image] = []
        frame_report = []
        for idx in range(count):
            src = source.crop((idx * frame_w, 0, (idx + 1) * frame_w, 320))
            cell = restyle_boris(src, name, idx, frame_w)
            cells.append(cell)
            cell.save(CELLS / f"{name}-{idx:02d}.png")
            bbox = cell.getchannel("A").getbbox()
            frame_report.append({"frame": idx, "alphaBox": bbox})
        strip = hstack(cells)
        strip.save(RUNTIME / f"{name}.png")
        hstack([cell.getchannel("A").convert("RGBA") for cell in cells]).save(MASKS / f"{name}-alpha-mask.png")
        report["animations"][name] = {"frameWidth": frame_w, "frameHeight": 320, "frameCount": count, "frames": frame_report}
        review_rows.append((name, cells, frame_w))

    (OUT / "boris-action-regen-report.json").write_text(json.dumps(report, indent=2) + "\n")
    build_review(review_rows).save(OUT / "boris-action-regen-runtime-review.png")


def restyle_boris(cell: Image.Image, anim: str, frame: int, frame_w: int) -> Image.Image:
    cell = cell.convert("RGBA")
    bbox = cell.getchannel("A").getbbox()
    if bbox is None:
        return cell

    recolored = Image.new("RGBA", cell.size, (0, 0, 0, 0))
    src = cell.load()
    dst = recolored.load()
    top, bottom = bbox[1], bbox[3]
    height = max(1, bottom - top)

    for y in range(cell.height):
        rel_y = (y - top) / height
        for x in range(cell.width):
            r, g, b, a = src[x, y]
            if a == 0:
                continue
            lum = max(0.0, min(1.0, (0.299 * r + 0.587 * g + 0.114 * b) / 255))
            if is_bright_green(r, g, b):
                nr, ng, nb = shade((214, 159, 43), lum, boost=0.18)
            elif is_white_shirt(r, g, b):
                nr, ng, nb = shade((244, 236, 218), lum, boost=0.08)
            elif is_skin(r, g, b):
                nr, ng, nb = shade((224, 151, 86), lum, boost=0.12)
            elif rel_y < 0.56 and is_dark(r, g, b):
                nr, ng, nb = shade((132, 72, 34), lum, boost=0.16)
            elif rel_y > 0.78 and is_dark(r, g, b):
                nr, ng, nb = shade((150, 91, 36), lum, boost=0.1)
            elif rel_y >= 0.48 and is_dark(r, g, b):
                nr, ng, nb = shade((24, 31, 42), lum, boost=0.02)
            else:
                nr, ng, nb = r, g, b
            dst[x, y] = (nr, ng, nb, a)

    recolored = add_bald_boris_head(recolored, bbox)
    recolored = add_gold_accents(recolored, bbox, frame_w)
    recolored = recolored.filter(ImageFilter.UnsharpMask(radius=0.6, percent=115, threshold=2))
    return recolored


def add_bald_boris_head(image: Image.Image, bbox: tuple[int, int, int, int]) -> Image.Image:
    draw = ImageDraw.Draw(image)
    alpha = image.getchannel("A")
    top = bbox[1]
    xs: list[int] = []
    ys: list[int] = []
    pix = image.load()
    head_scan_bottom = min(image.height, top + 78)
    for y in range(top, head_scan_bottom):
        for x in range(max(0, bbox[0] - 10), min(image.width, bbox[2] + 10)):
            r, g, b, a = pix[x, y]
            if a > 20 and (is_skin(r, g, b) or is_dark(r, g, b)):
                xs.append(x)
                ys.append(y)
    if not xs:
        cx = (bbox[0] + bbox[2]) // 2
        cy = top + 34
    else:
        cx = round(sum(xs) / len(xs))
        cy = round(min(ys) + 34)

    head_w = 39
    head_h = 48
    head_box = (cx - head_w // 2, cy - head_h // 2, cx + head_w // 2, cy + head_h // 2)
    draw.ellipse(head_box, fill=(218, 145, 82, 255), outline=(42, 24, 19, 255), width=2)
    draw.arc((head_box[0] + 5, head_box[1] + 22, head_box[2] - 5, head_box[3] + 8), 15, 168, fill=(58, 35, 24, 255), width=4)
    draw.line((cx - 12, cy - 3, cx - 3, cy - 5), fill=(34, 24, 20, 255), width=2)
    draw.line((cx + 4, cy - 5, cx + 13, cy - 3), fill=(34, 24, 20, 255), width=2)
    draw.ellipse((cx - 8, cy + 2, cx - 5, cy + 5), fill=(25, 18, 15, 255))
    draw.ellipse((cx + 7, cy + 2, cx + 10, cy + 5), fill=(25, 18, 15, 255))
    # Restore original alpha outside the added head only where there was no body.
    new_alpha = Image.composite(Image.new("L", image.size, 255), alpha, image.getchannel("A"))
    image.putalpha(image.getchannel("A").filter(ImageFilter.MedianFilter(3)))
    return image


def add_gold_accents(image: Image.Image, bbox: tuple[int, int, int, int], frame_w: int) -> Image.Image:
    draw = ImageDraw.Draw(image)
    top = bbox[1]
    shoulder_y = top + 76
    left_shoulder_x = bbox[0] + max(32, (bbox[2] - bbox[0]) // 4)
    radius = 13
    draw.ellipse(
        (left_shoulder_x - radius, shoulder_y - radius, left_shoulder_x + radius, shoulder_y + radius),
        outline=(221, 164, 43, 230),
        width=3,
    )
    draw.ellipse(
        (left_shoulder_x - 5, shoulder_y - 5, left_shoulder_x + 5, shoulder_y + 5),
        outline=(221, 164, 43, 220),
        width=2,
    )
    return image


def is_bright_green(r: int, g: int, b: int) -> bool:
    return g > 115 and g > r + 24 and g > b + 18


def is_white_shirt(r: int, g: int, b: int) -> bool:
    return r > 170 and g > 160 and b > 145 and max(r, g, b) - min(r, g, b) < 75


def is_skin(r: int, g: int, b: int) -> bool:
    return r > 115 and g > 58 and b > 35 and r > g + 18 and g > b - 4


def is_dark(r: int, g: int, b: int) -> bool:
    return max(r, g, b) < 128


def shade(base: tuple[int, int, int], lum: float, boost: float = 0.0) -> tuple[int, int, int]:
    factor = 0.45 + lum * 0.9 + boost
    return tuple(max(0, min(255, round(channel * factor))) for channel in base)


def hstack(images: list[Image.Image]) -> Image.Image:
    out = Image.new("RGBA", (sum(img.width for img in images), max(img.height for img in images)), (0, 0, 0, 0))
    x = 0
    for img in images:
        out.alpha_composite(img, (x, 0))
        x += img.width
    return out


def build_review(rows: list[tuple[str, list[Image.Image], int]]) -> Image.Image:
    label_w = 70
    gap = 10
    row_h = 340
    width = label_w + max(sum(cell.width for cell in cells) + gap * (len(cells) - 1) for _, cells, _ in rows)
    height = row_h * len(rows)
    review = Image.new("RGBA", (width, height), (26, 26, 31, 255))
    draw = ImageDraw.Draw(review)
    for row_idx, (name, cells, _) in enumerate(rows):
        y = row_idx * row_h
        draw.text((4, y + 8), name, fill=(235, 235, 235, 255))
        x = label_w
        for idx, cell in enumerate(cells):
            tile = checker(cell.width, cell.height)
            tile.alpha_composite(cell)
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
