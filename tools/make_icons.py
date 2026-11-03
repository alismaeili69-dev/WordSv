"""Generate the PNG app icons (Swedish flag) used by iPhone and Android.
Run automatically by the GitHub Pages workflow; needs Pillow (pip install pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw

BLUE, YELLOW = "#006AA7", "#FECC02"
out = Path(__file__).resolve().parent.parent / "icons"
out.mkdir(exist_ok=True)


def make(size: int, name: str) -> None:
    s = size / 512
    im = Image.new("RGB", (size, size), BLUE)
    d = ImageDraw.Draw(im)
    d.rectangle([150 * s, 0, 234 * s - 1, size], fill=YELLOW)   # vertical bar (towards the hoist)
    d.rectangle([0, 214 * s, size, 298 * s - 1], fill=YELLOW)   # horizontal bar
    im.save(out / name)


for size, name in [(512, "icon-512.png"), (192, "icon-192.png"), (180, "apple-touch-icon.png")]:
    make(size, name)
print("icons written to", out)
