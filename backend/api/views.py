from rest_framework import viewsets, permissions, views
from rest_framework.response import Response
from django.contrib.auth import get_user_model
from .models import Plate
from .serializers import UserSerializer, PlateSerializer

User = get_user_model()


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
        # Stub: AI module not built yet.
        # When AI module is ready, replace this with real EasyOCR + YOLO call.
        plate_text = "ABC-123"
        confidence = 0.91

        plate = Plate.objects.filter(plate_number__iexact=plate_text, is_active=True).first()

        return Response({
            "plate_text": plate_text,
            "confidence": confidence,
            "registered": plate is not None,
            "owner_name": plate.owner_name if plate else "",
        })
