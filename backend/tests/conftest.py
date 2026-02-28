import io
import pytest
from PIL import Image, ImageDraw
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
        plate_number="ABC-123",
        owner_name="Test Owner",
        is_active=True,
    )


def make_plate_image(text="ABC-123", size=(320, 100)):
    """Create a synthetic licence plate image (white bg, black text) as a JPEG BytesIO."""
    img = Image.new("RGB", size, color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    draw.text((20, 35), text, fill=(0, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=95)
    buf.seek(0)
    return buf
