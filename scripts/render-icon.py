"""Render icon.svg's design to a GitHub-hosted raster tile (assets/icon-180.png).

Draws at 4x the 64-unit viewBox, then downsamples with LANCZOS so the rounded
corners and the rotated eraser stay clean at storefront size.
"""

from pathlib import Path

from PIL import Image, ImageDraw

SCALE = 11  # 64 * 11 = 704, downsampled to 180
UNITS = 64
SIZE = UNITS * SCALE
OUT = Path(__file__).resolve().parent.parent / "assets" / "icon-180.png"

BG = "#111827"
LINE = "#E5E7EB"
ERASER = "#34D399"
ERASER_HEAD = "#059669"
REMNANT = "#6B7280"


def s(value: float) -> int:
    return round(value * SCALE)


def bar(draw: ImageDraw.ImageDraw, x, y, w, h, fill, radius=None):
    r = radius if radius is not None else h / 2
    draw.rounded_rectangle([s(x), s(y), s(x + w), s(y + h)], radius=s(r), fill=fill)


def main() -> None:
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=s(14), fill=BG)

    for x, y, w in ((12, 15, 40), (12, 25, 31), (12, 35, 37)):
        bar(draw, x, y, w, 4.5, LINE)

    # The eraser sits on its own layer so the -34 degree rotation is not
    # clipped by the rounded card.
    eraser = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    edraw = ImageDraw.Draw(eraser)
    edraw.rounded_rectangle(
        [s(33), s(38.5), s(33 + 28), s(38.5 + 13)], radius=s(3.5), fill=ERASER
    )
    edraw.rounded_rectangle(
        [s(33), s(38.5), s(33 + 9), s(38.5 + 13)], radius=s(3.5), fill=ERASER_HEAD
    )
    eraser = eraser.rotate(-34, resample=Image.BICUBIC, center=(s(47), s(45)))
    canvas = Image.alpha_composite(canvas, eraser)

    draw = ImageDraw.Draw(canvas)
    for x, y, w in ((12, 47, 7), (22.5, 47, 4.5)):
        bar(draw, x, y, w, 4.5, REMNANT)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.resize((180, 180), Image.LANCZOS).save(OUT, format="PNG", optimize=True)
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
