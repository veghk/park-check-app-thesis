"""
OCR Accuracy Evaluation
=======================
Runs test plate images through fast-plate-ocr (same pipeline as the backend CheckView)
and reports exact match accuracy, character error rate, and a per-image table.

Setup:
  1. Add plate photos to  backend/eval/test_plates/
  2. Fill in backend/eval/test_plates/ground_truth.json  (see format below)
  3. Run:  cd backend && python eval/evaluate_ocr.py

ground_truth.json format:
{
  "plate1.jpg": "ABC-123",
  "plate2.jpg": "XY-456"
}
"""

import json
import os
import re
import sys

import numpy as np
from fast_plate_ocr import ONNXPlateRecognizer
from PIL import Image

_HERE = os.path.dirname(os.path.abspath(__file__))

GROUND_TRUTH_PATH = os.path.join(_HERE, "test_plates", "ground_truth.json")
TEST_PLATES_DIR   = os.path.join(_HERE, "test_plates")


def normalize_plate(text: str) -> str:
    return re.sub(r"[^A-Z0-9\-]", "", text.upper())


def edit_distance(a: str, b: str) -> int:
    m, n = len(a), len(b)
    dp = list(range(n + 1))
    for i in range(1, m + 1):
        prev = dp[:]
        dp[0] = i
        for j in range(1, n + 1):
            if a[i - 1] == b[j - 1]:
                dp[j] = prev[j - 1]
            else:
                dp[j] = 1 + min(prev[j], dp[j - 1], prev[j - 1])
    return dp[n]


def cer(predicted: str, ground_truth: str) -> float:
    if not ground_truth:
        return 0.0 if not predicted else 1.0
    return edit_distance(predicted, ground_truth) / len(ground_truth)


def main():
    if not os.path.exists(GROUND_TRUTH_PATH):
        print(f"ERROR: ground_truth.json not found at {GROUND_TRUTH_PATH}")
        print("Add plate images to backend/eval/test_plates/ and create ground_truth.json")
        sys.exit(1)

    with open(GROUND_TRUTH_PATH) as f:
        raw = json.load(f)

    # Support {"file.jpg": "ABC-123"} and {"file.jpg": {"text": "ABC-123", "box": [...]}}
    ground_truth = {}
    boxes = {}
    for k, v in raw.items():
        if k.startswith("_"):
            continue
        if isinstance(v, str):
            ground_truth[k] = v
        elif isinstance(v, dict) and "text" in v:
            ground_truth[k] = v["text"]
            if "box" in v:
                boxes[k] = v["box"]

    if not ground_truth:
        print("ground_truth.json has no text entries — add entries first.")
        sys.exit(1)

    print("Loading fast-plate-ocr (european-plates-mobile-vit-v2-model)...")
    recognizer = ONNXPlateRecognizer("european-plates-mobile-vit-v2-model")

    results = []
    for filename, expected_raw in ground_truth.items():
        image_path = os.path.join(TEST_PLATES_DIR, filename)
        expected = normalize_plate(expected_raw)

        if not os.path.exists(image_path):
            print(f"  WARNING: {filename} not found, skipping")
            continue

        img = Image.open(image_path).convert("RGB")

        # Crop to bounding box if available (same pipeline as the app)
        if filename in boxes:
            x1, y1, x2, y2 = boxes[filename]
            x1, y1 = max(0, x1 - 10), max(0, y1 - 10)
            x2, y2 = min(img.width, x2 + 10), min(img.height, y2 + 10)
            img = img.crop((x1, y1, x2, y2))

        img_array = np.array(img)
        predictions = recognizer.run(img_array)
        predicted = normalize_plate(predictions[0]) if predictions else ""

        exact = predicted == expected
        char_err = cer(predicted, expected)

        results.append({
            "filename": filename,
            "expected": expected,
            "predicted": predicted,
            "exact": exact,
            "cer": char_err,
        })

    if not results:
        print("No images were evaluated.")
        sys.exit(1)

    # Print table
    col = "{:<25} {:<12} {:<12} {:<7} {:<6}"
    print("\n" + "=" * 65)
    print(col.format("File", "Expected", "Got", "Match", "CER"))
    print("-" * 65)
    for r in results:
        match_str = "YES" if r["exact"] else "NO "
        print(col.format(
            r["filename"][:24],
            r["expected"][:11],
            r["predicted"][:11],
            match_str,
            f"{r['cer']:.3f}",
        ))
    print("=" * 65)

    total = len(results)
    exact_matches = sum(1 for r in results if r["exact"])
    avg_cer = sum(r["cer"] for r in results) / total

    print(f"\nResults ({total} images):")
    print(f"  Exact match accuracy : {exact_matches}/{total} = {exact_matches/total*100:.1f}%")
    print(f"  Avg character error  : {avg_cer:.3f} ({avg_cer*100:.1f}%)")


if __name__ == "__main__":
    main()
