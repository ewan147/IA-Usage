from pathlib import Path

from PIL import Image

src = Path(r"C:\Users\ewang\Projects\clawd-usage\src\assets\clawd\idle-sparkles.jpg")
out_dir = Path(r"C:\Users\ewang\Projects\clawd-usage\src-tauri\icons")
assets = Path(r"C:\Users\ewang\Projects\clawd-usage\src\assets\clawd")
out_dir.mkdir(parents=True, exist_ok=True)

img = Image.open(src).convert("RGBA")
pixels = img.load()
w, h = img.size
for y in range(h):
    for x in range(w):
        r, g, b, a = pixels[x, y]
        if r >= 240 and g >= 240 and b >= 240:
            pixels[x, y] = (r, g, b, 0)
        elif r >= 230 and g >= 230 and b >= 230:
            alpha = int(255 * (1 - ((r + g + b) / 3 - 230) / 25))
            pixels[x, y] = (r, g, b, max(0, min(255, alpha)))

bbox = img.getbbox()
if bbox:
    img = img.crop(bbox)
    pad = 8
    canvas = Image.new("RGBA", (img.width + pad * 2, img.height + pad * 2), (0, 0, 0, 0))
    canvas.paste(img, (pad, pad), img)
    img = canvas

transparent = assets / "idle-transparent.png"
img.save(transparent)


def square(size: int) -> Image.Image:
    fitted = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ratio = min(size / img.width, size / img.height)
    nw, nh = max(1, int(img.width * ratio)), max(1, int(img.height * ratio))
    resized = img.resize((nw, nh), Image.Resampling.NEAREST)
    fitted.paste(resized, ((size - nw) // 2, (size - nh) // 2), resized)
    return fitted


sizes = [16, 32, 48, 64, 128, 256]
icos = [square(s) for s in sizes]
icos[-1].save(out_dir / "icon.ico", format="ICO", sizes=[(s, s) for s in sizes])
square(32).save(out_dir / "32x32.png")
square(128).save(out_dir / "128x128.png")
square(256).save(out_dir / "128x128@2x.png")
square(256).save(assets / "app-icon.png")
print("ok", transparent)
