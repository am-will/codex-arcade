#!/usr/bin/env python3
"""Slice high-detail generated fighter sheets into Phaser-ready strips.

The source sheets are AI-generated raster targets saved under
concepts/high-detail-sprite-sheets/. Each sheet is a 5x2 grid:
idle, walk1, walk2, jump, block, light punch, heavy kick,
special charge, special combo finisher, knockdown.
"""

from __future__ import annotations

import json
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "public" / "assets"
SOURCE_ROOT = ROOT / "concepts" / "high-detail-sprite-sheets"
FRAME_SIZE = 320


@dataclass(frozen=True)
class FighterSource:
    fighter_id: str
    display_name: str
    source_name: str
    portrait_key: str
    visual_cue: str


FIGHTERS = [
    FighterSource(
        fighter_id="sama",
        display_name="Sama",
        source_name="sama-high-detail-sheet.png",
        portrait_key="sama-portrait",
        visual_cue="dark hair, navy bomber jacket, white shirt, orange tech-energy accents",
    ),
    FighterSource(
        fighter_id="amodi",
        display_name="Amodi",
        source_name="amodi-high-detail-sheet.png",
        portrait_key="amodi-portrait",
        visual_cue="glasses, short beard, purple research coat, teal/violet energy accents",
    ),
]

POSE_INDEX = {
    "idle": 0,
    "walk1": 1,
    "walk2": 2,
    "jump": 3,
    "block": 4,
    "light": 5,
    "heavy": 6,
    "special_charge": 7,
    "special_finisher": 8,
    "knockdown": 9,
}

ANIMATIONS = [
    {"name": "idle", "frames": ["idle", "idle", "idle", "idle"], "fps": 5, "loop": True},
    {"name": "walk", "frames": ["walk1", "walk2", "walk1", "idle", "walk2", "idle"], "fps": 8, "loop": True},
    {"name": "jump", "frames": ["idle", "jump", "jump", "idle"], "fps": 8, "loop": False},
    {"name": "crouch", "frames": ["crouch", "crouch", "crouch", "crouch"], "fps": 8, "loop": False},
    {"name": "block", "frames": ["idle", "block", "block"], "fps": 8, "loop": False},
    {"name": "light", "frames": ["idle", "light", "light", "idle"], "fps": 12, "loop": False},
    {"name": "heavy", "frames": ["idle", "heavy", "heavy", "heavy", "idle"], "fps": 10, "loop": False},
    {
        "name": "special",
        "frames": ["special_charge", "special_charge", "light", "heavy", "special_finisher", "special_finisher"],
        "fps": 12,
        "loop": False,
    },
    {"name": "knockdown", "frames": ["idle", "knockdown", "knockdown", "knockdown", "knockdown"], "fps": 8, "loop": False},
]


def main() -> None:
    manifest_path = ASSET_ROOT / "manifest.json"
    manifest = json.loads(manifest_path.read_text())

    updated_characters = []
    for fighter in FIGHTERS:
        sheet = Image.open(SOURCE_ROOT / fighter.source_name).convert("RGBA")
        cells = extract_cells(sheet)
        fighter_dir = ASSET_ROOT / "characters" / fighter.fighter_id
        fighter_dir.mkdir(parents=True, exist_ok=True)

        portrait = build_portrait(cells[POSE_INDEX["idle"]])
        portrait_path = fighter_dir / "portrait.png"
        portrait.save(portrait_path)

        animations = []
        for animation in ANIMATIONS:
            strip = build_strip(cells, animation["frames"])
            path = fighter_dir / f"{animation['name']}.png"
            strip.save(path)
            animations.append(
                {
                    "name": animation["name"],
                    "key": f"{fighter.fighter_id}-{animation['name']}",
                    "path": f"/assets/characters/{fighter.fighter_id}/{animation['name']}.png",
                    "frameWidth": FRAME_SIZE,
                    "frameHeight": FRAME_SIZE,
                    "frameCount": len(animation["frames"]),
                    "columns": len(animation["frames"]),
                    "rows": 1,
                    "fps": animation["fps"],
                    "loop": animation["loop"],
                }
            )

        updated_characters.append(
            {
                "id": fighter.fighter_id,
                "displayName": fighter.display_name,
                "description": f"{fighter.display_name} original high-detail fighting sprite caricature",
                "visualCue": fighter.visual_cue,
                "portrait": {
                    "key": fighter.portrait_key,
                    "path": f"/assets/characters/{fighter.fighter_id}/portrait.png",
                    "width": 192,
                    "height": 192,
                },
                "animations": animations,
            }
        )

    manifest["style"] = (
        "Original high-detail 16-bit arcade fighting sprites generated with GPT Image 2, "
        "then sliced into Phaser animation strips; no copied source images or legacy game assets."
    )
    manifest["characters"] = updated_characters
    manifest["generatedAt"] = "2026-06-06T07:35:00.000Z"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    write_contact_sheet(updated_characters)
    validate_manifest(manifest)
    print("High-detail sprite slicing complete.")


