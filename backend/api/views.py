import logging
import re

from rest_framework import viewsets, permissions, views
from rest_framework.response import Response

from django.contrib.auth import get_user_model

from .models import Plate
from .serializers import UserSerializer, PlateSerializer

logger = logging.getLogger(__name__)

User = get_user_model()


def _normalize_plate(text: str) -> str:
    """Keep only uppercase letters and digits — no hyphens, spaces, or symbols."""
    return re.sub(r"[^A-Z0-9]", "", text.upper())


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
    """
    POST /api/check/
    Body: { "plate_text": "ABC123" }

    Detection and OCR happen in the frontend (ONNX Runtime Web).
    This endpoint only performs the database lookup.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        raw = request.data.get("plate_text", "")
        plate_text = _normalize_plate(raw)

        if not plate_text:
            return Response({"error": "No plate text provided."}, status=400)

        logger.info("[CHECK] plate_text=%r", plate_text)

        # Normalise stored plate numbers the same way before comparing
        plate = Plate.objects.filter(is_active=True).extra(
            where=["UPPER(REGEXP_REPLACE(plate_number, '[^A-Z0-9]', '', 'g')) = %s"],
            params=[plate_text],
        ).first()

        return Response({
            "plate_text": plate_text,
            "registered": plate is not None,
            "owner_name": plate.owner_name if plate else "",
        })
