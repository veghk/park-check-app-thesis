from datetime import date

from rest_framework import viewsets, permissions, views, generics
from rest_framework.response import Response

from django.contrib.auth import get_user_model

from .models import Plate, CheckLog, Violation, Enforcer
from .serializers import (
    PlateSerializer, CheckLogSerializer,
    ViolationSerializer, EnforcerSerializer, EnforcerCreateSerializer,
)

User = get_user_model()


class IsCompanyAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and hasattr(request.user, "company_admin_profile")
        )


class MeView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        data = {"id": user.pk, "username": user.username}

        if hasattr(user, "company_admin_profile"):
            profile = user.company_admin_profile
            data.update({
                "role": "company_admin",
                "company": profile.company_id,
                "company_name": profile.company.name,
                "badge_number": None,
            })
        elif hasattr(user, "enforcer_profile"):
            profile = user.enforcer_profile
            data.update({
                "role": "enforcer",
                "company": profile.company_id,
                "company_name": profile.company.name,
                "badge_number": profile.badge_number,
            })
        else:
            data.update({
                "role": "developer",
                "company": None,
                "company_name": None,
                "badge_number": None,
            })

        return Response(data)


class PlateViewSet(viewsets.ModelViewSet):
    serializer_class = PlateSerializer
    permission_classes = [IsCompanyAdmin]

    def get_queryset(self):
        company = self.request.user.company_admin_profile.company
        return Plate.objects.filter(company=company).order_by("-created_at")

    def perform_create(self, serializer):
        company = self.request.user.company_admin_profile.company
        serializer.save(company=company)


class EnforcerViewSet(viewsets.ModelViewSet):
    permission_classes = [IsCompanyAdmin]
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_queryset(self):
        company = self.request.user.company_admin_profile.company
        return Enforcer.objects.filter(company=company).select_related("user")

    def get_serializer_class(self):
        if self.action == "create":
            return EnforcerCreateSerializer
        return EnforcerSerializer

    def perform_create(self, serializer):
        company = self.request.user.company_admin_profile.company
        serializer.save(company=company)

    def perform_destroy(self, instance):
        instance.user.delete()


def _is_plate_valid_today(plate):
    if not plate.is_active:
        return False
    today = date.today()
    if plate.valid_from and today < plate.valid_from:
        return False
    if plate.valid_until and today > plate.valid_until:
        return False
    return True


class CheckView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        plate_text = request.data.get("plate_text", "")

        if not plate_text:
            return Response({"error": "No plate text provided."}, status=400)

        company = None
        if hasattr(request.user, "enforcer_profile"):
            company = request.user.enforcer_profile.company
        elif hasattr(request.user, "company_admin_profile"):
            company = request.user.company_admin_profile.company

        candidate = None
        if company:
            candidate = Plate.objects.filter(
                company=company, plate_number=plate_text
            ).first()
        else:
            candidate = Plate.objects.filter(plate_number=plate_text).first()

        is_valid = candidate is not None and _is_plate_valid_today(candidate)

        log = CheckLog.objects.create(
            enforcer=request.user,
            plate_text=plate_text,
            plate=candidate if is_valid else None,
            registered=is_valid,
            latitude=request.data.get("latitude"),
            longitude=request.data.get("longitude"),
        )

        return Response({
            "plate_text": plate_text,
            "registered": is_valid,
            "owner_name": candidate.owner_name if is_valid else "",
            "check_log_id": log.id,
        })


class CheckLogListView(generics.ListAPIView):
    serializer_class = CheckLogSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return CheckLog.objects.filter(enforcer=self.request.user)


class ViolationCreateView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        check_log_id = request.data.get("check_log_id")

        if not check_log_id:
            return Response({"error": "check_log_id is required."}, status=400)

        try:
            log = CheckLog.objects.get(id=check_log_id, enforcer=request.user)
        except CheckLog.DoesNotExist:
            return Response({"error": "Check log not found."}, status=404)

        if hasattr(log, "violation"):
            return Response({"error": "Violation already issued for this check."}, status=409)

        violation = Violation.objects.create(
            check_log=log,
            notes=request.data.get("notes", ""),
        )

        return Response(ViolationSerializer(violation).data, status=201)
