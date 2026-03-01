import pytest
from unittest.mock import MagicMock, patch
from rest_framework.test import APIClient

from .conftest import make_plate_image

URL = "/api/check/"


def _mock_reader(plate_text, confidence=0.95):
    """Return a mock EasyOCR reader that always yields one result."""
    mock = MagicMock()
    mock.readtext.return_value = [([[0, 0], [100, 0], [100, 30], [0, 30]], plate_text, confidence)]
    return mock


@pytest.mark.django_db
def test_unauthenticated_returns_401():
    client = APIClient()
    response = client.post(URL, {}, format="multipart")
    assert response.status_code == 401


@pytest.mark.django_db
def test_no_image_returns_400(auth_client):
    response = auth_client.post(URL, {}, format="multipart")
    assert response.status_code == 400
    assert "error" in response.data


@pytest.mark.django_db
def test_invalid_image_returns_400(auth_client):
    from django.core.files.uploadedfile import SimpleUploadedFile
    bad_file = SimpleUploadedFile("bad.jpg", b"not-an-image", content_type="image/jpeg")
    response = auth_client.post(URL, {"image": bad_file}, format="multipart")
    assert response.status_code == 400
    assert "error" in response.data


@pytest.mark.django_db
def test_registered_plate(auth_client, plate_in_db):
    with patch("api.views._get_reader", return_value=_mock_reader("ABC123")):
        image = make_plate_image("ABC123")
        from django.core.files.uploadedfile import SimpleUploadedFile
        f = SimpleUploadedFile("plate.jpg", image.read(), content_type="image/jpeg")
        response = auth_client.post(URL, {"image": f}, format="multipart")

    assert response.status_code == 200
    assert response.data["plate_text"] == "ABC123"
    assert response.data["registered"] is True
    assert response.data["owner_name"] == "Test Owner"
    assert response.data["confidence"] == pytest.approx(0.95)


@pytest.mark.django_db
def test_unregistered_plate(auth_client):
    with patch("api.views._get_reader", return_value=_mock_reader("ZZZ-999")):
        image = make_plate_image("ZZZ-999")
        from django.core.files.uploadedfile import SimpleUploadedFile
        f = SimpleUploadedFile("plate.jpg", image.read(), content_type="image/jpeg")
        response = auth_client.post(URL, {"image": f}, format="multipart")

    assert response.status_code == 200
    assert response.data["plate_text"] == "ZZZ-999"
    assert response.data["registered"] is False
    assert response.data["owner_name"] == ""


@pytest.mark.django_db
def test_empty_ocr_result(auth_client):
    mock_reader = MagicMock()
    mock_reader.readtext.return_value = []

    with patch("api.views._get_reader", return_value=mock_reader):
        image = make_plate_image()
        from django.core.files.uploadedfile import SimpleUploadedFile
        f = SimpleUploadedFile("plate.jpg", image.read(), content_type="image/jpeg")
        response = auth_client.post(URL, {"image": f}, format="multipart")

    assert response.status_code == 200
    assert response.data["plate_text"] == ""
    assert response.data["registered"] is False
    assert response.data["confidence"] == 0.0
