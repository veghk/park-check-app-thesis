import io
import logging
import os
import re

import cv2
import easyocr
import numpy as np
import onnxruntime as ort
from PIL import Image
from rest_framework import viewsets, permissions, views
from rest_framework.response import Response

from django.contrib.auth import get_user_model

from .models import Plate
from .serializers import UserSerializer, PlateSerializer

logger = logging.getLogger(__name__)

User = get_user_model()

# ---------------------------------------------------------------------------
# Lazy singletons
# ---------------------------------------------------------------------------

_ocr_reader = None
_seg_session = None

SEG_MODEL_PATH = os.path.join(os.path.dirname(__file__), '..', 'models', 'plate-segmentor.onnx')
SEG_CONF_THRESHOLD = 0.4
SEG_INPUT_SIZE = 640
# Standard EU plate aspect ratio (520 × 110 mm) scaled for OCR
PLATE_W, PLATE_H = 520, 110


def _get_reader():
    global _ocr_reader
    if _ocr_reader is None:
        logger.info("[OCR] Initialising EasyOCR reader (first call)…")
        _ocr_reader = easyocr.Reader(["en"], gpu=False)
        logger.info("[OCR] EasyOCR reader ready")
    return _ocr_reader


def _get_seg_session():
    global _seg_session
    if _seg_session is None:
        model_path = os.path.normpath(SEG_MODEL_PATH)
        if os.path.exists(model_path):
            logger.info("[SEG] Loading segmentation model from %s", model_path)
            _seg_session = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
            logger.info("[SEG] Segmentation model ready")
        else:
            logger.warning("[SEG] Model not found at %s — skipping warp", model_path)
    return _seg_session


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _normalize_plate(text: str) -> str:
    """Strip whitespace and non-alphanumeric characters except hyphens."""
    return re.sub(r"[^A-Z0-9\-]", "", text.upper())


def _order_corners(pts: np.ndarray) -> np.ndarray:
    """Sort 4 points into TL, TR, BR, BL order."""
    pts = pts[np.argsort(pts[:, 0])]   # sort by x
    left  = pts[:2][np.argsort(pts[:2, 1])]   # left two, sorted by y → TL, BL
    right = pts[2:][np.argsort(pts[2:, 1])]   # right two, sorted by y → TR, BR
    return np.array([left[0], right[0], right[1], left[1]], dtype=np.float32)


