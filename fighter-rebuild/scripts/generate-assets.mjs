#!/usr/bin/env node

import { deflateSync } from "node:zlib";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(scriptDir);
const publicDir = join(projectRoot, "public");
const assetRoot = join(publicDir, "assets");
const conceptsDir = join(projectRoot, "concepts");

const FRAME = { width: 64, height: 64 };
const PORTRAIT = { width: 96, height: 96 };
const STAGE = { width: 640, height: 360 };

const animations = [
  { name: "idle", frames: 4, fps: 5, loop: true },
  { name: "walk", frames: 6, fps: 10, loop: true },
  { name: "jump", frames: 4, fps: 8, loop: false },
  { name: "block", frames: 3, fps: 8, loop: false },
  { name: "light", frames: 4, fps: 12, loop: false },
  { name: "heavy", frames: 5, fps: 10, loop: false },
  { name: "special", frames: 6, fps: 12, loop: false },
  { name: "knockdown", frames: 5, fps: 8, loop: false },
];

const characters = [
  {
    id: "sama",
    displayName: "Sama",
    fullName: "Sam Altman inspired original 8-bit caricature",
    cue: "compact founder silhouette, dark hair, navy jacket, bright white shirt, ember accent",
    palette: {
      hair: "#181923",
      skin: "#f0c7a6",
      skinShadow: "#c98c67",
      jacket: "#19253f",
      jacketDark: "#0d1426",
      shirt: "#f3f5f4",
      accent: "#ffb24d",
      pants: "#252b35",
      shoes: "#101018",
      outline: "#08080c",
      special: "#46d7ff",
      special2: "#ffb24d",
    },
  },
  {
    id: "amodi",
    displayName: "Amodi",
    fullName: "Dario Amodei inspired original 8-bit caricature",
    cue: "glasses, beard pixels, tall stance, purple jacket, teal research-note accents",
    palette: {
      hair: "#3a2823",
      skin: "#e3b08d",
      skinShadow: "#a76b52",
      jacket: "#5b3f83",
      jacketDark: "#32204e",
      shirt: "#d7fbf2",
      accent: "#41d6b4",
      pants: "#202836",
      shoes: "#111018",
      outline: "#07070b",
      special: "#9a6cff",
      special2: "#41d6b4",
    },
  },
];

class Bitmap {
  constructor(width, height, fill = "#00000000") {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4);
    this.clear(fill);
  }

  clear(color) {
    const rgba = parseColor(color);
    for (let i = 0; i < this.data.length; i += 4) {
      this.data[i] = rgba[0];
      this.data[i + 1] = rgba[1];
      this.data[i + 2] = rgba[2];
      this.data[i + 3] = rgba[3];
    }
  }

  pixel(x, y, color) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const [r, g, b, a] = parseColor(color);
    const idx = (y * this.width + x) * 4;
    if (a === 255) {
      this.data[idx] = r;
      this.data[idx + 1] = g;
      this.data[idx + 2] = b;
      this.data[idx + 3] = a;
      return;
    }
    const srcA = a / 255;
    const dstA = this.data[idx + 3] / 255;
    const outA = srcA + dstA * (1 - srcA);
    if (outA === 0) return;
    this.data[idx] = Math.round((r * srcA + this.data[idx] * dstA * (1 - srcA)) / outA);
    this.data[idx + 1] = Math.round((g * srcA + this.data[idx + 1] * dstA * (1 - srcA)) / outA);
    this.data[idx + 2] = Math.round((b * srcA + this.data[idx + 2] * dstA * (1 - srcA)) / outA);
    this.data[idx + 3] = Math.round(outA * 255);
  }

  rect(x, y, w, h, color) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.ceil(x + w);
    const y1 = Math.ceil(y + h);
    for (let yy = y0; yy < y1; yy += 1) {
      for (let xx = x0; xx < x1; xx += 1) this.pixel(xx, yy, color);
    }
  }

  steppedOval(cx, cy, rx, ry, color) {
    for (let y = -ry; y <= ry; y += 1) {
      const span = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
      this.rect(cx - span, cy + y, span * 2 + 1, 1, color);
    }
  }

  line(x0, y0, x1, y1, color, thickness = 1) {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let x = Math.round(x0);
    let y = Math.round(y0);
    while (true) {
      this.rect(x - Math.floor(thickness / 2), y - Math.floor(thickness / 2), thickness, thickness, color);
      if (x === Math.round(x1) && y === Math.round(y1)) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
  }

  blit(src, dx, dy) {
    for (let y = 0; y < src.height; y += 1) {
      for (let x = 0; x < src.width; x += 1) {
        const idx = (y * src.width + x) * 4;
        const a = src.data[idx + 3];
        if (!a) continue;
        this.pixel(dx + x, dy + y, `#${hex(src.data[idx])}${hex(src.data[idx + 1])}${hex(src.data[idx + 2])}${hex(a)}`);
      }
    }
  }
}

