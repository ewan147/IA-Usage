from pathlib import Path
from PIL import Image

ASSETS = Path(r"C:\Users\ewang\Projects\clawd-usage\src\assets\clawd")
OUT = ASSETS / "transparent"
OUT.mkdir(parents=True, exist_ok=True)

SOURCES = {
    "sparkles": "idle-sparkles.jpg",
    "sunglasses": "hover-sunglasses.png",
    "halo": "hover-halo.png",
    "blast": "open-blast.jpg",
    "skate": "open-skate.jpg",
    "invader": "loading-invader.png",
    "arrows": "high-arrows.png",
    "flag": "success-flag.jpg",
}
TARGET = 128

def knock_out_white(img):
    img = img.convert("RGBA")
    pixels = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            brightness = (r + g + b) / 3
            if r >= 248 and g >= 248 and b >= 248:
                pixels[x, y] = (r, g, b, 0)
            elif r >= 235 and g >= 235 and b >= 235 and abs(r - g) < 12 and abs(g - b) < 12:
                t = (brightness - 235) / 20
                alpha = int(a * (1 - min(1, max(0, t))))
                pixels[x, y] = (r, g, b, alpha)
    return img

def to_square(img, size=TARGET):
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    pad = max(2, size // 16)
    canvas = Image.new("RGBA", (img.width + pad * 2, img.height + pad * 2), (0, 0, 0, 0))
    canvas.paste(img, (pad, pad), img)
    img = canvas
    fitted = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ratio = min(size / img.width, size / img.height)
    nw = max(1, int(img.width * ratio))
    nh = max(1, int(img.height * ratio))
    resized = img.resize((nw, nh), Image.Resampling.NEAREST)
    fitted.paste(resized, ((size - nw) // 2, (size - nh) // 2), resized)
    return fitted

for name, filename in SOURCES.items():
    src = ASSETS / filename
    out = OUT / f"{name}.png"
    result = to_square(knock_out_white(Image.open(src)))
    result.save(out)
    print("wrote", out)

Image.open(OUT / "sparkles.png").save(ASSETS / "idle-transparent.png")
print("done")
