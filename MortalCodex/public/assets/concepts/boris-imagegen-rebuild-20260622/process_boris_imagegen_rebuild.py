#!/usr/bin/env python3
"""Slice the approved Imagegen Boris action sheet into runtime strips."""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from statistics import median

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parents[3]
GENERATED = Path(
    "/Users/am.will/.codex/generated_images/019ea028-f3e5-7b32-9964-11ed74195dc2/"
    "ig_093f3643bdfc56cd016a38cdf1caf08198b9bd4c9ba2608cbc.png"
)
HEAVY_GENERATED = Path(
    "/Users/am.will/.codex/generated_images/019ea028-f3e5-7b32-9964-11ed74195dc2/"
    "ig_07c5d9a58373b1f0016a38d0e93af8819bb4081f1661ec942f.png"
)
REFERENCE = Path("/var/folders/lg/_0v_dqld009ds_lxkxjlg0gm0000gn/T/codex-clipboard-a046fd00-3cf7-4f56-8dab-64344685e62b.png")

RAW = ROOT / "raw"
RUNTIME = ROOT / "runtime"
CELLS = ROOT / "cells"
MASKS = ROOT / "masks"
REVIEWS = ROOT / "reviews"

ROWS = {
    "idle": {"frame_width": 320, "y": (5, 173), "x": [96, 264, 425, 589, 766, 929, 1088]},
    "walk": {"frame_width": 320, "y": (173, 318), "x": [96, 264, 425, 589, 766, 929, 1088]},
    "jump": {"frame_width": 320, "y": (318, 446), "x": [96, 268, 455, 629, 799]},
    "crouch": {"frame_width": 320, "y": (446, 561), "x": [96, 267, 455, 629, 799]},
    "block": {"frame_width": 320, "y": (561, 680), "x": [96, 266, 449, 629]},
    "light": {"frame_width": 320, "y": (680, 813), "x": [96, 260, 435, 619, 757]},
    "heavy": {"frame_width": 320, "y": (135, 655), "x": [0, 413, 802, 1336, 1802, 2171], "source": "heavy"},
    "special": {"frame_width": 512, "y": (915, 1023), "x": [96, 307, 532, 752, 1176, 1405]},
    "knockdown": {"frame_width": 320, "y": (1023, 1115), "x": [96, 288, 473, 706, 947, 1130]},
}

FPS = {
    "idle": 12,
    "walk": 8,
    "jump": 8,
    "crouch": 8,
    "block": 8,
    "light": 12,
    "heavy": 10,
    "special": 12,
    "knockdown": 8,
}


