import datetime
import pytest
from rest_framework.test import APIClient

from api.models import Plate

CHECK_URL = "/api/check/"


@pytest.mark.django_db
def test_plate_check_valid(enforcer_client, plate_in_db):
    response = enforcer_client.post(CHECK_URL, {"plate_text": "ABC123"}, format="json")
    assert response.status_code == 200
    assert response.data["registered"] is True


@pytest.mark.django_db
def test_plate_check_invalid(enforcer_client):
    response = enforcer_client.post(CHECK_URL, {"plate_text": "NOTEXIST"}, format="json")
    assert response.status_code == 200
    assert response.data["registered"] is False


@pytest.mark.django_db
def test_plate_check_unauthenticated():
    client = APIClient()
    response = client.post(CHECK_URL, {"plate_text": "ABC123"}, format="json")
    assert response.status_code == 401


@pytest.mark.django_db
def test_plate_within_date_range(enforcer_client, company):
    today = datetime.date.today()
    Plate.objects.create(
        company=company,
        plate_number="VALID01",
        is_active=True,
        valid_from=today - datetime.timedelta(days=1),
        valid_until=today + datetime.timedelta(days=1),
    )
    response = enforcer_client.post(CHECK_URL, {"plate_text": "VALID01"}, format="json")
    assert response.status_code == 200
    assert response.data["registered"] is True


@pytest.mark.django_db
def test_plate_expired(enforcer_client, company):
    yesterday = datetime.date.today() - datetime.timedelta(days=1)
    Plate.objects.create(
        company=company,
        plate_number="EXP01",
        is_active=True,
        valid_until=yesterday,
    )
    response = enforcer_client.post(CHECK_URL, {"plate_text": "EXP01"}, format="json")
    assert response.status_code == 200
    assert response.data["registered"] is False


@pytest.mark.django_db
def test_plate_not_yet_valid(enforcer_client, company):
    tomorrow = datetime.date.today() + datetime.timedelta(days=1)
    Plate.objects.create(
        company=company,
        plate_number="FUTURE01",
        is_active=True,
        valid_from=tomorrow,
    )
    response = enforcer_client.post(CHECK_URL, {"plate_text": "FUTURE01"}, format="json")
    assert response.status_code == 200
    assert response.data["registered"] is False


@pytest.mark.django_db
def test_plate_no_date_restriction(enforcer_client, company):
    Plate.objects.create(
        company=company,
        plate_number="NODATE1",
        is_active=True,
        valid_from=None,
        valid_until=None,
    )
    response = enforcer_client.post(CHECK_URL, {"plate_text": "NODATE1"}, format="json")
    assert response.status_code == 200
    assert response.data["registered"] is True


@pytest.mark.django_db
def test_cross_company_isolation(other_enforcer_client, plate_in_db):
    response = other_enforcer_client.post(CHECK_URL, {"plate_text": "ABC123"}, format="json")
    assert response.status_code == 200
    assert response.data["registered"] is False


@pytest.mark.django_db
def test_no_plate_text_returns_400(enforcer_client):
    response = enforcer_client.post(CHECK_URL, {}, format="json")
    assert response.status_code == 400
    assert "error" in response.data


@pytest.mark.django_db
def test_empty_plate_text_returns_400(enforcer_client):
    response = enforcer_client.post(CHECK_URL, {"plate_text": ""}, format="json")
    assert response.status_code == 400


@pytest.mark.django_db
def test_check_stores_owner_name(enforcer_client, plate_in_db):
    response = enforcer_client.post(CHECK_URL, {"plate_text": "ABC123"}, format="json")
    assert response.data["owner_name"] == "Test Owner"


@pytest.mark.django_db
def test_checklog_gps_stored(enforcer_client, plate_in_db):
    response = enforcer_client.post(
        CHECK_URL,
        {"plate_text": "ABC123", "latitude": 47.4979, "longitude": 19.0402},
        format="json",
    )
    assert response.status_code == 200
    from api.models import CheckLog
    log = CheckLog.objects.get(id=response.data["check_log_id"])
    assert abs(log.latitude - 47.4979) < 0.0001
    assert abs(log.longitude - 19.0402) < 0.0001


@pytest.mark.django_db
def test_check_creates_checklog(enforcer_client, plate_in_db):
    from api.models import CheckLog
    before = CheckLog.objects.count()
    enforcer_client.post(CHECK_URL, {"plate_text": "ABC123"}, format="json")
    assert CheckLog.objects.count() == before + 1


@pytest.mark.django_db
def test_inactive_plate_returns_invalid(enforcer_client, company):
    Plate.objects.create(company=company, plate_number="INACT01", is_active=False)
    response = enforcer_client.post(CHECK_URL, {"plate_text": "INACT01"}, format="json")
    assert response.data["registered"] is False