function parseColor(color) {
  if (Array.isArray(color)) return color;
  if (!color.startsWith("#")) throw new Error(`Unsupported color ${color}`);
  const clean = color.slice(1);
  if (clean.length === 6) {
    return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16), 255];
  }
  if (clean.length === 8) {
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
      parseInt(clean.slice(6, 8), 16),
    ];
  }
  throw new Error(`Unsupported color ${color}`);
}

function hex(value) {
  return value.toString(16).padStart(2, "0");
}

function mix(c1, c2, t) {
  const a = parseColor(c1);
  const b = parseColor(c2);
  return `#${hex(Math.round(a[0] + (b[0] - a[0]) * t))}${hex(Math.round(a[1] + (b[1] - a[1]) * t))}${hex(Math.round(a[2] + (b[2] - a[2]) * t))}${hex(Math.round(a[3] + (b[3] - a[3]) * t))}`;
}

function drawPixelText(bmp, text, x, y, color, scale = 1) {
  const glyphs = {
    A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
    D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
    G: ["01111", "10000", "10000", "10011", "10001", "10001", "01110"],
    H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    I: ["111", "010", "010", "010", "010", "010", "111"],
    J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
    K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
    L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
    N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
    O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
    R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
    V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
    W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
    X: ["10001", "01010", "00100", "00100", "00100", "01010", "10001"],
    Y: ["10001", "01010", "00100", "00100", "00100", "00100", "00100"],
    Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
    "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
    "1": ["010", "110", "010", "010", "010", "010", "111"],
    "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
    "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    " ": ["0", "0", "0", "0", "0", "0", "0"],
    ":": ["0", "1", "0", "0", "1", "0", "0"],
  };
  let cursor = x;
  for (const raw of text.toUpperCase()) {
    const glyph = glyphs[raw] ?? glyphs[" "];
    const width = glyph[0].length;
    glyph.forEach((row, yy) => {
      for (let xx = 0; xx < row.length; xx += 1) {
        if (row[xx] === "1") bmp.rect(cursor + xx * scale, y + yy * scale, scale, scale, color);
      }
    });
    cursor += (width + 1) * scale;
  }
}

function poseFor(animationName, frame, totalFrames, characterId) {
  const t = totalFrames <= 1 ? 0 : frame / (totalFrames - 1);
  const wave = Math.sin(frame * Math.PI * 2 / Math.max(1, totalFrames));
  const pose = {
    bob: animationName === "idle" ? Math.round(Math.sin(frame * Math.PI / 2) * 1) : 0,
    lean: 0,
    armFront: { x: 12, y: 3 },
    armBack: { x: -12, y: 5 },
    legFront: { x: 5, y: 0 },
    legBack: { x: -5, y: 0 },
    guard: false,
    blast: false,
    prone: false,
    jump: 0,
    face: 1,
  };

  if (animationName === "walk") {
    pose.bob = Math.abs(Math.round(wave));
    pose.armFront = { x: 9 - wave * 3, y: 4 };
    pose.armBack = { x: -10 + wave * 3, y: 5 };
    pose.legFront = { x: 6 + wave * 5, y: 0 };
    pose.legBack = { x: -6 - wave * 5, y: 0 };
  }
  if (animationName === "jump") {
    pose.jump = [0, -11, -15, -6][frame] ?? 0;
    pose.armFront = { x: 10, y: -3 };
    pose.armBack = { x: -9, y: -1 };
    pose.legFront = { x: 7, y: -4 };
    pose.legBack = { x: -7, y: -5 };
  }
  if (animationName === "block") {
    pose.guard = true;
    pose.lean = -2;
    pose.armFront = { x: 8, y: -4 };
    pose.armBack = { x: 5, y: 1 };
  }
  if (animationName === "light") {
    const reach = [10, 18, 24, 13][frame] ?? 10;
    pose.armFront = { x: reach, y: -1 };
    pose.armBack = { x: -8, y: 7 };
    pose.lean = frame === 2 ? 3 : 1;
  }
  if (animationName === "heavy") {
    const reach = [5, 10, 27, 22, 8][frame] ?? 5;
    pose.armFront = { x: reach, y: frame === 2 ? 4 : -5 };
    pose.armBack = { x: -12, y: -6 };
    pose.lean = frame >= 2 ? 4 : -1;
    pose.legFront = { x: 8, y: 0 };
    pose.legBack = { x: -9, y: 1 };
  }
  if (animationName === "special") {
    pose.blast = frame >= 2;
    pose.armFront = { x: 16 + frame * 2, y: -4 };
    pose.armBack = { x: -10, y: -3 };
    pose.lean = 2;
  }
  if (animationName === "knockdown") {
    pose.prone = frame >= 2;
    pose.lean = -4 - frame;
    pose.jump = frame === 1 ? -5 : 0;
    pose.armFront = { x: 7, y: 8 };
    pose.armBack = { x: -9, y: 10 };
    pose.legFront = { x: 8, y: 2 };
    pose.legBack = { x: -9, y: 3 };
  }

  if (characterId === "amodi") {
    pose.armFront.x += 1;
    pose.armBack.x -= 1;
  }
  pose.phase = t;
  return pose;
}

