import pytest
from rest_framework.test import APIClient

URL = "/api/check/"


@pytest.mark.django_db
def test_unauthenticated_returns_401():
    client = APIClient()
    response = client.post(URL, {"plate_text": "ABC123"}, format="json")
    assert response.status_code == 401


@pytest.mark.django_db
def test_no_plate_text_returns_400(auth_client):
    response = auth_client.post(URL, {}, format="json")
    assert response.status_code == 400
    assert "error" in response.data


@pytest.mark.django_db
def test_empty_plate_text_returns_400(auth_client):
    response = auth_client.post(URL, {"plate_text": "---"}, format="json")
    assert response.status_code == 400


@pytest.mark.django_db
def test_registered_plate(auth_client, plate_in_db):
    response = auth_client.post(URL, {"plate_text": "ABC123"}, format="json")
    assert response.status_code == 200
    assert response.data["plate_text"] == "ABC123"
    assert response.data["registered"] is True
    assert response.data["owner_name"] == "Test Owner"


@pytest.mark.django_db
def test_unregistered_plate(auth_client):
    response = auth_client.post(URL, {"plate_text": "ZZZ999"}, format="json")
    assert response.status_code == 200
    assert response.data["plate_text"] == "ZZZ999"
    assert response.data["registered"] is False
    assert response.data["owner_name"] == ""


@pytest.mark.django_db
def test_plate_text_normalized(auth_client, plate_in_db):
    # Lowercase and hyphens should be stripped before lookup
    response = auth_client.post(URL, {"plate_text": "abc-123"}, format="json")
    assert response.status_code == 200
    assert response.data["plate_text"] == "ABC123"
    assert response.data["registered"] is True
