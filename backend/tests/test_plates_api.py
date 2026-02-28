import pytest
from rest_framework.test import APIClient

from api.models import Plate

URL = "/api/plates/"


@pytest.mark.django_db
def test_unauthenticated_cannot_list():
    client = APIClient()
    response = client.get(URL)
    assert response.status_code == 401


@pytest.mark.django_db
def test_list_plates(auth_client, plate_in_db):
    response = auth_client.get(URL)
    assert response.status_code == 200
    plate_numbers = [p["plate_number"] for p in response.data]
    assert "ABC-123" in plate_numbers


@pytest.mark.django_db
def test_create_plate(auth_client):
    payload = {"plate_number": "XY-456", "owner_name": "Jane Doe", "is_active": True}
    response = auth_client.post(URL, payload, format="json")
    assert response.status_code == 201
    assert Plate.objects.filter(plate_number="XY-456").exists()


@pytest.mark.django_db
def test_create_duplicate_plate_returns_400(auth_client, plate_in_db):
    payload = {"plate_number": "ABC-123", "owner_name": "Duplicate"}
    response = auth_client.post(URL, payload, format="json")
    assert response.status_code == 400


@pytest.mark.django_db
def test_update_plate(auth_client, plate_in_db):
    url = f"{URL}{plate_in_db.id}/"
    response = auth_client.patch(url, {"owner_name": "Updated Name"}, format="json")
    assert response.status_code == 200
    plate_in_db.refresh_from_db()
    assert plate_in_db.owner_name == "Updated Name"


@pytest.mark.django_db
def test_delete_plate(auth_client, plate_in_db):
    url = f"{URL}{plate_in_db.id}/"
    response = auth_client.delete(url)
    assert response.status_code == 204
    assert not Plate.objects.filter(id=plate_in_db.id).exists()


@pytest.mark.django_db
def test_inactive_plate_not_registered(auth_client):
    Plate.objects.create(plate_number="INACTIVE-1", owner_name="Old Owner", is_active=False)
    response = auth_client.get(URL)
    assert response.status_code == 200
    # Inactive plates still appear in list (admin can see them), just not matched by /check/
    plate_numbers = [p["plate_number"] for p in response.data]
    assert "INACTIVE-1" in plate_numbers
