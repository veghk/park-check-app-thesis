import pytest
from rest_framework.test import APIClient

from api.models import Plate

PLATES_URL = "/api/plates/"


@pytest.mark.django_db
def test_admin_create_plate(admin_client, company):
    payload = {"plate_number": "XY456", "owner_name": "Jane Doe", "is_active": True}
    response = admin_client.post(PLATES_URL, payload, format="json")
    assert response.status_code == 201
    assert Plate.objects.filter(plate_number="XY456", company=company).exists()


@pytest.mark.django_db
def test_enforcer_cannot_create_plate(enforcer_client):
    payload = {"plate_number": "ENFC01", "owner_name": "Should Fail"}
    response = enforcer_client.post(PLATES_URL, payload, format="json")
    assert response.status_code == 403


@pytest.mark.django_db
def test_unauthenticated_cannot_list():
    client = APIClient()
    response = client.get(PLATES_URL)
    assert response.status_code == 401


@pytest.mark.django_db
def test_list_plates(admin_client, plate_in_db):
    response = admin_client.get(PLATES_URL)
    assert response.status_code == 200
    plate_numbers = [p["plate_number"] for p in response.data]
    assert "ABC123" in plate_numbers


@pytest.mark.django_db
def test_create_duplicate_plate_returns_400(admin_client, plate_in_db):
    payload = {"plate_number": "ABC123", "owner_name": "Duplicate"}
    response = admin_client.post(PLATES_URL, payload, format="json")
    assert response.status_code == 400


@pytest.mark.django_db
def test_update_plate(admin_client, plate_in_db):
    url = f"{PLATES_URL}{plate_in_db.id}/"
    response = admin_client.patch(url, {"owner_name": "Updated Name"}, format="json")
    assert response.status_code == 200
    plate_in_db.refresh_from_db()
    assert plate_in_db.owner_name == "Updated Name"


@pytest.mark.django_db
def test_delete_plate(admin_client, plate_in_db):
    url = f"{PLATES_URL}{plate_in_db.id}/"
    response = admin_client.delete(url)
    assert response.status_code == 204
    assert not Plate.objects.filter(id=plate_in_db.id).exists()


@pytest.mark.django_db
def test_admin_cannot_see_other_company_plates(admin_client, other_company):
    Plate.objects.create(company=other_company, plate_number="OTHER01", is_active=True)
    response = admin_client.get(PLATES_URL)
    assert response.status_code == 200
    plate_numbers = [p["plate_number"] for p in response.data]
    assert "OTHER01" not in plate_numbers


@pytest.mark.django_db
def test_plate_number_normalised_to_uppercase(admin_client):
    payload = {"plate_number": "abc-123", "owner_name": "Test"}
    response = admin_client.post(PLATES_URL, payload, format="json")
    assert response.status_code == 201
    assert response.data["plate_number"] == "ABC123"