function drawFighterFrame(bmp, character, animationName, frame, totalFrames) {
  const p = character.palette;
  const pose = poseFor(animationName, frame, totalFrames, character.id);
  const cx = 31 + pose.lean;
  const ground = 58 + pose.jump;
  const bodyTop = ground - 36 + pose.bob;
  const headTop = bodyTop - 15;
  const tall = character.id === "amodi" ? 2 : 0;

  bmp.steppedOval(32, 60, 14, 3, "#00000044");

  if (pose.prone) {
    bmp.rect(18, 46, 34, 8, p.outline);
    bmp.rect(20, 44, 23, 8, p.jacket);
    bmp.rect(39, 43, 12, 10, p.skin);
    bmp.rect(50, 46, 8, 4, p.hair);
    bmp.rect(14, 50, 18, 5, p.pants);
    bmp.rect(9, 51, 8, 4, p.shoes);
    bmp.rect(34, 52, 20, 5, p.pants);
    bmp.rect(52, 53, 7, 4, p.shoes);
    if (character.id === "amodi") {
      bmp.rect(43, 47, 8, 2, p.outline);
      bmp.rect(42, 51, 11, 3, "#51342c");
    }
    return;
  }

  drawLimb(bmp, cx - 5, bodyTop + 20, cx + pose.legBack.x, ground - 3 + pose.legBack.y, p.pants, p.outline, 4);
  drawLimb(bmp, cx + 5, bodyTop + 20, cx + pose.legFront.x, ground - 3 + pose.legFront.y, p.pants, p.outline, 4);
  bmp.rect(cx + pose.legBack.x - 5, ground - 3 + pose.legBack.y, 9, 4, p.shoes);
  bmp.rect(cx + pose.legFront.x - 1, ground - 3 + pose.legFront.y, 10, 4, p.shoes);

  bmp.rect(cx - 11, bodyTop - tall, 22, 24 + tall, p.outline);
  bmp.rect(cx - 9, bodyTop + 1 - tall, 18, 22 + tall, p.jacket);
  bmp.rect(cx - 4, bodyTop + 1, 8, 19, p.shirt);
  bmp.rect(cx + 5, bodyTop + 5, 3, 8, p.jacketDark);
  bmp.rect(cx - 8, bodyTop + 3, 3, 13, p.jacketDark);
  bmp.rect(cx + 5, bodyTop + 3, 3, 3, p.accent);

  drawLimb(bmp, cx - 9, bodyTop + 6, cx + pose.armBack.x, bodyTop + 13 + pose.armBack.y, p.jacketDark, p.outline, 4);
  drawHand(bmp, cx + pose.armBack.x, bodyTop + 13 + pose.armBack.y, p.skin, p.outline);
  drawLimb(bmp, cx + 9, bodyTop + 6, cx + pose.armFront.x, bodyTop + 13 + pose.armFront.y, p.jacket, p.outline, 4);
  drawHand(bmp, cx + pose.armFront.x, bodyTop + 13 + pose.armFront.y, p.skin, p.outline);

  if (pose.guard) {
    bmp.rect(cx + 8, bodyTop - 8, 8, 19, "#dbe8ff");
    bmp.rect(cx + 10, bodyTop - 6, 4, 15, character.id === "sama" ? "#46d7ff" : "#9a6cff");
  }

  bmp.rect(cx - 8, headTop + 2, 16, 15, p.outline);
  bmp.rect(cx - 7, headTop + 3, 14, 13, p.skin);
  bmp.rect(cx - 6, headTop + 13, 12, 3, p.skinShadow);
  bmp.rect(cx - 8, headTop, 16, 5, p.hair);
  bmp.rect(cx - 7, headTop + 3, character.id === "sama" ? 5 : 4, 3, p.hair);
  if (character.id === "sama") {
    bmp.rect(cx - 3, headTop + 8, 2, 2, p.outline);
    bmp.rect(cx + 4, headTop + 8, 2, 2, p.outline);
    bmp.rect(cx, headTop + 12, 4, 1, p.skinShadow);
  } else {
    bmp.rect(cx - 7, headTop + 8, 5, 2, p.outline);
    bmp.rect(cx + 2, headTop + 8, 5, 2, p.outline);
    bmp.rect(cx - 2, headTop + 9, 4, 1, p.outline);
    bmp.rect(cx - 5, headTop + 13, 10, 4, "#51342c");
    bmp.pixel(cx - 4, headTop + 9, "#d7fbf2");
    bmp.pixel(cx + 4, headTop + 9, "#d7fbf2");
  }

  if (pose.blast) {
    const blastX = cx + 24 + frame * 2;
    const colorA = p.special;
    const colorB = p.special2;
    bmp.rect(blastX, bodyTop + 2, 9 + frame, 4, colorA);
    bmp.rect(blastX + 4, bodyTop - 2, 5 + frame, 3, colorB);
    bmp.rect(blastX + 2, bodyTop + 8, 7 + frame, 3, colorB);
    bmp.pixel(blastX + 13 + frame, bodyTop + 3, colorA);
    bmp.pixel(blastX + 15 + frame, bodyTop + 8, colorB);
  }
}

