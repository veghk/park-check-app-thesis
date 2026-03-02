import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from api.models import User, Plate


@pytest.fixture
def db_user(db):
    return User.objects.create_user(
        username="testuser",
        password="testpass123",
        badge_number="TEST01",
    )


@pytest.fixture
def auth_client(db_user):
    client = APIClient()
    token = RefreshToken.for_user(db_user).access_token
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


@pytest.fixture
def plate_in_db(db):
    return Plate.objects.create(
        plate_number="ABC123",
        owner_name="Test Owner",
        is_active=True,
    )