def _detect_and_warp(img: Image.Image):
    """
    Run the segmentation model on *img*.

    Returns (warped_pil_image, polygon_corners_px) when a plate is found,
    or (None, None) when no plate is detected / model is unavailable.

    Pipeline:
      1. Resize to 640×640, run ONNX inference
      2. Reconstruct instance mask from prototype masks + coefficients
      3. Find contour → min-area rectangle → 4 corners
      4. Perspective-warp the original image to a flat PLATE_W × PLATE_H crop
    """
    session = _get_seg_session()
    if session is None:
        return None, None

    orig_w, orig_h = img.size

    # --- preprocess ---
    arr = np.array(img.resize((SEG_INPUT_SIZE, SEG_INPUT_SIZE)), dtype=np.float32) / 255.0
    tensor = arr.transpose(2, 0, 1)[np.newaxis, :]  # [1, 3, 640, 640]

    # --- inference ---
    # output0: [1, 37, 8400]  (cx, cy, w, h, conf, 32 mask coefficients)
    # output1: [1, 32, 160, 160]  prototype masks
    input_name = session.get_inputs()[0].name
    output0, output1 = session.run(None, {input_name: tensor})

    pred   = output0[0]   # [37, 8400]
    protos = output1[0]   # [32, 160, 160]

    # --- find best detection ---
    confs    = pred[4, :]
    best_idx = int(confs.argmax())
    conf     = float(confs[best_idx])
    if conf < SEG_CONF_THRESHOLD:
        logger.debug("[SEG] No plate detected (best conf=%.3f)", conf)
        return None, None

    cx, cy, w, h = pred[0, best_idx], pred[1, best_idx], pred[2, best_idx], pred[3, best_idx]
    bx1, by1 = cx - w / 2, cy - h / 2
    bx2, by2 = cx + w / 2, cy + h / 2

    # --- reconstruct mask ---
    mask_coeffs = pred[5:37, best_idx]           # [32]
    proto_flat  = protos.reshape(32, -1)          # [32, 25600]
    mask_flat   = mask_coeffs @ proto_flat        # [25600]
    mask        = 1.0 / (1.0 + np.exp(-mask_flat))  # sigmoid
    mask        = mask.reshape(160, 160)

    # Crop mask to predicted box region (640→160 = ÷4)
    mx1, my1 = max(0, int(bx1 / 4)), max(0, int(by1 / 4))
    mx2, my2 = min(160, int(bx2 / 4)), min(160, int(by2 / 4))
    full_mask = np.zeros((160, 160), dtype=np.float32)
    if mx2 > mx1 and my2 > my1:
        full_mask[my1:my2, mx1:mx2] = mask[my1:my2, mx1:mx2]

    binary_mask = (full_mask > 0.5).astype(np.uint8) * 255

    # Scale mask to original image size
    mask_full = cv2.resize(binary_mask, (orig_w, orig_h), interpolation=cv2.INTER_NEAREST)

    # --- find corners ---
    contours, _ = cv2.findContours(mask_full, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if contours:
        contour  = max(contours, key=cv2.contourArea)
        rect     = cv2.minAreaRect(contour)
        corners  = cv2.boxPoints(rect).astype(np.float32)
    else:
        # Fallback: use scaled bounding box corners
        sx, sy  = orig_w / SEG_INPUT_SIZE, orig_h / SEG_INPUT_SIZE
        corners = np.array([
            [bx1 * sx, by1 * sy], [bx2 * sx, by1 * sy],
            [bx2 * sx, by2 * sy], [bx1 * sx, by2 * sy],
        ], dtype=np.float32)

    corners = _order_corners(corners)  # TL, TR, BR, BL

    # --- perspective warp ---
    dst = np.array([
        [0,          0         ],
        [PLATE_W - 1, 0        ],
        [PLATE_W - 1, PLATE_H - 1],
        [0,          PLATE_H - 1],
    ], dtype=np.float32)

    M      = cv2.getPerspectiveTransform(corners, dst)
    warped = cv2.warpPerspective(np.array(img), M, (PLATE_W, PLATE_H))

    logger.debug("[SEG] Plate warped, conf=%.3f, corners=%s", conf, corners.tolist())
    return Image.fromarray(warped), corners


# ---------------------------------------------------------------------------
# ViewSets / Views
# ---------------------------------------------------------------------------

class UserViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAdminUser]


class PlateViewSet(viewsets.ModelViewSet):
    queryset = Plate.objects.all().order_by("-created_at")
    serializer_class = PlateSerializer
    permission_classes = [permissions.IsAuthenticated]


class CheckView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        image_file = request.FILES.get("image")
        if not image_file:
            return Response({"error": "No image provided."}, status=400)

        try:
            img = Image.open(io.BytesIO(image_file.read())).convert("RGB")
        except Exception as exc:
            logger.warning("[OCR] Could not open image: %s", exc)
            return Response({"error": "Invalid image."}, status=400)

        # Try detect → warp → OCR; fall back to full-image OCR if no model
        warped, corners = _detect_and_warp(img)
        ocr_source = warped if warped is not None else img
        img_array  = np.array(ocr_source)

        try:
            reader  = _get_reader()
            results = reader.readtext(img_array, detail=1)
        except Exception as exc:
            logger.exception("[OCR] EasyOCR failed: %s", exc)
            return Response({"error": "OCR processing failed."}, status=500)

        logger.debug("[OCR] Raw results: %s", results)

        if not results:
            return Response({
                "plate_text": "",
                "confidence": 0.0,
                "registered": False,
                "owner_name": "",
            })

        best       = max(results, key=lambda r: r[2])
        raw_text   = best[1]
        confidence = float(best[2])
        plate_text = _normalize_plate(raw_text)

        logger.info(
            "[OCR] Detected plate: %r (raw: %r, conf: %.2f, warped: %s)",
            plate_text, raw_text, confidence, warped is not None,
        )

        plate = Plate.objects.filter(plate_number__iexact=plate_text, is_active=True).first()

        return Response({
            "plate_text": plate_text,
            "confidence": confidence,
            "registered": plate is not None,
            "owner_name": plate.owner_name if plate else "",
        })
