import pytest
from unittest.mock import MagicMock, patch
from rest_framework.test import APIClient

from .conftest import make_plate_image

URL = "/api/check/"


def _mock_recognizer(plate_text):
    """Return a mock fast-plate-ocr recognizer that always yields one result."""
    mock = MagicMock()
    mock.run.return_value = [plate_text]
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
    with patch("api.views._get_recognizer", return_value=_mock_recognizer("ABC123")):
        image = make_plate_image("ABC123")
        from django.core.files.uploadedfile import SimpleUploadedFile
        f = SimpleUploadedFile("plate.jpg", image.read(), content_type="image/jpeg")
        response = auth_client.post(URL, {"image": f}, format="multipart")

    assert response.status_code == 200
    assert response.data["plate_text"] == "ABC123"
    assert response.data["registered"] is True
    assert response.data["owner_name"] == "Test Owner"


@pytest.mark.django_db
def test_unregistered_plate(auth_client):
    with patch("api.views._get_recognizer", return_value=_mock_recognizer("ZZZ999")):
        image = make_plate_image("ZZZ999")
        from django.core.files.uploadedfile import SimpleUploadedFile
        f = SimpleUploadedFile("plate.jpg", image.read(), content_type="image/jpeg")
        response = auth_client.post(URL, {"image": f}, format="multipart")

    assert response.status_code == 200
    assert response.data["plate_text"] == "ZZZ999"
    assert response.data["registered"] is False
    assert response.data["owner_name"] == ""


@pytest.mark.django_db
def test_empty_ocr_result(auth_client):
    mock_recognizer = MagicMock()
    mock_recognizer.run.return_value = []

    with patch("api.views._get_recognizer", return_value=mock_recognizer):
        image = make_plate_image()
        from django.core.files.uploadedfile import SimpleUploadedFile
        f = SimpleUploadedFile("plate.jpg", image.read(), content_type="image/jpeg")
        response = auth_client.post(URL, {"image": f}, format="multipart")

    assert response.status_code == 200
    assert response.data["plate_text"] == ""
    assert response.data["registered"] is False
