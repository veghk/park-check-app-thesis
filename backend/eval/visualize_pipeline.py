"""
Picks the 15 best-detected test images and saves visualisations to eval/test_plates_results/.

Output folders:
  test/       original images
  seg/        segmentation mask overlaid on the full image
  detection/  predicted polygon drawn on the full image
  warp/       perspective-corrected plate crop
  ocr/        warp with OCR result overlaid
  pipeline/   everything together: GT box, polygon, OCR label

"Best" = highest IoU x confidence score across all test images.

Run from project root:
  docker-compose run --rm \\
    -v $(pwd)/frontend/public/models:/frontend/public/models \\
    web python3 /app/eval/visualize_pipeline.py

Or locally:
  pip install onnxruntime opencv-python easyocr Pillow numpy
  python backend/eval/visualize_pipeline.py
"""

import json
import os
import re
import shutil

import cv2
import easyocr
import numpy as np
import onnxruntime as ort
from PIL import Image, ImageDraw, ImageFont

_HERE         = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.abspath(os.path.join(_HERE, "..", ".."))

GROUND_TRUTH_PATH = os.path.join(_HERE, "test_plates", "ground_truth.json")
TEST_PLATES_DIR   = os.path.join(_HERE, "test_plates")
OUT_ROOT          = os.path.join(_HERE, "test_plates_results")
MODEL_PATH        = os.path.join(_PROJECT_ROOT, "frontend", "public", "models", "plate-segmentor.onnx")

CONF_THRESHOLD  = 0.4
IOU_THRESHOLD   = 0.5
INPUT_SIZE      = 416
MASK_DILATE_PX  = 10  # expand mask after upscale to recover pixels lost by proto downsampling
TOP_N          = 15
PLATE_W        = 520
PLATE_H        = 110
FONT_SIZE      = 28

GT_COLOR   = (34, 197, 94)
OK_COLOR   = (59, 130, 246)
MISS_COLOR = (239, 68, 68)


def get_font(size=FONT_SIZE):
    for path in [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
    ]:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def normalize(text):
    return re.sub(r"[^A-Z0-9\-]", "", text.upper())


def preprocess(img):
    w, h = img.size
    arr = np.array(img.resize((INPUT_SIZE, INPUT_SIZE)), dtype=np.float32) / 255.0
    return arr.transpose(2, 0, 1)[np.newaxis, :], w, h


def iou(a, b):
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
    return inter / ((a[2]-a[0])*(a[3]-a[1]) + (b[2]-b[0])*(b[3]-b[1]) - inter + 1e-6)


def bbox_from_corners(corners):
    """Returns [x1, y1, x2, y2] bounding box around a polygon."""
    xs, ys = corners[:, 0], corners[:, 1]
    return [xs.min(), ys.min(), xs.max(), ys.max()]


def order_corners(pts):
    """Sorts 4 corners into TL, TR, BR, BL order for perspective transform."""
    pts = pts[np.argsort(pts[:, 0])]
    left  = pts[:2][np.argsort(pts[:2, 1])]
    right = pts[2:][np.argsort(pts[2:, 1])]
    return np.array([left[0], right[0], right[1], left[1]], dtype=np.float32)