function drawLimb(bmp, x0, y0, x1, y1, fill, outline, thickness) {
  bmp.line(x0, y0, x1, y1, outline, thickness + 2);
  bmp.line(x0, y0, x1, y1, fill, thickness);
}

function drawHand(bmp, x, y, fill, outline) {
  bmp.rect(x - 2, y - 2, 5, 5, outline);
  bmp.rect(x - 1, y - 1, 3, 3, fill);
}

function drawPortrait(character) {
  const p = character.palette;
  const bmp = new Bitmap(PORTRAIT.width, PORTRAIT.height);
  for (let y = 0; y < bmp.height; y += 4) {
    const c = mix(character.id === "sama" ? "#203049" : "#342657", "#10151f", y / bmp.height);
    bmp.rect(0, y, bmp.width, 4, c);
  }
  for (let x = 8; x < 96; x += 16) bmp.rect(x, 0, 2, 96, "#ffffff0d");
  bmp.rect(6, 6, 84, 84, "#0a0b10");
  bmp.rect(8, 8, 80, 80, character.id === "sama" ? "#1c2a42" : "#2d2450");
  bmp.rect(12, 68, 72, 18, p.jacketDark);
  bmp.rect(21, 55, 54, 34, p.jacket);
  bmp.rect(39, 57, 19, 31, p.shirt);
  bmp.rect(55, 61, 5, 7, p.accent);
  bmp.rect(26, 20, 44, 43, p.outline);
  bmp.rect(29, 23, 38, 37, p.skin);
  bmp.rect(32, 56, 32, 7, p.skinShadow);
  bmp.rect(25, 16, 46, 15, p.hair);
  bmp.rect(28, 27, character.id === "sama" ? 14 : 10, 10, p.hair);
  bmp.rect(58, 26, 10, 9, p.hair);

  if (character.id === "sama") {
    bmp.rect(37, 43, 4, 4, p.outline);
    bmp.rect(58, 43, 4, 4, p.outline);
    bmp.rect(45, 51, 15, 2, p.skinShadow);
    bmp.rect(49, 31, 7, 3, "#ffffff22");
  } else {
    bmp.rect(33, 42, 14, 5, p.outline);
    bmp.rect(55, 42, 14, 5, p.outline);
    bmp.rect(47, 44, 8, 2, p.outline);
    bmp.rect(37, 43, 7, 3, "#d7fbf2");
    bmp.rect(59, 43, 7, 3, "#d7fbf2");
    bmp.rect(36, 55, 31, 12, "#51342c");
    bmp.rect(42, 53, 18, 3, p.skinShadow);
  }

  drawPixelText(bmp, character.id === "sama" ? "SAMA" : "AMODI", 20, 76, p.accent, 2);
  return bmp;
}

function drawSheet(character, animation) {
  const sheet = new Bitmap(FRAME.width * animation.frames, FRAME.height);
  for (let i = 0; i < animation.frames; i += 1) {
    const frameBmp = new Bitmap(FRAME.width, FRAME.height);
    drawFighterFrame(frameBmp, character, animation.name, i, animation.frames);
    sheet.blit(frameBmp, i * FRAME.width, 0);
  }
  return sheet;
}

