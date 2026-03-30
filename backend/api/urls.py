from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import PlateViewSet, CheckView, CheckLogListView, ViolationCreateView, MeView, EnforcerViewSet

router = DefaultRouter()
router.register("plates", PlateViewSet, basename="plate")
router.register("enforcers", EnforcerViewSet, basename="enforcer")

urlpatterns = router.urls + [
    path("users/me/", MeView.as_view(), name="me"),
    path("check/", CheckView.as_view(), name="check"),
    path("logs/", CheckLogListView.as_view(), name="check-logs"),
    path("violations/", ViolationCreateView.as_view(), name="violations"),
]
