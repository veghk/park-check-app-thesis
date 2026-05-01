from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User, Plate, Company, CheckLog, Violation, CompanyAdmin, Enforcer


@admin.register(Company)
class CompanyModelAdmin(admin.ModelAdmin):
    list_display = ["name", "created_at"]
    search_fields = ["name"]


@admin.register(CompanyAdmin)
class CompanyAdminAdmin(admin.ModelAdmin):
    list_display = ["user", "company"]
    list_filter = ["company"]
    search_fields = ["user__username"]


@admin.register(Enforcer)
class EnforcerAdmin(admin.ModelAdmin):
    list_display = ["user", "badge_number", "company"]
    list_filter = ["company"]
    search_fields = ["user__username", "badge_number"]


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = ["username", "email", "is_staff", "is_superuser"]


@admin.register(CheckLog)
class CheckLogAdmin(admin.ModelAdmin):
    list_display = ["plate_text", "registered", "enforcer", "checked_at", "latitude", "longitude"]
    list_filter = ["registered"]
    search_fields = ["plate_text", "enforcer__username"]
    readonly_fields = ["enforcer", "plate_text", "plate", "registered", "latitude", "longitude", "checked_at"]


@admin.register(Violation)
class ViolationAdmin(admin.ModelAdmin):
    list_display = ["check_log", "issued_at"]
    search_fields = ["check_log__plate_text", "check_log__enforcer__username"]
    readonly_fields = ["check_log", "issued_at"]


@admin.register(Plate)
class PlateAdmin(admin.ModelAdmin):
    list_display = ["plate_number", "owner_name", "is_active", "created_at"]
    search_fields = ["plate_number", "owner_name"]
    list_filter = ["is_active"]
