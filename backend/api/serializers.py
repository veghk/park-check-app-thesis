import re

from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Company, Plate, CheckLog, Violation, Enforcer

User = get_user_model()


class CompanySerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        fields = ["id", "name", "created_at"]
        read_only_fields = ["created_at"]


class EnforcerSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source="user.id")
    username = serializers.CharField(source="user.username")

    class Meta:
        model = Enforcer
        fields = ["id", "username", "badge_number"]


class EnforcerCreateSerializer(serializers.Serializer):
    username = serializers.CharField()
    badge_number = serializers.CharField(required=False, allow_blank=True, default="")
    password = serializers.CharField(write_only=True)

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("Username already taken.")
        return value

    def create(self, validated_data):
        company = validated_data["company"]
        password = validated_data["password"]
        badge = validated_data.get("badge_number") or None

        user = User(username=validated_data["username"])
        user.set_password(password)
        user.save()

        return Enforcer.objects.create(user=user, company=company, badge_number=badge)

    def to_representation(self, instance):
        return EnforcerSerializer(instance).data


class PlateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Plate
        fields = [
            "id", "company", "plate_number", "owner_name", "notes",
            "is_active", "valid_from", "valid_until", "created_at", "updated_at",
        ]
        read_only_fields = ["company", "created_at", "updated_at"]

    def validate_plate_number(self, value):
        return re.sub(r"[^A-Z0-9]", "", value.upper())

    def validate(self, attrs):
        request = self.context.get("request")
        company = None
        if request and hasattr(request.user, "company_admin_profile"):
            company = request.user.company_admin_profile.company
        plate_number = attrs.get("plate_number")
        if company and plate_number:
            qs = Plate.objects.filter(company=company, plate_number=plate_number)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError({"plate_number": "This plate number already exists for your company."})
        return attrs


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
