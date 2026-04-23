import pytest
from rest_framework.test import APIClient

TOKEN_URL = "/api/auth/token/"
REFRESH_URL = "/api/auth/token/refresh/"
ME_URL = "/api/users/me/"


@pytest.mark.django_db
def test_token_obtain(enforcer_user):
    client = APIClient()
    response = client.post(TOKEN_URL, {"username": "enforceruser", "password": "enforcerpass123"}, format="json")
    assert response.status_code == 200
    assert "access" in response.data
    assert "refresh" in response.data


@pytest.mark.django_db
def test_token_wrong_credentials():
    client = APIClient()
    response = client.post(TOKEN_URL, {"username": "nobody", "password": "wrong"}, format="json")
    assert response.status_code == 401


@pytest.mark.django_db
def test_token_refresh(enforcer_user):
    client = APIClient()
    resp = client.post(TOKEN_URL, {"username": "enforceruser", "password": "enforcerpass123"}, format="json")
    refresh = resp.data["refresh"]
    resp2 = client.post(REFRESH_URL, {"refresh": refresh}, format="json")
    assert resp2.status_code == 200
    assert "access" in resp2.data


@pytest.mark.django_db
def test_me_enforcer_role(enforcer_client):
    response = enforcer_client.get(ME_URL)
    assert response.status_code == 200
    assert response.data["role"] == "enforcer"
    assert response.data["badge_number"] == "ENF01"


@pytest.mark.django_db
def test_me_admin_role(admin_client):
    response = admin_client.get(ME_URL)
    assert response.status_code == 200
    assert response.data["role"] == "company_admin"


@pytest.mark.django_db
def test_me_unauthenticated():
    client = APIClient()
    response = client.get(ME_URL)
    assert response.status_code == 401
