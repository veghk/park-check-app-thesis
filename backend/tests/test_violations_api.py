import pytest
from rest_framework.test import APIClient

from api.models import Violation

CHECK_URL = "/api/check/"
VIOLATIONS_URL = "/api/violations/"


def _do_check(client, plate_text):
    return client.post(CHECK_URL, {"plate_text": plate_text}, format="json")


@pytest.mark.django_db
def test_violation_created_on_invalid(enforcer_client):
    check_resp = _do_check(enforcer_client, "NOTINDB1")
    assert check_resp.data["registered"] is False
    check_log_id = check_resp.data["check_log_id"]

    resp = enforcer_client.post(VIOLATIONS_URL, {"check_log_id": check_log_id}, format="json")
    assert resp.status_code == 201
    assert Violation.objects.filter(check_log_id=check_log_id).exists()


@pytest.mark.django_db
def test_violation_unauthenticated():
    client = APIClient()
    resp = client.post(VIOLATIONS_URL, {"check_log_id": 1}, format="json")
    assert resp.status_code == 401


@pytest.mark.django_db
def test_violation_missing_check_log_id(enforcer_client):
    resp = enforcer_client.post(VIOLATIONS_URL, {}, format="json")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_violation_wrong_officer(enforcer_client, other_enforcer_client):
    check_resp = _do_check(enforcer_client, "NOTINDB2")
    log_id = check_resp.data["check_log_id"]

    resp = other_enforcer_client.post(VIOLATIONS_URL, {"check_log_id": log_id}, format="json")
    assert resp.status_code == 404


@pytest.mark.django_db
def test_violation_duplicate_returns_409(enforcer_client):
    check_resp = _do_check(enforcer_client, "NOTINDB3")
    log_id = check_resp.data["check_log_id"]

    enforcer_client.post(VIOLATIONS_URL, {"check_log_id": log_id}, format="json")
    resp2 = enforcer_client.post(VIOLATIONS_URL, {"check_log_id": log_id}, format="json")
    assert resp2.status_code == 409


@pytest.mark.django_db
def test_violation_includes_notes(enforcer_client):
    check_resp = _do_check(enforcer_client, "NOTINDB4")
    log_id = check_resp.data["check_log_id"]

    resp = enforcer_client.post(
        VIOLATIONS_URL, {"check_log_id": log_id, "notes": "Blocking fire exit"}, format="json"
    )
    assert resp.status_code == 201
    assert resp.data["notes"] == "Blocking fire exit"
