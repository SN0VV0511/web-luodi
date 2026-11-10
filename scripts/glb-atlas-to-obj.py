#!/usr/bin/env python3
"""把调色板图集着色的低多边形 glTF（如 Quaternius 2024 Truck, CC0）转成带材质分组的 OBJ，
供 scripts/build-vehicle-assets.mjs 复用同一套「车身 / 玻璃 / 饰条 / 镀铬 / 车灯」分组。
每个三角形在图集上按 UV 质心取色：高饱和彩色 → Body（实例车漆），近黑 → Windows，深灰 → Black，
浅灰/白 → Grey（金属货厢）；Headlights / BrakeLight 材质 → Headlights / TailLights。
用法：python3 scripts/glb-atlas-to-obj.py <in.glb> <out.obj>"""
import sys, json, struct, io
import numpy as np
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
data = open(src, "rb").read()
jlen = struct.unpack("<I", data[12:16])[0]
gltf = json.loads(data[20:20 + jlen])
bin_off = 20 + jlen + 8
binary = data[bin_off:]

def view(i):
    bv = gltf["bufferViews"][i]
    o = bv.get("byteOffset", 0)
    return binary[o:o + bv["byteLength"]]

COMP = {5126: ("f", 4), 5123: ("H", 2), 5125: ("I", 4), 5121: ("B", 1)}
SIZE = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}
def accessor(i):
    a = gltf["accessors"][i]
    fmt, nb = COMP[a["componentType"]]
    n = SIZE[a["type"]]
    bv = gltf["bufferViews"][a["bufferView"]]
    raw = view(a["bufferView"])[a.get("byteOffset", 0):]
    stride = bv.get("byteStride", n * nb)
    dtype = np.dtype("<" + fmt)
    out = np.zeros((a["count"], n), dtype=np.float64)
    for k in range(a["count"]):
        out[k] = np.frombuffer(raw[k * stride:k * stride + n * nb], dtype=dtype)
    return out

atlas = Image.open(io.BytesIO(view(gltf["images"][0]["bufferView"]))).convert("RGB")
W, H = atlas.size
px = atlas.load()

def quat_matrix(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])

materials = [m.get("name", "") for m in gltf["materials"]]
lines = []
vbase = nbase = 1
for node in gltf["nodes"]:
    if "mesh" not in node:
        continue
    R = quat_matrix(node.get("rotation", [0, 0, 0, 1]))
    S = np.array(node.get("scale", [1, 1, 1]))
    T = np.array(node.get("translation", [0, 0, 0]))
    lines.append(f"o {node['name']}")
    for prim in gltf["meshes"][node["mesh"]]["primitives"]:
        P = accessor(prim["attributes"]["POSITION"])
        N = accessor(prim["attributes"]["NORMAL"])
        UV = accessor(prim["attributes"]["TEXCOORD_0"])
        idx = accessor(prim["indices"]).astype(int).ravel() if "indices" in prim else np.arange(len(P))
        Pw = (R @ (P * S).T).T + T
        Nw = (R @ N.T).T
        Nw /= np.linalg.norm(Nw, axis=1, keepdims=True) + 1e-9
        for p in Pw: lines.append(f"v {p[0]:.5f} {p[1]:.5f} {p[2]:.5f}")
        for n in Nw: lines.append(f"vn {n[0]:.4f} {n[1]:.4f} {n[2]:.4f}")
        mat = materials[prim.get("material", 0)]
        current = None
        for t in range(0, len(idx), 3):
            a, b, c = idx[t:t + 3]
            if mat in ("Headlights", "BrakeLight"):
                group = "Headlights" if mat == "Headlights" else "TailLights"
            else:
                u, v = UV[[a, b, c]].mean(axis=0)
                r, g, bl = [x / 255 for x in px[min(W - 1, int(u % 1 * W)), min(H - 1, int(v % 1 * H))]]
                hi, lo = max(r, g, bl), min(r, g, bl)
                sat = (hi - lo) / max(hi, 1e-4)
                if hi < 0.16: group = "Windows"
                elif sat > 0.3: group = "Body"
                elif hi < 0.45: group = "Black"
                else: group = "Grey"
            if group != current:
                lines.append(f"usemtl {group}")
                current = group
            lines.append("f " + " ".join(f"{vbase + i}//{nbase + i}" for i in (a, b, c)))
        vbase += len(P)
        nbase += len(N)
open(dst, "w").write("\n".join(lines) + "\n")
print("wrote", dst)
