# -*- coding: utf-8 -*-
"""Generate extension icons (rounded-square + magnifier) with pure-stdlib PNG output.

Uses signed distance fields so anti-aliasing is analytic (no supersampling needed).
Run:  python make_icons.py
"""
import math
import os
import struct
import zlib

OUT_DIR = os.path.dirname(os.path.abspath(__file__))


# ---------------------------------------------------------------- SDF helpers
def sd_round_rect(px, py, half_w, half_h, r):
    qx = abs(px) - half_w + r
    qy = abs(py) - half_h + r
    outside = math.hypot(max(qx, 0.0), max(qy, 0.0))
    inside = min(max(qx, qy), 0.0)
    return outside + inside - r


def sd_ring(px, py, cx, cy, radius, thickness):
    return abs(math.hypot(px - cx, py - cy) - radius) - thickness * 0.5


def sd_segment(px, py, ax, ay, bx, by, thickness):
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    ll = vx * vx + vy * vy
    t = 0.0 if ll == 0 else max(0.0, min(1.0, (wx * vx + wy * vy) / ll))
    dx, dy = wx - vx * t, wy - vy * t
    return math.hypot(dx, dy) - thickness * 0.5


def coverage(d):
    """1 px analytic-ish anti-aliasing."""
    return max(0.0, min(1.0, 0.5 - d))


def mix(c1, c2, t):
    return tuple(c1[i] + (c2[i] - c1[i]) * t for i in range(4))


def over(bottom, top):
    """Standard source-over compositing, both RGBA in 0..1."""
    ta = top[3]
    na = ta + bottom[3] * (1 - ta)
    if na <= 0:
        return (0.0, 0.0, 0.0, 0.0)
    nr = (top[0] * ta + bottom[0] * bottom[3] * (1 - ta)) / na
    ng = (top[1] * ta + bottom[1] * bottom[3] * (1 - ta)) / na
    nb = (top[2] * ta + bottom[2] * bottom[3] * (1 - ta)) / na
    return (nr, ng, nb, na)


# ------------------------------------------------------------------ PNG write
def write_png(path, width, height, rgba_rows):
    raw = bytearray()
    for row in rgba_rows:
        raw.append(0)  # filter type 0
        raw.extend(row)
    compressed = zlib.compress(bytes(raw), 9)

    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', ihdr)
           + chunk(b'IDAT', compressed)
           + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(png)


# ------------------------------------------------------------------- renderer
def render_master(size=512):
    """Render the master icon at `size` x `size` (supersample-free, SDF based)."""
    s = float(size)
    pad = s * 0.06                      # outer margin
    half = (s - pad * 2) / 2.0
    corner = s * 0.235                  # rounded-square corner radius

    # gradient endpoints (indigo -> violet)
    c_top = (0.396, 0.325, 0.949, 1.0)    # #6553f2
    c_bot = (0.663, 0.333, 0.968, 1.0)    # #a955f7

    # magnifier geometry (relative to icon box)
    ring_cx, ring_cy = s * 0.445, s * 0.435
    ring_r = s * 0.180
    ring_t = s * 0.088
    hx1, hy1 = ring_cx + ring_r * 0.72, ring_cy + ring_r * 0.72
    hx2, hy2 = s * 0.775, s * 0.775
    handle_t = s * 0.085

    # a small "home" roof accent under the ring, adds character at 128px
    rows = []
    for y in range(size):
        row = bytearray()
        py = y + 0.5 - s / 2.0
        for x in range(size):
            px = x + 0.5 - s / 2.0

            # ---- plate
            d_plate = sd_round_rect(px, py, half, half, corner)
            a_plate = coverage(d_plate)
            if a_plate <= 0.0:
                row.extend(b'\x00\x00\x00\x00')
                continue
            grad = mix(c_top, c_bot, min(1.0, max(0.0, (y + 0.5) / s)))
            plate = (grad[0], grad[1], grad[2], a_plate)

            # ---- glyph (white)
            a_ring = coverage(sd_ring(px, py, ring_cx - s / 2.0,
                                      ring_cy - s / 2.0, ring_r, ring_t))
            a_handle = coverage(sd_segment(px, py, hx1 - s / 2.0, hy1 - s / 2.0,
                                           hx2 - s / 2.0, hy2 - s / 2.0, handle_t))
            a_glyph = max(a_ring, a_handle)
            if a_glyph > 0.0:
                plate = over(plate, (1.0, 1.0, 1.0, min(1.0, a_glyph) * 0.97))

            row.extend(bytes((
                int(round(plate[0] * 255)),
                int(round(plate[1] * 255)),
                int(round(plate[2] * 255)),
                int(round(plate[3] * 255)),
            )))
        rows.append(row)
    return rows


def downsample(master, master_size, target):
    """Box-filter downsample from the square master."""
    ratio = master_size / target
    out = []
    for ty in range(target):
        row = bytearray()
        y0 = int(ty * ratio)
        y1 = max(y0 + 1, int((ty + 1) * ratio))
        for tx in range(target):
            x0 = int(tx * ratio)
            x1 = max(x0 + 1, int((tx + 1) * ratio))
            # premultiply for correct averaging of alpha
            sr = sg = sb = sa = 0.0
            n = 0
            for yy in range(y0, y1):
                mrow = master[yy]
                for xx in range(x0, x1):
                    i = xx * 4
                    a = mrow[i + 3] / 255.0
                    sr += mrow[i] * a
                    sg += mrow[i + 1] * a
                    sb += mrow[i + 2] * a
                    sa += a
                    n += 1
            if n == 0 or sa == 0:
                row.extend(b'\x00\x00\x00\x00')
                continue
            row.extend(bytes((
                int(round(sr / sa)),
                int(round(sg / sa)),
                int(round(sb / sa)),
                int(round(sa / n * 255)),
            )))
        out.append(row)
    return out


def main():
    master_size = 512
    print('rendering master %dx%d ...' % (master_size, master_size))
    master = render_master(master_size)
    for target in (128, 48, 32, 16):
        rows = downsample(master, master_size, target)
        path = os.path.join(OUT_DIR, 'icon%d.png' % target)
        write_png(path, target, target, rows)
        print('  wrote', path, os.path.getsize(path), 'bytes')


if __name__ == '__main__':
    main()