def detect_and_warp(session, img):
    """
    Runs the model and returns (warped_plate, corners, confidence, mask_full).
    mask_full is a uint8 numpy array (h x w, values 0/255) for seg models, None for bbox.
    Returns (None, None, 0, None) if nothing was detected.
    """
    tensor, orig_w, orig_h = preprocess(img)
    outputs = session.run(None, {session.get_inputs()[0].name: tensor})

    num_outputs = len(outputs)
    mask_full = None

    if num_outputs == 1:
        # DETECTION MODEL: output [1, 5, 8400]
        pred = outputs[0][0]   # [5, 8400]
        confs = pred[4, :]
        best_idx = int(confs.argmax())
        conf = float(confs[best_idx])
        if conf < CONF_THRESHOLD:
            return None, None, 0.0, None

        cx, cy, w, h = pred[0, best_idx], pred[1, best_idx], pred[2, best_idx], pred[3, best_idx]
        sx, sy = orig_w / INPUT_SIZE, orig_h / INPUT_SIZE
        x1, y1 = (cx - w/2) * sx, (cy - h/2) * sy
        x2, y2 = (cx + w/2) * sx, (cy + h/2) * sy
        corners = np.array([[x1,y1],[x2,y1],[x2,y2],[x1,y2]], dtype=np.float32)

    else:
        # SEGMENTATION MODEL: output0 [1,37,numDets] + output1 [1,32,protoH,protoW]
        pred   = outputs[0][0]   # [37, numDets]
        protos = outputs[1][0]   # [32, protoH, protoW]
        _, protoH, protoW = protos.shape

        confs = pred[4, :]
        best_idx = int(confs.argmax())
        conf = float(confs[best_idx])
        if conf < CONF_THRESHOLD:
            return None, None, 0.0, None

        cx, cy, w, h = pred[0, best_idx], pred[1, best_idx], pred[2, best_idx], pred[3, best_idx]
        bx1, by1 = cx - w/2, cy - h/2
        bx2, by2 = cx + w/2, cy + h/2

        mask_coeffs = pred[5:37, best_idx]
        mask_flat   = mask_coeffs @ protos.reshape(32, -1)
        mask        = (1.0 / (1.0 + np.exp(-mask_flat))).reshape(protoH, protoW)

        mx1 = max(0, int(bx1 * protoW / INPUT_SIZE))
        my1 = max(0, int(by1 * protoH / INPUT_SIZE))
        mx2 = min(protoW, int(bx2 * protoW / INPUT_SIZE))
        my2 = min(protoH, int(by2 * protoH / INPUT_SIZE))
        full_mask = np.zeros((protoH, protoW), dtype=np.float32)
        if mx2 > mx1 and my2 > my1:
            full_mask[my1:my2, mx1:mx2] = mask[my1:my2, mx1:mx2]

        binary    = (full_mask > 0.5).astype(np.uint8) * 255
        mask_full = cv2.resize(binary, (orig_w, orig_h), interpolation=cv2.INTER_NEAREST)
        if MASK_DILATE_PX > 0:
            k         = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (MASK_DILATE_PX*2+1, MASK_DILATE_PX*2+1))
            mask_full = cv2.dilate(mask_full, k)

        cnts, _ = cv2.findContours(mask_full, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if cnts:
            cnt  = max(cnts, key=cv2.contourArea)
            x, y, w, h = cv2.boundingRect(cnt)
            corners = np.array([
                [x,   y  ], [x+w, y  ],
                [x+w, y+h], [x,   y+h],
            ], dtype=np.float32)
        else:
            sx, sy  = orig_w / INPUT_SIZE, orig_h / INPUT_SIZE
            corners = np.array([
                [bx1*sx, by1*sy], [bx2*sx, by1*sy],
                [bx2*sx, by2*sy], [bx1*sx, by2*sy],
            ], dtype=np.float32)

    corners = order_corners(corners)

    dst = np.array([
        [0, 0], [PLATE_W-1, 0], [PLATE_W-1, PLATE_H-1], [0, PLATE_H-1],
    ], dtype=np.float32)
    M      = cv2.getPerspectiveTransform(corners, dst)
    warped = cv2.warpPerspective(np.array(img), M, (PLATE_W, PLATE_H))

    return Image.fromarray(warped), corners, conf, mask_full


def run_ocr(reader, warp_img):
    results = reader.readtext(np.array(warp_img), detail=1)
    if not results:
        return "", 0.0
    best = max(results, key=lambda r: r[2])
    return normalize(best[1]), float(best[2])


def draw_label(draw, x, y, text, color, font, above=True):
    bb  = font.getbbox(text)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    pad = 6
    ry  = (y - th - pad*2 - 2) if above else (y + 2)
    draw.rectangle([x, ry, x + tw + pad*2, ry + th + pad*2], fill=color)
    draw.text((x + pad, ry + pad), text, fill="white", font=font)


def draw_polygon(draw, corners, color, width=4):
    pts = [(int(x), int(y)) for x, y in corners]
    for i in range(len(pts)):
        draw.line([pts[i], pts[(i+1) % len(pts)]], fill=color, width=width)


def draw_mask_overlay(img, mask_full, corners, color):
    """Returns a copy of img with a semi-transparent mask overlay and polygon outline."""
    base = img.copy().convert("RGBA")
    ov   = np.zeros((img.height, img.width, 4), dtype=np.uint8)
    ov[mask_full > 128, :] = [color[0], color[1], color[2], 140]
    seg_img  = Image.alpha_composite(base, Image.fromarray(ov, "RGBA")).convert("RGB")
    seg_draw = ImageDraw.Draw(seg_img)
    draw_polygon(seg_draw, corners, color, width=3)
    return seg_img


def main():
    dirs = {k: os.path.join(OUT_ROOT, k) for k in ("test", "seg", "detection", "warp", "ocr", "pipeline")}
    for d in dirs.values():
        os.makedirs(d, exist_ok=True)

    with open(GROUND_TRUTH_PATH) as f:
        gt = json.load(f)

    detection_gt = {k: v for k, v in gt.items()
                    if not k.startswith("_") and isinstance(v, dict) and "box" in v}

    print(f"Loading model from {MODEL_PATH}...")
    session = ort.InferenceSession(MODEL_PATH, providers=["CPUExecutionProvider"])

    print("Loading EasyOCR...")
    reader = easyocr.Reader(["en"], gpu=False)
    font   = get_font(FONT_SIZE)

    # Phase 1 — score all images
    print(f"\nScoring all {len(detection_gt)} images...")
    scored = []
    for filename, entry in detection_gt.items():
        path = os.path.join(TEST_PLATES_DIR, filename)
        if not os.path.exists(path):
            continue
        gt_box = entry["box"]
        img    = Image.open(path).convert("RGB")
        warped, corners, det_conf, _ = detect_and_warp(session, img)
        if corners is None:
            scored.append((0.0, filename, entry, None, 0.0, 0.0))
            continue
        pred_bbox = bbox_from_corners(corners)
        box_iou   = iou(pred_bbox, gt_box)
        scored.append((box_iou * det_conf, filename, entry, corners, det_conf, box_iou))

    scored.sort(key=lambda x: x[0], reverse=True)
    selected = scored[:TOP_N]
    print(f"Selected top {TOP_N} images (by IoU x confidence):\n")

    # Phase 2 — generate outputs
    ok = miss = 0
    for score, filename, entry, corners, det_conf, box_iou in selected:
        src_path = os.path.join(TEST_PLATES_DIR, filename)
        gt_box   = entry["box"]
        img      = Image.open(src_path).convert("RGB")

        # 1. test/ — original
        shutil.copy(src_path, os.path.join(dirs["test"], filename))

        if corners is None:
            miss += 1
            print(f"  {filename[:36]:36s}  NO DETECTION")
            continue

        color              = OK_COLOR if box_iou >= IOU_THRESHOLD else MISS_COLOR
        warped, _, _, mask = detect_and_warp(session, img)  # re-run for warp + mask

        # 2. seg/ — mask overlay on full image
        if mask is not None:
            seg_img = draw_mask_overlay(img, mask, corners, color)
            seg_img.save(os.path.join(dirs["seg"], filename), quality=92)

        # 4. detection/ — polygon on full image
        det_img  = img.copy()
        det_draw = ImageDraw.Draw(det_img)
        draw_polygon(det_draw, corners, color)
        draw_label(det_draw, int(corners[0][0]), int(corners[0][1]),
                   f"{det_conf:.0%}", color, font, above=True)
        det_img.save(os.path.join(dirs["detection"], filename), quality=92)

        # 5. warp/ — flat perspective-corrected plate
        warped.save(os.path.join(dirs["warp"], filename), quality=92)

        # 6. ocr/ — warp with OCR text overlaid
        ocr_text, ocr_conf = run_ocr(reader, warped)
        ocr_img  = warped.copy()
        ocr_draw = ImageDraw.Draw(ocr_img)
        label    = f"{ocr_text}  {ocr_conf:.0%}" if ocr_text else "no text"
        draw_label(ocr_draw, 4, ocr_img.height, label,
                   OK_COLOR if ocr_text else MISS_COLOR, font, above=True)
        ocr_img.save(os.path.join(dirs["ocr"], filename), quality=92)

        # 7. pipeline/ — full image with GT box + polygon + OCR label
        pip_img  = img.copy()
        pip_draw = ImageDraw.Draw(pip_img)
        gx1, gy1, gx2, gy2 = [int(v) for v in gt_box]
        pip_draw.rectangle([gx1, gy1, gx2, gy2], outline=GT_COLOR, width=3)
        draw_label(pip_draw, gx1, gy1, "GT", GT_COLOR, font, above=True)
        draw_polygon(pip_draw, corners, color)
        ocr_label = f"{ocr_text}  {ocr_conf:.0%}  IoU {box_iou:.2f}" if ocr_text else f"IoU {box_iou:.2f}"
        draw_label(pip_draw, int(corners[2][0]), int(corners[2][1]),
                   ocr_label, color, font, above=False)
        pip_img.save(os.path.join(dirs["pipeline"], filename), quality=92)

        if box_iou >= IOU_THRESHOLD:
            ok += 1
        else:
            miss += 1
        print(f"  {filename[:36]:36s}  {'OK  ' if box_iou >= IOU_THRESHOLD else 'MISS'}  "
              f"ocr={ocr_text or '-'}  IoU={box_iou:.2f}")

    total = ok + miss
    print(f"\nSaved to {OUT_ROOT}/")
    print(f"Detection (top {TOP_N}): {ok}/{total} = {ok/total*100:.1f}%")
    print(f"Folders: test  seg  detection  warp  ocr  pipeline")
    print(f"Legend:  GREEN=ground truth  BLUE=correct  RED=wrong/missed")


if __name__ == "__main__":
    main()