function drawStageLayerSky() {
  const bmp = new Bitmap(STAGE.width, STAGE.height, "#0b1021");
  for (let y = 0; y < STAGE.height; y += 6) {
    const c = mix("#111b3b", "#271735", y / STAGE.height);
    bmp.rect(0, y, STAGE.width, 6, c);
  }
  bmp.rect(0, 0, STAGE.width, 70, "#091326cc");
  bmp.rect(502, 29, 32, 32, "#fff3b0");
  bmp.rect(494, 24, 17, 17, "#111b3b");
  for (let x = 25; x < 620; x += 41) {
    const h = 70 + ((x * 13) % 90);
    bmp.rect(x, 190 - h, 29, h, "#101525");
    for (let y = 196 - h; y < 177; y += 13) {
      const lit = (x + y) % 3 === 0 ? "#52d9ff" : "#24304b";
      bmp.rect(x + 5, y, 4, 5, lit);
      bmp.rect(x + 16, y + 2, 4, 5, lit);
    }
  }
  drawPixelText(bmp, "SAMA V AMODI", 198, 26, "#f2f5ff", 4);
  return bmp;
}

function drawStageLayerMid() {
  const bmp = new Bitmap(STAGE.width, STAGE.height);
  bmp.rect(0, 174, STAGE.width, 42, "#141926dd");
  for (let x = 0; x < STAGE.width; x += 32) {
    bmp.rect(x, 174, 16, 42, x % 64 === 0 ? "#1b2440dd" : "#241e3cdd");
  }
  bmp.rect(54, 128, 145, 70, "#1a2130ee");
  bmp.rect(60, 135, 133, 56, "#0f1420");
  drawPixelText(bmp, "MODEL ARENA", 78, 151, "#41d6b4", 2);
  bmp.rect(454, 130, 118, 74, "#201b31ee");
  bmp.rect(462, 138, 102, 56, "#0c121f");
  drawPixelText(bmp, "ROUND 01", 486, 154, "#ffb24d", 2);
  return bmp;
}

function drawStageLayerFloor() {
  const bmp = new Bitmap(STAGE.width, STAGE.height);
  bmp.rect(0, 216, STAGE.width, 144, "#11151c");
  for (let y = 216; y < STAGE.height; y += 16) {
    bmp.rect(0, y, STAGE.width, 2, "#2d3443");
  }
  for (let x = -160; x < STAGE.width; x += 64) {
    bmp.line(x, 360, x + 180, 216, "#252b37", 2);
  }
  bmp.rect(0, 214, STAGE.width, 6, "#4ee0d0");
  bmp.rect(0, 220, STAGE.width, 3, "#ffb24d");
  bmp.rect(40, 244, 560, 7, "#0a0d12aa");
  return bmp;
}

function drawHudImage(key) {
  if (key === "health-bar") {
    const bmp = new Bitmap(224, 22);
    bmp.rect(0, 0, 224, 22, "#07080c");
    bmp.rect(3, 3, 218, 16, "#2a3040");
    bmp.rect(6, 6, 212, 10, "#29d66f");
    bmp.rect(6, 6, 212, 3, "#9bffbd");
    return bmp;
  }
  if (key === "meter-bar") {
    const bmp = new Bitmap(160, 14);
    bmp.rect(0, 0, 160, 14, "#07080c");
    bmp.rect(3, 3, 154, 8, "#263046");
    for (let x = 5; x < 154; x += 11) bmp.rect(x, 5, 7, 4, "#46d7ff");
    return bmp;
  }
  if (key === "round-pip") {
    const bmp = new Bitmap(18, 18);
    bmp.rect(3, 3, 12, 12, "#08080c");
    bmp.rect(5, 5, 8, 8, "#ffb24d");
    bmp.rect(7, 7, 4, 4, "#fff3b0");
    return bmp;
  }
  if (key === "timer-plaque") {
    const bmp = new Bitmap(92, 38);
    bmp.rect(0, 0, 92, 38, "#08080c");
    bmp.rect(4, 4, 84, 30, "#1c2131");
    bmp.rect(7, 7, 78, 24, "#30384f");
    drawPixelText(bmp, "60", 33, 11, "#f3f5f4", 3);
    return bmp;
  }
  if (key === "portrait-frame") {
    const bmp = new Bitmap(104, 104);
    bmp.rect(0, 0, 104, 104, "#08080c");
    bmp.rect(4, 4, 96, 96, "#ffb24d");
    bmp.rect(8, 8, 88, 88, "#141926");
    return bmp;
  }
  throw new Error(`Unknown HUD image ${key}`);
}

function drawHitSparkSheet() {
  const frames = 6;
  const width = 32;
  const height = 32;
  const sheet = new Bitmap(width * frames, height);
  for (let i = 0; i < frames; i += 1) {
    const bmp = new Bitmap(width, height);
    const r = 4 + i * 3;
    bmp.rect(15 - r, 15, r * 2, 2, "#fff3b0");
    bmp.rect(15, 15 - r, 2, r * 2, "#fff3b0");
    bmp.line(16 - r, 16 - r, 16 + r, 16 + r, "#ffb24d", 2);
    bmp.line(16 + r, 16 - r, 16 - r, 16 + r, "#46d7ff", 2);
    bmp.steppedOval(16, 16, Math.max(1, r - 2), Math.max(1, r - 3), `#ffffff${hex(Math.max(40, 210 - i * 31))}`);
    sheet.blit(bmp, i * width, 0);
  }
  return sheet;
}

