from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User, Plate


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (
        ("Park Check", {"fields": ("badge_number",)}),
    )


@admin.register(Plate)
class PlateAdmin(admin.ModelAdmin):
    list_display = ["plate_number", "owner_name", "is_active", "created_at"]
    search_fields = ["plate_number", "owner_name"]
    list_filter = ["is_active"]
