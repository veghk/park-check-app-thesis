from rest_framework.routers import DefaultRouter
from .views import UserViewSet, PlateViewSet

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")
router.register("plates", PlateViewSet, basename="plate")

urlpatterns = router.urls
