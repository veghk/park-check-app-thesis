"""
Downloads the OpenALPR EU benchmark dataset and converts it to the
project's ground_truth.json format.

Source: https://github.com/openalpr/benchmarks/tree/master/endtoend/eu
License: AGPL v3

Run from project root:
  python backend/eval/download_eu_plates.py
"""

import json
import os
import time
import urllib.request

_HERE       = os.path.dirname(os.path.abspath(__file__))
OUT_DIR     = os.path.join(_HERE, "test_plates")
GT_PATH     = os.path.join(OUT_DIR, "ground_truth.json")
BASE_RAW    = "https://raw.githubusercontent.com/openalpr/benchmarks/master/endtoend/eu"

# All 108 image names in the dataset
EU_NAMES = (
    [f"eu{i}" for i in range(1, 12)] +
    [f"test_{i:03d}" for i in range(1, 98)]
)


def fetch(url, dest):
    urllib.request.urlretrieve(url, dest)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    # Remove old non-EU images (hashed filenames) but keep ground_truth.json for now
    removed = 0
    for f in os.listdir(OUT_DIR):
        if f.endswith(".jpg") and f != "ground_truth.json":
            os.remove(os.path.join(OUT_DIR, f))
            removed += 1
    if removed:
        print(f"Removed {removed} old test images.")

    gt = {}
    total = len(EU_NAMES)

    for i, name in enumerate(EU_NAMES, 1):
        jpg = f"{name}.jpg"
        txt = f"{name}.txt"
        jpg_url = f"{BASE_RAW}/{jpg}"
        txt_url = f"{BASE_RAW}/{txt}"
        jpg_path = os.path.join(OUT_DIR, jpg)

        print(f"[{i:3d}/{total}] {jpg} ... ", end="", flush=True)

        try:
            fetch(jpg_url, jpg_path)
            ann_raw = urllib.request.urlopen(txt_url).read().decode().strip()
            cols = ann_raw.split("\t")
            x1, y1, w, h = int(cols[1]), int(cols[2]), int(cols[3]), int(cols[4])
            text = cols[5].strip().upper()
            gt[jpg] = {"box": [x1, y1, x1 + w, y1 + h], "text": text}
            print("OK")
        except Exception as e:
            print(f"FAILED ({e})")

        # Be polite to GitHub CDN
        time.sleep(0.05)

    with open(GT_PATH, "w") as f:
        json.dump(gt, f, indent=2)

    print(f"\nDone. {len(gt)} images saved to {OUT_DIR}/")
    print(f"ground_truth.json written to {GT_PATH}")


if __name__ == "__main__":
    main()
