#!/usr/bin/env python3
"""Generate the extension icons (icons/icon{16,48,128}.png) with no third-party dependencies.

The icon is a rounded indigo square with three stacked white bars (a "stash").
Run from the repo root:  python3 tools/make-icons.py
"""
import struct
import zlib
from pathlib import Path

BG = (79, 70, 229)  # --accent
FG = (255, 255, 255)
SS = 4  # supersampling factor for smooth edges


def inside_rounded_rect(x, y, x0, y0, x1, y1, r):
    if not (x0 <= x <= x1 and y0 <= y <= y1):
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def render(size):
    bars = []  # (x0, y0, x1, y1, radius) in unit coordinates scaled to size
    for i, (inset, width) in enumerate([(0.24, 0.52), (0.20, 0.60), (0.16, 0.68)]):
        y0 = 0.28 + i * 0.20
        bars.append((inset * size, y0 * size, (inset + width) * size, (y0 + 0.12) * size, 0.05 * size))
    pixels = []
    for py in range(size):
        row = []
        for px in range(size):
            acc = [0, 0, 0, 0]
            for sy in range(SS):
                for sx in range(SS):
                    x = px + (sx + 0.5) / SS
                    y = py + (sy + 0.5) / SS
                    if not inside_rounded_rect(x, y, 0, 0, size, size, size * 0.22):
                        continue
                    on_bar = any(inside_rounded_rect(x, y, *b) for b in bars)
                    r, g, b = FG if on_bar else BG
                    acc[0] += r
                    acc[1] += g
                    acc[2] += b
                    acc[3] += 255
            n = SS * SS
            covered = acc[3] // 255
            if covered:
                row += [acc[0] // covered, acc[1] // covered, acc[2] // covered, acc[3] // n]
            else:
                row += [0, 0, 0, 0]
        pixels.append(bytes(row))
    return pixels


def write_png(path, size, rows):
    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + row for row in rows)  # filter type 0 per scanline
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)


if __name__ == "__main__":
    out = Path(__file__).resolve().parent.parent / "icons"
    out.mkdir(exist_ok=True)
    for size in (16, 48, 128):
        write_png(out / f"icon{size}.png", size, render(size))
        print(f"wrote icons/icon{size}.png")
