import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from api.models import User, Company, CompanyAdmin, Enforcer, Plate


@pytest.fixture
def company(db):
    return Company.objects.create(name="TestCo")


@pytest.fixture
def other_company(db):
    return Company.objects.create(name="OtherCo")


@pytest.fixture
def admin_user(company):
    user = User.objects.create_user(username="adminuser", password="adminpass123")
    CompanyAdmin.objects.create(user=user, company=company)
    return user


@pytest.fixture
def enforcer_user(company):
    user = User.objects.create_user(username="enforceruser", password="enforcerpass123")
    Enforcer.objects.create(user=user, company=company, badge_number="ENF01")
    return user


@pytest.fixture
def other_enforcer_user(other_company):
    user = User.objects.create_user(username="other_enforcer", password="pass123")
    Enforcer.objects.create(user=user, company=other_company, badge_number="ENF02")
    return user


def _make_client(user):
    client = APIClient()
    token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


@pytest.fixture
def admin_client(admin_user):
    return _make_client(admin_user)


@pytest.fixture
def enforcer_client(enforcer_user):
    return _make_client(enforcer_user)


@pytest.fixture
def other_enforcer_client(other_enforcer_user):
    return _make_client(other_enforcer_user)


# Keep generic auth_client alias pointing to enforcer for backwards compat
@pytest.fixture
def auth_client(enforcer_client):
    return enforcer_client


@pytest.fixture
def plate_in_db(company):
    return Plate.objects.create(
        company=company,
        plate_number="ABC123",
        owner_name="Test Owner",
        is_active=True,
    )
