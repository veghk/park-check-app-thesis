import pytest
from rest_framework.test import APIClient

LOGS_URL = "/api/logs/"
CHECK_URL = "/api/check/"


@pytest.mark.django_db
def test_logs_unauthenticated():
    client = APIClient()
    resp = client.get(LOGS_URL)
    assert resp.status_code == 401


@pytest.mark.django_db
def test_logs_returns_own_checks(enforcer_client, plate_in_db):
    enforcer_client.post(CHECK_URL, {"plate_text": "ABC123"}, format="json")
    resp = enforcer_client.get(LOGS_URL)
    assert resp.status_code == 200
    assert len(resp.data) >= 1


@pytest.mark.django_db
def test_logs_isolation_between_enforcers(enforcer_client, other_enforcer_client):
    enforcer_client.post(CHECK_URL, {"plate_text": "ISOLATION1"}, format="json")
    resp = other_enforcer_client.get(LOGS_URL)
    assert resp.status_code == 200
    plate_texts = [log["plate_text"] for log in resp.data]
    assert "ISOLATION1" not in plate_texts


@pytest.mark.django_db
def test_log_has_violation_flag(enforcer_client):
    check_resp = enforcer_client.post(CHECK_URL, {"plate_text": "NOPLATE99"}, format="json")
    log_id = check_resp.data["check_log_id"]

    enforcer_client.post("/api/violations/", {"check_log_id": log_id}, format="json")

    resp = enforcer_client.get(LOGS_URL)
    log = next(l for l in resp.data if l["id"] == log_id)
    assert log["has_violation"] is True
