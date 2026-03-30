import re

from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Company, Plate, CheckLog, Violation

User = get_user_model()


class CompanySerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        fields = ["id", "name", "created_at"]
        read_only_fields = ["created_at"]


class UserSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source="company.name", read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "email", "badge_number", "company", "company_name"]


class PlateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Plate
        fields = ["id", "plate_number", "owner_name", "notes", "is_active", "created_at", "updated_at"]
        read_only_fields = ["created_at", "updated_at"]

    def validate_plate_number(self, value):
        return re.sub(r"[^A-Z0-9]", "", value.upper())


class CheckLogSerializer(serializers.ModelSerializer):
    has_violation = serializers.SerializerMethodField()

    class Meta:
        model = CheckLog
        fields = [
            "id", "plate_text", "registered", "latitude", "longitude",
            "checked_at", "has_violation",
        ]

    def get_has_violation(self, obj):
        return hasattr(obj, "violation")


class ViolationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Violation
        fields = ["id", "check_log", "plate_text", "latitude", "longitude", "notes", "issued_at"]
        read_only_fields = ["plate_text", "latitude", "longitude", "issued_at"]
