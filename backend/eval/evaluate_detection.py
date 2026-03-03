"""
ONNX Detection Accuracy Evaluation
====================================
Evaluates the plate-segmentor.onnx model on test images with
ground-truth bounding boxes. Reports detection rate and mean IoU.

Setup:
  1. Add plate photos to  backend/eval/test_plates/
  2. Fill backend/eval/test_plates/ground_truth.json with bounding boxes (see format below)
  3. Run:  python backend/eval/evaluate_detection.py

ground_truth.json format (pixel coordinates, x1 y1 x2 y2):
{
  "plate1.jpg": {"box": [120, 45, 380, 110]},
  "plate2.jpg": {"box": [50, 200, 420, 270]}
}

Dependencies:  pip install onnxruntime Pillow numpy
"""

import json
import os
import sys

import numpy as np
import onnxruntime as ort
from PIL import Image

_HERE         = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.abspath(os.path.join(_HERE, "..", ".."))

GROUND_TRUTH_PATH = os.path.join(_HERE, "test_plates", "ground_truth.json")
TEST_PLATES_DIR   = os.path.join(_HERE, "test_plates")
MODEL_PATH        = os.path.join(_PROJECT_ROOT, "frontend", "public", "models", "plate-segmentor.onnx")

CONF_THRESHOLD = 0.4
IOU_THRESHOLD  = 0.5
INPUT_SIZE     = 416


def preprocess(image_path: str):
    img = Image.open(image_path).convert("RGB")
    orig_w, orig_h = img.size
    resized = img.resize((INPUT_SIZE, INPUT_SIZE))
    arr = np.array(resized, dtype=np.float32) / 255.0
    tensor = arr.transpose(2, 0, 1)[np.newaxis, :]  # [1, 3, 416, 416]
    return tensor, orig_w, orig_h


def iou(a, b):
    ix1 = max(a[0], b[0])
    iy1 = max(a[1], b[1])
    ix2 = min(a[2], b[2])
    iy2 = min(a[3], b[3])
    inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
    area_a = (a[2] - a[0]) * (a[3] - a[1])
    area_b = (b[2] - b[0]) * (b[3] - b[1])
    return inter / (area_a + area_b - inter + 1e-6)


def run_detection(session, tensor, orig_w, orig_h):
    outputs = session.run(None, {session.get_inputs()[0].name: tensor})
    scale_x = orig_w / INPUT_SIZE
    scale_y = orig_h / INPUT_SIZE

    if len(outputs) == 1:
        # Bbox detection model: [1, 5, numDets]
        pred = outputs[0][0]
    else:
        # Segmentation model: [1, 37, numDets] — use bbox columns only
        pred = outputs[0][0]

    confs = pred[4, :]
    best_idx = int(confs.argmax())
    conf = float(confs[best_idx])
    if conf < CONF_THRESHOLD:
        return None, 0.0

    cx, cy, w, h = pred[0, best_idx], pred[1, best_idx], pred[2, best_idx], pred[3, best_idx]
    x1 = (cx - w / 2) * scale_x
    y1 = (cy - h / 2) * scale_y
    x2 = (cx + w / 2) * scale_x
    y2 = (cy + h / 2) * scale_y
    return [x1, y1, x2, y2], conf


def main():
    if not os.path.exists(GROUND_TRUTH_PATH):
        print(f"ERROR: ground_truth.json not found at {GROUND_TRUTH_PATH}")
        sys.exit(1)

    with open(GROUND_TRUTH_PATH) as f:
        ground_truth = json.load(f)

    # Skip comment keys, filter entries that have a "box" key
    detection_gt = {
        k: v for k, v in ground_truth.items()
        if not k.startswith("_") and isinstance(v, dict) and "box" in v
    }
    if not detection_gt:
        print("No bounding box entries found in ground_truth.json.")
        print('Add entries like: "plate1.jpg": {"box": [x1, y1, x2, y2]}')
        sys.exit(1)

    if not os.path.exists(MODEL_PATH):
        print(f"ERROR: model not found at {MODEL_PATH}")
        sys.exit(1)

    print(f"Loading model from {MODEL_PATH}...")
    session = ort.InferenceSession(MODEL_PATH, providers=["CPUExecutionProvider"])

    results = []
    for filename, entry in detection_gt.items():
        image_path = os.path.join(TEST_PLATES_DIR, filename)
        gt_box = entry["box"]

        if not os.path.exists(image_path):
            print(f"  WARNING: {filename} not found, skipping")
            continue

        tensor, orig_w, orig_h = preprocess(image_path)
        pred_box, confidence = run_detection(session, tensor, orig_w, orig_h)

        if pred_box is not None:
            box_iou = iou(pred_box, gt_box)
            detected = box_iou >= IOU_THRESHOLD
        else:
            box_iou = 0.0
            detected = False

        results.append({
            "filename": filename,
            "detected": detected,
            "iou": box_iou,
            "confidence": confidence,
        })

    if not results:
        print("No images were evaluated.")
        sys.exit(1)

    # Print table
    col = "{:<25} {:<10} {:<8} {:<10}"
    print("\n" + "=" * 60)
    print(col.format("File", "Detected", "IoU", "Confidence"))
    print("-" * 60)
    for r in results:
        print(col.format(
            r["filename"][:24],
            "YES" if r["detected"] else "NO",
            f"{r['iou']:.3f}",
            f"{r['confidence']:.3f}",
        ))
    print("=" * 60)

    total = len(results)
    detected_count = sum(1 for r in results if r["detected"])
    mean_iou = sum(r["iou"] for r in results) / total

    print(f"\nResults ({total} images, IoU threshold={IOU_THRESHOLD}):")
    print(f"  Detection rate : {detected_count}/{total} = {detected_count/total*100:.1f}%")
    print(f"  Mean IoU       : {mean_iou:.3f}")


if __name__ == "__main__":
    main()
