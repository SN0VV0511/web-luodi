#!/usr/bin/env python3
"""把 UBC 人体底色贴图缩放为 512 px WebP，并输出肤色参考值（运行时用于按居民肤色重新着色）。

用法：python3 scripts/build-people-textures.py "<UBC Base Characters 目录>"
"""
import sys
from pathlib import Path
from PIL import Image

root = Path(sys.argv[1])
out = Path("public/models/people")
out.mkdir(parents=True, exist_ok=True)
for name, src in [("body-male", root / "Textures/T_Superhero_Male_Ligh.png"), ("body-female", root / "Godot - UE/T_Superhero_Female_Dark_BaseColor.png")]:
    im = Image.open(src).convert("RGB").resize((512, 512), Image.LANCZOS)
    im.save(out / f"{name}.webp", "WEBP", quality=82, method=6)
    # 额头区域平均色作为肤色参考。
    crop = im.crop((60, 40, 140, 70))
    px = list(crop.getdata())
    avg = [sum(p[c] for p in px) / len(px) / 255 for c in range(3)]
    print(name, (out / f"{name}.webp").stat().st_size, "skinRef", [round(a, 3) for a in avg])
