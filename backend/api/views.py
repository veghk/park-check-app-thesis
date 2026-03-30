from rest_framework import viewsets, permissions, views, generics
from rest_framework.response import Response

from django.contrib.auth import get_user_model

from .models import Plate, CheckLog, Violation
from .serializers import UserSerializer, PlateSerializer, CheckLogSerializer, ViolationSerializer

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
        plate_text = request.data.get("plate_text", "")

        if not plate_text:
            return Response({"error": "No plate text provided."}, status=400)

        plate = Plate.objects.filter(plate_number=plate_text, is_active=True).first()

        log = CheckLog.objects.create(
            officer=request.user,
            plate_text=plate_text,
            plate=plate,
            registered=plate is not None,
            latitude=request.data.get("latitude"),
            longitude=request.data.get("longitude"),
        )

        return Response({
            "plate_text": plate_text,
            "registered": plate is not None,
            "owner_name": plate.owner_name if plate else "",
            "check_log_id": log.id,
        })


class CheckLogListView(generics.ListAPIView):
    serializer_class = CheckLogSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return CheckLog.objects.filter(officer=self.request.user)


class ViolationCreateView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        check_log_id = request.data.get("check_log_id")

        if not check_log_id:
            return Response({"error": "check_log_id is required."}, status=400)

        try:
            log = CheckLog.objects.get(id=check_log_id, officer=request.user)
        except CheckLog.DoesNotExist:
            return Response({"error": "Check log not found."}, status=404)

        if hasattr(log, "violation"):
            return Response({"error": "Violation already issued for this check."}, status=409)

        violation = Violation.objects.create(
            check_log=log,
            officer=request.user,
            plate_text=log.plate_text,
            latitude=log.latitude,
            longitude=log.longitude,
            notes=request.data.get("notes", ""),
        )

        return Response(ViolationSerializer(violation).data, status=201)
