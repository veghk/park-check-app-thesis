from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import UserViewSet, PlateViewSet, CheckView, CheckLogListView, ViolationCreateView

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")
router.register("plates", PlateViewSet, basename="plate")

urlpatterns = router.urls + [
    path("check/", CheckView.as_view(), name="check"),
    path("logs/", CheckLogListView.as_view(), name="check-logs"),
    path("violations/", ViolationCreateView.as_view(), name="violations"),
]
