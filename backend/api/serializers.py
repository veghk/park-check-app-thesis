from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Plate

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "email", "badge_number"]


class PlateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Plate
        fields = ["id", "plate_number", "owner_name", "notes", "is_active", "created_at", "updated_at"]
        read_only_fields = ["created_at", "updated_at"]
