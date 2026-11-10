#!/usr/bin/env python3
"""把 UBC 人体底色贴图缩放为 1024 px WebP（面部约 360 px），法线贴图缩放为 512 px WebP，并输出肤色参考值（运行时用于按居民肤色重新着色）。

用法：python3 scripts/build-people-textures.py "<UBC Base Characters 目录>"
"""
import sys
from pathlib import Path
from PIL import Image

root = Path(sys.argv[1])
out = Path("public/models/people")
out.mkdir(parents=True, exist_ok=True)
for name, src, normal in [
    ("body-male", root / "Textures/T_Superhero_Male_Ligh.png", root / "Godot - UE/T_Superhero_Male_Normal.png"),
    ("body-female", root / "Godot - UE/T_Superhero_Female_Dark_BaseColor.png", root / "Godot - UE/T_Superhero_Female_Normal.png"),
]:
    im = Image.open(src).convert("RGB").resize((1024, 1024), Image.LANCZOS)
    im.save(out / f"{name}.webp", "WEBP", quality=80, method=6)
    Image.open(normal).convert("RGB").resize((512, 512), Image.LANCZOS).save(out / f"{name}-normal.webp", "WEBP", quality=84, method=6)
    print(name, "normal", (out / f"{name}-normal.webp").stat().st_size)
    # 额头区域平均色作为肤色参考（与 512 px 时相同的区域）。
    crop = im.crop((120, 80, 280, 140))
    px = list(crop.getdata())
    avg = [sum(p[c] for p in px) / len(px) / 255 for c in range(3)]
    print(name, (out / f"{name}.webp").stat().st_size, "skinRef", [round(a, 3) for a in avg])