function drawContactSheet(manifest) {
  const bmp = new Bitmap(900, 800, "#10131c");
  drawPixelText(bmp, "SAMA V AMODI ORIGINAL ASSET CONTACT", 32, 24, "#f3f5f4", 2);
  let x = 36;
  for (const character of characters) {
    bmp.blit(drawPortrait(character), x, 62);
    drawPixelText(bmp, character.displayName, x + 15, 166, character.palette.accent, 2);
    let y = 194;
    for (const animation of animations) {
      const frameBmp = new Bitmap(FRAME.width, FRAME.height);
      drawFighterFrame(frameBmp, character, animation.name, Math.min(2, animation.frames - 1), animation.frames);
      bmp.blit(frameBmp, x + 10, y);
      drawPixelText(bmp, animation.name, x + 84, y + 22, "#d7fbf2", 1);
      y += 68;
    }
    x += 268;
  }
  const sky = drawStageLayerSky();
  const mid = drawStageLayerMid();
  const floor = drawStageLayerFloor();
  bmp.blit(scaleDown(sky, 2), 575, 84);
  bmp.blit(scaleDown(mid, 2), 575, 84);
  bmp.blit(scaleDown(floor, 2), 575, 84);
  bmp.blit(drawHitSparkSheet(), 575, 294);
  drawPixelText(bmp, "stage layers", 575, 276, "#ffb24d", 2);
  drawPixelText(bmp, `${manifest.characters.length} chars  ${manifest.stages.length} stage  ${manifest.audio.length} sfx`, 575, 348, "#41d6b4", 2);
  return bmp;
}

function scaleDown(src, factor) {
  const bmp = new Bitmap(Math.floor(src.width / factor), Math.floor(src.height / factor));
  for (let y = 0; y < bmp.height; y += 1) {
    for (let x = 0; x < bmp.width; x += 1) {
      const idx = ((y * factor) * src.width + x * factor) * 4;
      bmp.pixel(x, y, `#${hex(src.data[idx])}${hex(src.data[idx + 1])}${hex(src.data[idx + 2])}${hex(src.data[idx + 3])}`);
    }
  }
  return bmp;
}

