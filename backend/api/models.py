from django.db import models
from django.contrib.auth.models import AbstractUser


class User(AbstractUser):
    """Extended user model for parking enforcement officers."""
    badge_number = models.CharField(max_length=32, unique=True, null=True, blank=True)

    def __str__(self):
        return self.username


class Plate(models.Model):
    """A registered licence plate that is allowed to park."""
    plate_number = models.CharField(max_length=16, unique=True)
    owner_name = models.CharField(max_length=128, blank=True)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.plate_number


class TestResult(models.Model):
    """Proxy model with no DB table. Only exists to register the test viewer in Django admin."""
    class Meta:
        managed = False
        verbose_name = "Test Result"
        verbose_name_plural = "Test Results"
