import pytest
from rest_framework.test import APIClient

from api.models import Enforcer, User

ENFORCERS_URL = "/api/enforcers/"


@pytest.mark.django_db
def test_admin_can_list_enforcers(admin_client, enforcer_user):
    resp = admin_client.get(ENFORCERS_URL)
    assert resp.status_code == 200
    usernames = [e["username"] for e in resp.data]
    assert "enforceruser" in usernames


@pytest.mark.django_db
def test_enforcer_cannot_access_enforcers_endpoint(enforcer_client):
    resp = enforcer_client.get(ENFORCERS_URL)
    assert resp.status_code == 403


@pytest.mark.django_db
def test_unauthenticated_cannot_access_enforcers():
    client = APIClient()
    resp = client.get(ENFORCERS_URL)
    assert resp.status_code == 401


@pytest.mark.django_db
def test_admin_create_enforcer(admin_client, company):
    payload = {"username": "newenforcer", "password": "securepass1", "badge_number": "B99"}
    resp = admin_client.post(ENFORCERS_URL, payload, format="json")
    assert resp.status_code == 201
    assert Enforcer.objects.filter(user__username="newenforcer", company=company).exists()


@pytest.mark.django_db
def test_admin_create_enforcer_duplicate_username(admin_client, enforcer_user):
    payload = {"username": "enforceruser", "password": "somepass", "badge_number": "B100"}
    resp = admin_client.post(ENFORCERS_URL, payload, format="json")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_admin_delete_enforcer(admin_client, enforcer_user):
    enforcer = enforcer_user.enforcer_profile
    resp = admin_client.delete(f"{ENFORCERS_URL}{enforcer.id}/")
    assert resp.status_code == 204
    assert not User.objects.filter(username="enforceruser").exists()


@pytest.mark.django_db
def test_admin_cannot_see_other_company_enforcers(admin_client, other_enforcer_user):
    resp = admin_client.get(ENFORCERS_URL)
    assert resp.status_code == 200
    usernames = [e["username"] for e in resp.data]
    assert "other_enforcer" not in usernames