def main() -> None:
    for folder in (RAW, RUNTIME, CELLS, MASKS, REVIEWS):
        folder.mkdir(parents=True, exist_ok=True)

    shutil.copy2(GENERATED, RAW / "boris-imagegen-action-sheet.png")
    shutil.copy2(HEAVY_GENERATED, RAW / "boris-imagegen-heavy-kick-row.png")
    if REFERENCE.exists():
        shutil.copy2(REFERENCE, RAW / "boris-style-reference.png")

    source = Image.open(GENERATED).convert("RGBA")
    heavy_source = Image.open(HEAVY_GENERATED).convert("RGBA")
    crops = {
        name: [
            remove_magenta(crop_cell(heavy_source if row.get("source") == "heavy" else source, row, idx))
            for idx in range(len(row["x"]) - 1)
        ]
        for name, row in ROWS.items()
    }
    standing_heights = [
        bbox_height(cell)
        for name in ("idle", "walk", "light", "block")
        for cell in crops[name]
        if bbox_height(cell) > 0
    ]
    global_scale = 248 / median(standing_heights)
    heavy_reference_heights = [bbox_height(crops["heavy"][idx]) for idx in (0, 1, 4) if bbox_height(crops["heavy"][idx]) > 0]
    heavy_scale = 248 / median(heavy_reference_heights)

    report: dict[str, object] = {
        "source": str(GENERATED),
        "method": "fresh Imagegen sheet sliced by detected grid, magenta removed, normalized with one global body scale",
        "globalScale": global_scale,
        "heavyScale": heavy_scale,
        "animations": {},
    }
    review_rows: list[tuple[str, list[Image.Image]]] = []
    for name, row in ROWS.items():
        frame_w = int(row["frame_width"])
        cells: list[Image.Image] = []
        frame_report = []
        for idx, crop in enumerate(crops[name]):
            cell = normalize_cell(crop, name, frame_w, global_scale, heavy_scale if name == "heavy" else None)
            cell = cell.filter(ImageFilter.UnsharpMask(radius=0.8, percent=120, threshold=2))
            cells.append(cell)
            cell.save(CELLS / f"{name}-{idx:02d}.png")
            bbox = cell.getchannel("A").getbbox()
            frame_report.append({"frame": idx, "alphaBox": bbox, "touchesEdge": touches_edge(bbox, frame_w)})
        strip = hstack(cells)
        strip.save(RUNTIME / f"{name}.png")
        hstack([mask_preview(cell) for cell in cells]).save(MASKS / f"{name}-alpha-mask.png")
        report["animations"][name] = {
            "frameWidth": frame_w,
            "frameHeight": 320,
            "frameCount": len(cells),
            "fps": FPS[name],
            "frames": frame_report,
        }
        review_rows.append((name, cells))

    review = build_review(review_rows)
    review.save(ROOT / "boris-imagegen-runtime-review.png")
    review.save(REVIEWS / "boris-imagegen-runtime-review.png")
    (ROOT / "boris-imagegen-report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


def crop_cell(source: Image.Image, row: dict[str, object], idx: int) -> Image.Image:
    y0, y1 = row["y"]  # type: ignore[misc]
    xs = row["x"]  # type: ignore[assignment]
    x0, x1 = int(xs[idx]), int(xs[idx + 1])  # type: ignore[index]
    return source.crop((x0 + 2, y0 + 2, x1 - 2, y1 - 2))


def remove_magenta(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            if is_magenta_background(r, g, b):
                pixels[x, y] = (0, 0, 0, 0)
            elif is_magenta_spill(r, g, b) and not is_bright_effect(r, g, b):
                pixels[x, y] = (42, 28, 36, min(210, a))
    return image


def normalize_cell(crop: Image.Image, name: str, frame_w: int, global_scale: float, row_scale: float | None = None) -> Image.Image:
    bbox = crop.getchannel("A").getbbox()
    out = Image.new("RGBA", (frame_w, 320), (0, 0, 0, 0))
    if bbox is None:
        return out

    target = crop.crop(bbox)
    max_w = frame_w - 28
    max_h = 304
    scale = min(row_scale or global_scale, max_w / target.width, max_h / target.height)
    resized = target.resize((max(1, round(target.width * scale)), max(1, round(target.height * scale))), Image.Resampling.LANCZOS)

    body_box = non_energy_bbox(resized) if name == "special" else resized.getchannel("A").getbbox()
    if name == "special" and body_box is not None:
        body_cx = (body_box[0] + body_box[2]) / 2
        dest_x = round(176 - body_cx)
        dest_x = max(12, min(frame_w - resized.width - 12, dest_x))
    else:
        dest_x = round((frame_w - resized.width) / 2)

    if name == "jump":
        dest_y = round((320 - resized.height) / 2) + 8
    elif name == "knockdown":
        dest_y = 292 - resized.height
    else:
        dest_y = 292 - resized.height

    dest_x = max(8, min(frame_w - resized.width - 8, dest_x))
    dest_y = max(8, min(312 - resized.height, dest_y))
    out.alpha_composite(resized, (dest_x, dest_y))
    return out


def non_energy_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    alpha = image.getchannel("A")
    pixels = image.load()
    xs: list[int] = []
    ys: list[int] = []
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            if a > 24 and not is_energy(r, g, b):
                xs.append(x)
                ys.append(y)
    if not xs:
        return alpha.getbbox()
    return (min(xs), min(ys), max(xs) + 1, max(ys) + 1)


def is_magenta_background(r: int, g: int, b: int) -> bool:
    return r > 175 and b > 175 and g < 90 and abs(r - b) < 85


def is_magenta_spill(r: int, g: int, b: int) -> bool:
    return r > 105 and b > 95 and g < 115 and abs(r - b) < 120


def is_bright_effect(r: int, g: int, b: int) -> bool:
    return r > 220 and (g > 90 or b > 175)


def is_energy(r: int, g: int, b: int) -> bool:
    return r > 210 and g > 105 and b < 120


def bbox_height(image: Image.Image) -> int:
    bbox = image.getchannel("A").getbbox()
    return 0 if bbox is None else bbox[3] - bbox[1]


def touches_edge(bbox: tuple[int, int, int, int] | None, frame_w: int) -> bool:
    if bbox is None:
        return False
    return bbox[0] <= 1 or bbox[1] <= 1 or bbox[2] >= frame_w - 1 or bbox[3] >= 319


def hstack(images: list[Image.Image]) -> Image.Image:
    out = Image.new("RGBA", (sum(img.width for img in images), 320), (0, 0, 0, 0))
    x = 0
    for img in images:
        out.alpha_composite(img, (x, 0))
        x += img.width
    return out


def mask_preview(image: Image.Image) -> Image.Image:
    mask = image.getchannel("A")
    return Image.merge("RGBA", (mask, mask, mask, Image.new("L", image.size, 255)))


def build_review(rows: list[tuple[str, list[Image.Image]]]) -> Image.Image:
    label_w = 98
    gap = 8
    row_h = 334
    width = label_w + max(sum(cell.width for cell in cells) + gap * (len(cells) - 1) for _, cells in rows)
    height = row_h * len(rows)
    review = Image.new("RGBA", (width, height), (25, 25, 31, 255))
    draw = ImageDraw.Draw(review)
    for row_idx, (name, cells) in enumerate(rows):
        y = row_idx * row_h
        draw.text((8, y + 10), name, fill=(235, 235, 235, 255))
        x = label_w
        for idx, cell in enumerate(cells):
            tile = checker(cell.width, cell.height)
            tile.alpha_composite(cell)
            review.alpha_composite(tile, (x, y))
            draw.rectangle((x, y, x + cell.width - 1, y + cell.height - 1), outline=(122, 122, 0, 255))
            draw.text((x + 5, y + 5), str(idx), fill=(245, 245, 70, 255))
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
