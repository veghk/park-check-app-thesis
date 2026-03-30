import json
import os

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.http import FileResponse, Http404
from django.shortcuts import render
from django.urls import path

from .models import User, Plate, TestResult, Company, CheckLog, Violation

_EVAL_DIR        = os.path.join(os.path.dirname(__file__), "..", "eval")
_TEST_PLATES_DIR = os.path.join(_EVAL_DIR, "test_plates")
_RESULTS_ROOT    = os.path.join(_EVAL_DIR, "test_plates_results")
_GROUND_TRUTH    = os.path.join(_TEST_PLATES_DIR, "ground_truth.json")
_RESULT_FOLDERS  = ["seg", "warp", "ocr", "detection", "pipeline"]


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ["name", "created_at"]
    search_fields = ["name"]


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (
        ("Park Check", {"fields": ("badge_number", "company")}),
    )
    list_display = ["username", "badge_number", "company", "is_staff"]
    list_filter = ["company", "is_staff"]


@admin.register(CheckLog)
class CheckLogAdmin(admin.ModelAdmin):
    list_display = ["plate_text", "registered", "officer", "checked_at", "latitude", "longitude"]
    list_filter = ["registered"]
    search_fields = ["plate_text", "officer__username"]
    readonly_fields = ["officer", "plate_text", "plate", "registered", "latitude", "longitude", "checked_at"]


@admin.register(Violation)
class ViolationAdmin(admin.ModelAdmin):
    list_display = ["plate_text", "officer", "issued_at"]
    search_fields = ["plate_text", "officer__username"]
    readonly_fields = ["check_log", "officer", "plate_text", "latitude", "longitude", "issued_at"]


@admin.register(Plate)
class PlateAdmin(admin.ModelAdmin):
    list_display = ["plate_number", "owner_name", "is_active", "created_at"]
    search_fields = ["plate_number", "owner_name"]
    list_filter = ["is_active"]


@admin.register(TestResult)
class TestResultAdmin(admin.ModelAdmin):
    def has_add_permission(self, request): return False
    def has_change_permission(self, request, obj=None): return False
    def has_delete_permission(self, request, obj=None): return False

    def get_urls(self):
        custom = [
            path("", self.admin_site.admin_view(self.changelist_view), name="api_testresult_changelist"),
            path("img/<str:folder>/<str:filename>/", self.admin_site.admin_view(self.serve_image), name="api_testresult_img"),
        ]
        return custom + super().get_urls()

    def changelist_view(self, request, extra_context=None):
        test_dir = os.path.join(_RESULTS_ROOT, "test")
        images = sorted(f for f in os.listdir(test_dir) if f.lower().endswith(".jpg")) if os.path.isdir(test_dir) else []

        folder = request.GET.get("folder", "pipeline")
        if folder not in _RESULT_FOLDERS:
            folder = "pipeline"

        current = request.GET.get("img", images[0] if images else "")
        if current not in images:
            current = images[0] if images else ""

        idx = images.index(current) if current in images else 0

        gt_text = ""
        if os.path.exists(_GROUND_TRUTH):
            with open(_GROUND_TRUTH) as f:
                gt = json.load(f)
            entry = gt.get(current, {})
            gt_text = entry.get("text", "") if isinstance(entry, dict) else entry if isinstance(entry, str) else ""

        context = {
            **self.admin_site.each_context(request),
            "title": "Test Results Viewer",
            "opts": self.model._meta,
            "images": images,
            "current": current,
            "folder": folder,
            "idx": idx,
            "total": len(images),
            "prev": images[idx - 1] if idx > 0 else None,
            "next": images[idx + 1] if idx < len(images) - 1 else None,
            "folders": _RESULT_FOLDERS,
            "gt_text": gt_text,
            "has_result": os.path.isfile(os.path.join(_RESULTS_ROOT, folder, current)),
        }
        return render(request, "admin/api/testresult/change_list.html", context)

    def serve_image(self, request, folder, filename):
        if folder not in _RESULT_FOLDERS + ["orig"]:
            raise Http404
        if not filename.endswith(".jpg") or "/" in filename or ".." in filename:
            raise Http404
        img_path = os.path.join(_TEST_PLATES_DIR, filename) if folder == "orig" else os.path.join(_RESULTS_ROOT, folder, filename)
        if not os.path.isfile(img_path):
            raise Http404
        return FileResponse(open(img_path, "rb"), content_type="image/jpeg")
