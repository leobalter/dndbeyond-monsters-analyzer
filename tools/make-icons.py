#!/usr/bin/env python3
"""Generate the extension icons in icons/.

A 128x128 PNG is rendered from scratch using only the Python standard library
(zlib + struct) and then downscaled to 48px and 16px via macOS `sips`. Run
from anywhere:

    python3 tools/make-icons.py

Re-run any time the design changes.
"""
import os
import struct
import subprocess
import zlib

SIZE = 128
BG = (184, 38, 28)      # accent red
FG = (255, 255, 255)    # white "M"


def make_pixels(size):
    pixels = [[BG] * size for _ in range(size)]

    margin = 18
    bar_w = 14
    top = margin
    bottom = size - margin
    mid_x = size // 2
    mid_y = int(top + (bottom - top) * 0.62)

    def fill_rect(x0, y0, x1, y1):
        for y in range(max(0, y0), min(size, y1)):
            for x in range(max(0, x0), min(size, x1)):
                pixels[y][x] = FG

    def thick_line(x0, y0, x1, y1, thickness):
        steps = max(abs(x1 - x0), abs(y1 - y0)) + 1
        for i in range(steps):
            t = i / (steps - 1) if steps > 1 else 0
            x = round(x0 + (x1 - x0) * t)
            y = round(y0 + (y1 - y0) * t)
            fill_rect(x - thickness // 2, y - thickness // 2,
                      x + thickness // 2 + 1, y + thickness // 2 + 1)

    fill_rect(margin, top, margin + bar_w, bottom)
    fill_rect(size - margin - bar_w, top, size - margin, bottom)
    thick_line(margin + bar_w - 1, top, mid_x, mid_y, bar_w)
    thick_line(size - margin - bar_w, top, mid_x, mid_y, bar_w)
    return pixels


def write_png(path, pixels):
    height = len(pixels)
    width = len(pixels[0])
    sig = b'\x89PNG\r\n\x1a\n'

    def chunk(name, data):
        crc = zlib.crc32(name + data) & 0xffffffff
        return struct.pack('>I', len(data)) + name + data + struct.pack('>I', crc)

    ihdr = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    raw = bytearray()
    for row in pixels:
        raw.append(0)
        for (r, g, b) in row:
            raw.extend((r, g, b))
    idat = zlib.compress(bytes(raw), 9)
    with open(path, 'wb') as f:
        f.write(sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b''))


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.path.normpath(os.path.join(here, '..', 'icons'))
    os.makedirs(out_dir, exist_ok=True)

    src = os.path.join(out_dir, 'icon-128.png')
    write_png(src, make_pixels(SIZE))
    print('wrote', src)

    for s in (48, 16):
        dst = os.path.join(out_dir, f'icon-{s}.png')
        subprocess.run(
            ['sips', '-z', str(s), str(s), src, '--out', dst],
            check=True, stdout=subprocess.DEVNULL,
        )
        print('wrote', dst)


if __name__ == '__main__':
    main()
