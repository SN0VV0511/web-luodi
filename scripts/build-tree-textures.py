#!/usr/bin/env python3
"""EZ-Tree 叶片贴图 → 2×2 图集（橡/白蜡/云杉/山杨），树皮（Poly Haven bark_brown_02, CC0）→ 256 px WebP。
用法：python3 scripts/build-tree-textures.py <ez-tree src/lib/assets 目录>"""
import sys, os
from PIL import Image

src = sys.argv[1]
out = os.path.join(os.getcwd(), "public/models/trees")
os.makedirs(out, exist_ok=True)
cell = 320
atlas = Image.new("RGBA", (cell * 2, cell * 2), (0, 0, 0, 0))
# 图集左上 = uv(0,0.5)：oak；右上 ash；左下 pine；右下 aspen（与 build-tree-assets.mjs 的 CELL 对应）。
for name, (cx, cy) in {"oak": (0, 0), "ash": (1, 0), "pine": (0, 1), "aspen": (1, 1)}.items():
    leaf = Image.open(os.path.join(src, "leaves", f"{name}_color.png")).convert("RGBA").resize((cell - 6, cell - 6), Image.LANCZOS)
    # 透明区域填充邻近叶色，避免 mipmap 时边缘发白。
    r, g, b, a = leaf.split()
    if name == "aspen":
        # 山杨叶原图为秋黄色：色相旋转到夏季绿，作为椴树/杨树类行道树的圆叶。
        h, sat, val = leaf.convert("RGB").convert("HSV").split()
        h = h.point(lambda x: (x + 40) % 256)
        sat = sat.point(lambda x: int(x * 0.8))
        val = val.point(lambda x: int(x * 0.72))
        leaf = Image.merge("HSV", (h, sat, val)).convert("RGB")
        leaf.putalpha(a)
    base = Image.new("RGBA", leaf.size, (54, 74, 34, 0))
    base.paste(leaf, (0, 0), leaf)
    atlas.paste(base, (cx * cell + 3, cy * cell + 3))
atlas.save(os.path.join(out, "leaves.webp"), "WEBP", quality=82, method=6)
bark = Image.open(os.path.join(src, "bark", "oak_color_1k.jpg")).convert("RGB").resize((256, 256), Image.LANCZOS)
bark.save(os.path.join(out, "bark.webp"), "WEBP", quality=78, method=6)
for f in ("leaves.webp", "bark.webp"):
    print(f, os.path.getsize(os.path.join(out, f)))