def extract_cells(sheet: Image.Image) -> list[Image.Image]:
    width, height = sheet.size
    cells = []
    row_bounds = [(0, round(height * 0.49)), (round(height * 0.54), height)]
    for row in range(2):
        for col in range(5):
            left = round(col * width / 5)
            right = round((col + 1) * width / 5)
            top, bottom = row_bounds[row]
            cell = sheet.crop((left, top, right, bottom))
            transparent = remove_background(cell)
            cells.append(tighten_to_frame(transparent))
    return cells


def remove_background(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    pixels = image.load()
    width, height = image.size
    seen = set()
    queue: deque[tuple[int, int]] = deque()

    for x in range(width):
        queue.append((x, 0))
        queue.append((x, height - 1))
    for y in range(height):
        queue.append((0, y))
        queue.append((width - 1, y))

    while queue:
        x, y = queue.popleft()
        if (x, y) in seen or not (0 <= x < width and 0 <= y < height):
            continue
        seen.add((x, y))
        r, g, b, a = pixels[x, y]
        if a == 0 or is_checker_background(r, g, b):
            pixels[x, y] = (255, 255, 255, 0)
            queue.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

    return remove_checker_holes(remove_small_components(image))


def is_checker_background(r: int, g: int, b: int) -> bool:
    return r >= 228 and g >= 228 and b >= 228 and max(r, g, b) - min(r, g, b) <= 18


def remove_small_components(image: Image.Image, min_area: int = 650) -> Image.Image:
    pixels = image.load()
    width, height = image.size
    seen: set[tuple[int, int]] = set()

    for y in range(height):
        for x in range(width):
            if (x, y) in seen or pixels[x, y][3] == 0:
                continue

            component = []
            queue: deque[tuple[int, int]] = deque([(x, y)])
            while queue:
                cx, cy = queue.popleft()
                if (cx, cy) in seen or not (0 <= cx < width and 0 <= cy < height):
                    continue
                seen.add((cx, cy))
                if pixels[cx, cy][3] == 0:
                    continue
                component.append((cx, cy))
                queue.extend(((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)))

            if len(component) < min_area:
                for px, py in component:
                    pixels[px, py] = (255, 255, 255, 0)

    return image


def remove_checker_holes(image: Image.Image) -> Image.Image:
    pixels = image.load()
    width, height = image.size
    seen: set[tuple[int, int]] = set()

    for y in range(height):
        for x in range(width):
            if (x, y) in seen:
                continue

            r, g, b, a = pixels[x, y]
            if a == 0 or not is_checker_background(r, g, b):
                continue

            component = []
            queue: deque[tuple[int, int]] = deque([(x, y)])
            while queue:
                cx, cy = queue.popleft()
                if (cx, cy) in seen or not (0 <= cx < width and 0 <= cy < height):
                    continue
                seen.add((cx, cy))
                cr, cg, cb, ca = pixels[cx, cy]
                if ca == 0 or not is_checker_background(cr, cg, cb):
                    continue
                component.append((cx, cy))
                queue.extend(((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)))

            if not component:
                continue

            left = min(px for px, _ in component)
            right = max(px for px, _ in component) + 1
            top = min(py for _, py in component)
            bottom = max(py for _, py in component) + 1
            if top > height * 0.42 and right - left > 24 and bottom - top > 24:
                for px, py in component:
                    pixels[px, py] = (255, 255, 255, 0)

    return image


def tighten_to_frame(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        return Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (255, 255, 255, 0))
    cropped = image.crop(expand_bbox(bbox, image.size, 16))
    cropped.thumbnail((FRAME_SIZE - 18, FRAME_SIZE - 18), Image.Resampling.LANCZOS)

    frame = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (255, 255, 255, 0))
    x = (FRAME_SIZE - cropped.width) // 2
    y = FRAME_SIZE - cropped.height - 10
    frame.alpha_composite(cropped, (x, max(0, y)))
    return remove_small_components(frame, min_area=700)


