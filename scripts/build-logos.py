"""Builds the SMARTA logo PNGs from the sources in design/logos/.

Run from the repo root:  python scripts/build-logos.py   (needs Pillow)
Spec: docs/superpowers/specs/2026-10-05-logo-refresh-design.md
"""
from pathlib import Path
from PIL import Image, ImageDraw

SRC = Path('design/logos')
SIMS = Path('src/assets')
PARENT = Path('parent/public/icons')
INK = (0x12, 0x31, 0x3a, 255)  # sidebar ink, behind the white S on the favicon
WHITE = (255, 255, 255, 255)


def trimmed(name):
    """Open a source and crop it to the visible artwork (alpha bounding box)."""
    im = Image.open(SRC / name).convert('RGBA')
    return im.crop(im.getchannel('A').getbbox())


def fit(im, box):
    """Scale im so it fits inside a box x box square, keeping its aspect ratio."""
    scale = min(box / im.width, box / im.height)
    return im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)


def on_canvas(art, size, box, fill=(0, 0, 0, 0)):
    """Centre art (fit into box) on a size x size canvas filled with fill."""
    canvas = Image.new('RGBA', (size, size), fill)
    art = fit(art, box)
    canvas.alpha_composite(art, ((size - art.width) // 2, (size - art.height) // 2))
    return canvas


def save(im, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, optimize=True)
    print(f'{path}  {im.width}x{im.height}  {im.mode}')


def favicon():
    tile = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    ImageDraw.Draw(tile).rounded_rectangle((0, 0, 63, 63), radius=14, fill=INK)
    s = fit(trimmed('dashboard-app.png'), 48)
    tile.alpha_composite(s, ((64 - s.width) // 2, (64 - s.height) // 2))
    return tile


def wordmark():
    word = trimmed('project-name.png')
    return word.resize((480, round(word.height * 480 / word.width)), Image.LANCZOS)


def parent_icon(size, share):
    # Opaque RGB so iOS never fills transparent corners with black.
    return on_canvas(trimmed('phone-app.png'), size, round(size * share), WHITE).convert('RGB')


if __name__ == '__main__':
    save(favicon(), SIMS / 'sims-favicon.png')
    save(wordmark(), SIMS / 'smarta-wordmark.png')
    save(on_canvas(trimmed('phone-app.png'), 64, 64), SIMS / 'smarta-mark.png')
    save(parent_icon(192, 0.8), PARENT / 'icon-192.png')
    save(parent_icon(512, 0.8), PARENT / 'icon-512.png')
    save(parent_icon(512, 0.6), PARENT / 'icon-maskable-512.png')
