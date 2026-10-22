#!/usr/bin/env python3
"""Generate Code Dojo icons: rounded green tile with a white flame (pure stdlib).

Historical: the icon set is now the garden gate + code brackets mark
(icons/icon.svg, rasterized with rsvg-convert — see README). This flame
generator is kept for reference; do not run it over the current icons."""
import struct, zlib, math, os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons")


def png(w, h, rgba):
    def chunk(t, d):
        c = t + d
        return struct.pack(">I", len(d)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + bytes(rgba[y * w * 4:(y + 1) * w * 4]) for y in range(h))
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def in_flame(x, y, S):
    """Union of two circles + a diamond tip -> a flame silhouette."""
    cx = S / 2
    cy = S / 2

    def circ(px, py, r):
        return (x - px) ** 2 + (y - py) ** 2 <= r * r

    if circ(cx, cy + 0.10 * S, 0.235 * S):        # round bottom
        return True
    if circ(cx + 0.045 * S, cy - 0.04 * S, 0.165 * S):  # upper bulge
        return True
    # diamond tip pointing up-left, like a real flame's lick
    tx, ty = cx - 0.04 * S, cy - 0.22 * S
    if abs(x - tx) / (0.075 * S) + abs(y - ty) / (0.155 * S) <= 1.0:
        return True
    return False


def render(size, ss=4):
    S = size * ss
    px = bytearray(S * S * 4)
    r = S * 0.23

    for y in range(S):
        for x in range(S):
            nx = min(max(x, r), S - 1 - r)
            ny = min(max(y, r), S - 1 - r)
            if (x - nx) ** 2 + (y - ny) ** 2 > r * r and (
                x < r or x > S - 1 - r or y < r or y > S - 1 - r
            ):
                continue

            t = (x + y) / (2 * (S - 1))
            R = int(0x3F + (0x22 - 0x3F) * t)
            G = int(0x8F + (0xB8 - 0x8F) * t)
            B = int(0x02 + (0x4A - 0x02) * t)

            # flame with a soft edge
            hits = 0
            for dy in (0, 1):
                for dx in (0, 1):
                    if in_flame(x + dx * 0.5, y + dy * 0.5, S):
                        hits += 1
            flame = hits / 4.0
            if flame > 0:
                R = int(R + (255 - R) * flame)
                G = int(G + (255 - G) * flame)
                B = int(B + (255 - B) * flame)

            i = (y * S + x) * 4
            px[i:i + 4] = bytes((R, G, B, 255))

    if ss > 1:
        out = bytearray(size * size * 4)
        for y in range(size):
            for x in range(size):
                rs = gs = bs = as_ = 0
                for j in range(ss):
                    for i in range(ss):
                        k = (((y * ss + j) * S) + x * ss + i) * 4
                        rs += px[k]; gs += px[k + 1]; bs += px[k + 2]; as_ += px[k + 3]
                n = ss * ss
                o = (y * size + x) * 4
                out[o:o + 4] = bytes((rs // n, gs // n, bs // n, as_ // n))
        px = out
    return bytes(px)


def main():
    os.makedirs(OUT, exist_ok=True)
    for size in (16, 32, 48, 128):
        data = png(size, size, render(size))
        with open(os.path.join(OUT, f"icon{size}.png"), "wb") as f:
            f.write(data)
        print(f"icons/icon{size}.png ({len(data)} bytes)")


if __name__ == "__main__":
    main()