def expand_bbox(bbox: tuple[int, int, int, int], size: tuple[int, int], pad: int) -> tuple[int, int, int, int]:
    left, top, right, bottom = bbox
    width, height = size
    return (max(0, left - pad), max(0, top - pad), min(width, right + pad), min(height, bottom + pad))


def build_strip(cells: list[Image.Image], pose_names: Iterable[str]) -> Image.Image:
    poses = [build_crouch_pose(cells[POSE_INDEX["idle"]]) if name == "crouch" else cells[POSE_INDEX[name]] for name in pose_names]
    strip = Image.new("RGBA", (FRAME_SIZE * len(poses), FRAME_SIZE), (255, 255, 255, 0))
    for index, pose in enumerate(poses):
        strip.alpha_composite(pose, (index * FRAME_SIZE, 0))
    return strip


def build_crouch_pose(idle: Image.Image) -> Image.Image:
    alpha = idle.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        return Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (255, 255, 255, 0))

    figure = idle.crop(expand_bbox(bbox, idle.size, 4))
    target_width = min(FRAME_SIZE - 12, round(figure.width * 1.08))
    target_height = min(FRAME_SIZE - 18, round(figure.height * 0.74))
    crouch = figure.resize((target_width, target_height), Image.Resampling.LANCZOS)
    frame = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (255, 255, 255, 0))
    x = (FRAME_SIZE - target_width) // 2
    y = FRAME_SIZE - target_height - 10
    frame.alpha_composite(crouch, (x, y))
    return frame


def build_portrait(idle: Image.Image) -> Image.Image:
    crop = idle.crop((64, 12, 256, 204))
    portrait = Image.new("RGBA", (192, 192), (255, 255, 255, 0))
    portrait.alpha_composite(crop, (0, 0))
    return portrait


def write_contact_sheet(characters: list[dict]) -> None:
    width = 1280
    height = 720
    sheet = Image.new("RGBA", (width, height), (13, 17, 26, 255))
    x = 30
    for character in characters:
        portrait = Image.open(ROOT / "public" / character["portrait"]["path"].lstrip("/")).convert("RGBA")
        sheet.alpha_composite(portrait, (x, 34))
        for index, animation in enumerate(character["animations"]):
            strip = Image.open(ROOT / "public" / animation["path"].lstrip("/")).convert("RGBA")
            frame = strip.crop((0, 0, FRAME_SIZE, FRAME_SIZE)).resize((112, 112), Image.Resampling.LANCZOS)
            px = x + (index % 2) * 140
            py = 260 + (index // 2) * 118
            sheet.alpha_composite(frame, (px, py))
        x += 420
    stage = Image.open(ASSET_ROOT / "stages" / "byte-boardroom" / "floor.png").convert("RGBA")
    stage.thumbnail((400, 225), Image.Resampling.LANCZOS)
    sheet.alpha_composite(stage, (850, 55))
    (ASSET_ROOT / "concepts").mkdir(parents=True, exist_ok=True)
    sheet.save(ASSET_ROOT / "concepts" / "contact-sheet.png")


def validate_manifest(manifest: dict) -> None:
    for character in manifest["characters"]:
        portrait = ROOT / "public" / character["portrait"]["path"].lstrip("/")
        assert portrait.exists(), portrait
        for animation in character["animations"]:
            path = ROOT / "public" / animation["path"].lstrip("/")
            image = Image.open(path)
            expected = (animation["frameWidth"] * animation["frameCount"], animation["frameHeight"])
            assert image.size == expected, (path, image.size, expected)


if __name__ == "__main__":
    main()