function makePngBuffer(bitmap) {
  const raw = Buffer.alloc((bitmap.width * 4 + 1) * bitmap.height);
  for (let y = 0; y < bitmap.height; y += 1) {
    const rowStart = y * (bitmap.width * 4 + 1);
    raw[rowStart] = 0;
    Buffer.from(bitmap.data.buffer, y * bitmap.width * 4, bitmap.width * 4).copy(raw, rowStart + 1);
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(bitmap.width, 0);
  ihdr.writeUInt32BE(bitmap.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  typeBuffer.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return out;
}

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function makeWav({ frequency = 440, durationMs = 180, volume = 0.3, sweep = 0 }) {
  const sampleRate = 22050;
  const samples = Math.floor(sampleRate * durationMs / 1000);
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i += 1) {
    const t = i / sampleRate;
    const env = Math.max(0, 1 - i / samples);
    const f = frequency + sweep * (i / samples);
    const square = Math.sin(2 * Math.PI * f * t) > 0 ? 1 : -1;
    const noise = ((i * 1103515245 + 12345) >>> 16) / 32768 - 1;
    const sample = Math.max(-1, Math.min(1, (square * 0.75 + noise * 0.25) * volume * env));
    data.writeInt16LE(Math.round(sample * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

function pngDimensions(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47 || buffer.toString("ascii", 1, 4) !== "PNG") {
    throw new Error("Not a PNG");
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function publicPath(absPath) {
  return `/${relative(publicDir, absPath).split(sep).join("/")}`;
}

function diskPathFromPublic(publicAssetPath) {
  return join(publicDir, publicAssetPath.replace(/^\//, ""));
}

async function writePng(publicAssetPath, bitmap) {
  const abs = diskPathFromPublic(publicAssetPath);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, makePngBuffer(bitmap));
}

async function writeWav(publicAssetPath, config) {
  const abs = diskPathFromPublic(publicAssetPath);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, makeWav(config));
}

async function main() {
  await mkdir(assetRoot, { recursive: true });
  await mkdir(conceptsDir, { recursive: true });

  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    title: "Sama v Amodi",
    style: "Original hard-edged 8-bit caricature pixel art generated from code; no copied source images or legacy game assets.",
    characters: [],
    stages: [],
    hud: [],
    vfx: [],
    audio: [],
  };

  for (const character of characters) {
    const portraitPath = `/assets/characters/${character.id}/portrait.png`;
    await writePng(portraitPath, drawPortrait(character));
    const characterEntry = {
      id: character.id,
      displayName: character.displayName,
      description: character.fullName,
      visualCue: character.cue,
      portrait: {
        key: `${character.id}-portrait`,
        path: portraitPath,
        width: PORTRAIT.width,
        height: PORTRAIT.height,
      },
      animations: [],
    };

    for (const animation of animations) {
      const sheetPath = `/assets/characters/${character.id}/${animation.name}.png`;
      await writePng(sheetPath, drawSheet(character, animation));
      characterEntry.animations.push({
        name: animation.name,
        key: `${character.id}-${animation.name}`,
        path: sheetPath,
        frameWidth: FRAME.width,
        frameHeight: FRAME.height,
        frameCount: animation.frames,
        columns: animation.frames,
        rows: 1,
        fps: animation.fps,
        loop: animation.loop,
      });
    }
    manifest.characters.push(characterEntry);
  }

  const stageLayers = [
    { id: "skyline", key: "stage-byte-boardroom-skyline", path: "/assets/stages/byte-boardroom/skyline.png", parallax: 0.25, bitmap: drawStageLayerSky() },
    { id: "midground", key: "stage-byte-boardroom-midground", path: "/assets/stages/byte-boardroom/midground.png", parallax: 0.55, bitmap: drawStageLayerMid() },
    { id: "floor", key: "stage-byte-boardroom-floor", path: "/assets/stages/byte-boardroom/floor.png", parallax: 1, bitmap: drawStageLayerFloor() },
  ];
  for (const layer of stageLayers) await writePng(layer.path, layer.bitmap);
  manifest.stages.push({
    id: "byte-boardroom",
    displayName: "Byte Boardroom",
    width: STAGE.width,
    height: STAGE.height,
    floorY: 220,
    spawn: { playerX: 220, cpuX: 420 },
    layers: stageLayers.map(({ bitmap, ...layer }) => ({
      ...layer,
      width: STAGE.width,
      height: STAGE.height,
    })),
  });

  for (const key of ["health-bar", "meter-bar", "round-pip", "timer-plaque", "portrait-frame"]) {
    const bitmap = drawHudImage(key);
    const path = `/assets/hud/${key}.png`;
    await writePng(path, bitmap);
    manifest.hud.push({ key: `hud-${key}`, path, width: bitmap.width, height: bitmap.height });
  }

  const hitSparkPath = "/assets/vfx/hit-spark.png";
  await writePng(hitSparkPath, drawHitSparkSheet());
  manifest.vfx.push({
    key: "vfx-hit-spark",
    path: hitSparkPath,
    frameWidth: 32,
    frameHeight: 32,
    frameCount: 6,
    columns: 6,
    rows: 1,
    animationName: "hit-spark-burst",
    fps: 18,
    loop: false,
  });

  const sfx = [
    { key: "sfx-light", path: "/assets/audio/light.wav", frequency: 520, durationMs: 110, volume: 0.22, sweep: 160 },
    { key: "sfx-heavy", path: "/assets/audio/heavy.wav", frequency: 180, durationMs: 190, volume: 0.3, sweep: -60 },
    { key: "sfx-block", path: "/assets/audio/block.wav", frequency: 260, durationMs: 160, volume: 0.24, sweep: 30 },
    { key: "sfx-special", path: "/assets/audio/special.wav", frequency: 760, durationMs: 360, volume: 0.24, sweep: -420 },
    { key: "sfx-hit", path: "/assets/audio/hit.wav", frequency: 330, durationMs: 150, volume: 0.3, sweep: -140 },
    { key: "sfx-round", path: "/assets/audio/round.wav", frequency: 660, durationMs: 420, volume: 0.2, sweep: 180 },
  ];
  for (const audio of sfx) {
    await writeWav(audio.path, audio);
    manifest.audio.push({
      key: audio.key,
      path: audio.path,
      type: "sfx",
      format: "wav",
      durationMs: audio.durationMs,
    });
  }

  const manifestPath = "/assets/manifest.json";
  await writeFile(diskPathFromPublic(manifestPath), `${JSON.stringify(manifest, null, 2)}\n`);

  await writePng("/assets/concepts/contact-sheet.png", drawContactSheet(manifest));
  await writeFile(join(conceptsDir, "asset-generation-notes.md"), notesFor(manifest));
  await writeFile(join(conceptsDir, "asset-contract.md"), contractFor(manifest));

  await validateManifest(manifest);
  console.log(`Generated ${manifest.characters.length} characters, ${manifest.stages.length} stage, ${manifest.hud.length} HUD images, ${manifest.vfx.length} VFX sheet, and ${manifest.audio.length} SFX files.`);
  console.log(`Manifest: ${publicPath(diskPathFromPublic(manifestPath))}`);
}

function notesFor(manifest) {
  return `# Sama v Amodi Asset Generation Notes

Generated by \`scripts/generate-assets.mjs\`.

## Visual intent

- Hard-edged, code-generated 8-bit caricature art with no antialiasing and no source-photo tracing.
- Sama uses a compact founder silhouette: dark hair, navy jacket, white shirt, and ember accent pixels.
- Amodi uses glasses, beard pixels, a taller stance, purple jacket, and teal research-note accents.
- The stage is an original "Byte Boardroom" scene: nighttime skyline, arena panels, and a geometric floor.
- HUD art is intentionally simple and readable at low resolution.

## Clean-room process

- The generator draws primitives directly into RGBA buffers and encodes PNG files in Node.
- No external images, sprite sheets, atlas files, prompts, configs, or audio files are read.
- SFX are synthetic placeholder WAV tones generated from deterministic math.
- The contact sheet at \`public/assets/concepts/contact-sheet.png\` is for visual inspection only.

## Generated scope

- Characters: ${manifest.characters.map((c) => c.id).join(", ")}
- Animations per character: ${animations.map((a) => a.name).join(", ")}
- Stage: ${manifest.stages.map((s) => s.id).join(", ")}
- Audio keys: ${manifest.audio.map((a) => a.key).join(", ")}
`;
}

function contractFor(manifest) {
  return `# Generated Asset Contract

Consumers should load \`/assets/manifest.json\` and avoid hard-coding generated paths.

## Character sheets

Each character has a \`portrait\` plus one PNG sheet for every animation. All current sheets are 1 row, with \`columns === frameCount\`.

Frame size: ${FRAME.width}x${FRAME.height}

Animations:

${animations.map((a) => `- \`${a.name}\`: ${a.frames} frames, ${a.fps} fps, loop=${a.loop}`).join("\n")}

## Stage

\`${manifest.stages[0].id}\` is ${STAGE.width}x${STAGE.height}, with a floor line at y=${manifest.stages[0].floorY}. Layers are ordered back to front and include a \`parallax\` value.

## HUD, VFX, audio

- HUD entries expose \`key\`, \`path\`, \`width\`, and \`height\`.
- VFX sheets expose the same frame-grid fields as character sheets.
- Audio entries are small mono WAV placeholders and can be replaced later without changing keys.
`;
}

async function validateManifest(manifest) {
  for (const character of manifest.characters) {
    await assertPng(character.portrait.path, character.portrait.width, character.portrait.height);
    const names = new Set();
    for (const animation of character.animations) {
      if (names.has(animation.name)) throw new Error(`Duplicate animation ${character.id}:${animation.name}`);
      names.add(animation.name);
      if (animation.columns * animation.rows !== animation.frameCount) {
        throw new Error(`${animation.key} frameCount does not match columns*rows`);
      }
      await assertPng(animation.path, animation.frameWidth * animation.columns, animation.frameHeight * animation.rows);
    }
  }
  for (const stage of manifest.stages) {
    for (const layer of stage.layers) await assertPng(layer.path, layer.width, layer.height);
  }
  for (const hud of manifest.hud) await assertPng(hud.path, hud.width, hud.height);
  for (const vfx of manifest.vfx) {
    if (vfx.columns * vfx.rows !== vfx.frameCount) throw new Error(`${vfx.key} frameCount does not match columns*rows`);
    await assertPng(vfx.path, vfx.frameWidth * vfx.columns, vfx.frameHeight * vfx.rows);
  }
  for (const audio of manifest.audio) {
    const abs = diskPathFromPublic(audio.path);
    const file = await readFile(abs);
    if (file.toString("ascii", 0, 4) !== "RIFF" || file.toString("ascii", 8, 12) !== "WAVE") {
      throw new Error(`${audio.path} is not a WAV file`);
    }
    if ((await stat(abs)).size < 64) throw new Error(`${audio.path} is unexpectedly small`);
  }
}

async function assertPng(publicAssetPath, expectedWidth, expectedHeight) {
  const abs = diskPathFromPublic(publicAssetPath);
  const file = await readFile(abs);
  const dims = pngDimensions(file);
  if (dims.width !== expectedWidth || dims.height !== expectedHeight) {
    throw new Error(`${publicAssetPath} expected ${expectedWidth}x${expectedHeight}, got ${dims.width}x${dims.height}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
