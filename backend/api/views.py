import io
import logging
import re

import easyocr
import numpy as np
from PIL import Image
from rest_framework import viewsets, permissions, views
from rest_framework.response import Response

from django.contrib.auth import get_user_model

from .models import Plate
from .serializers import UserSerializer, PlateSerializer

logger = logging.getLogger(__name__)

User = get_user_model()

# Module-level lazy singleton — EasyOCR loads PyTorch and model weights once.
_ocr_reader = None


def _get_reader():
    global _ocr_reader
    if _ocr_reader is None:
        logger.info("[OCR] Initialising EasyOCR reader (first call)…")
        _ocr_reader = easyocr.Reader(["en"], gpu=False)
        logger.info("[OCR] EasyOCR reader ready")
    return _ocr_reader


def _normalize_plate(text: str) -> str:
    """Strip whitespace and non-alphanumeric characters except hyphens."""
    cleaned = re.sub(r"[^A-Z0-9\-]", "", text.upper())
    return cleaned


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

        img_array = np.array(img)

        try:
            reader = _get_reader()
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

        # Pick highest-confidence reading
        best = max(results, key=lambda r: r[2])
        raw_text = best[1]
        confidence = float(best[2])
        plate_text = _normalize_plate(raw_text)

        logger.info("[OCR] Detected plate: %r (raw: %r, confidence: %.2f)", plate_text, raw_text, confidence)

        plate = Plate.objects.filter(plate_number__iexact=plate_text, is_active=True).first()

        return Response({
            "plate_text": plate_text,
            "confidence": confidence,
            "registered": plate is not None,
            "owner_name": plate.owner_name if plate else "",
        })
