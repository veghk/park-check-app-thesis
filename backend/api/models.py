from django.db import models
from django.contrib.auth.models import AbstractUser


class Company(models.Model):
    """A municipality or enforcement organisation that owns a group of enforcers."""
    name = models.CharField(max_length=128, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

    class Meta:
        verbose_name_plural = "companies"


class User(AbstractUser):
    """Extended user model for parking enforcement officers."""
    badge_number = models.CharField(max_length=32, unique=True, null=True, blank=True)
    company = models.ForeignKey(
        Company, on_delete=models.SET_NULL, null=True, blank=True, related_name="enforcers"
    )

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


class CheckLog(models.Model):
    """Records every plate check performed by an enforcer."""
    officer = models.ForeignKey(User, on_delete=models.CASCADE, related_name="check_logs")
    plate_text = models.CharField(max_length=16)
    plate = models.ForeignKey(Plate, on_delete=models.SET_NULL, null=True, blank=True)
    registered = models.BooleanField()
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    checked_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        status = "registered" if self.registered else "unregistered"
        return f"{self.plate_text} — {status} ({self.officer})"

    class Meta:
        ordering = ["-checked_at"]


class Violation(models.Model):
    """An enforcement notice issued by an officer against an unregistered plate."""
    check_log = models.OneToOneField(CheckLog, on_delete=models.CASCADE, related_name="violation")
    officer = models.ForeignKey(User, on_delete=models.CASCADE, related_name="violations")
    plate_text = models.CharField(max_length=16)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    notes = models.TextField(blank=True)
    issued_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Violation — {self.plate_text} ({self.officer})"

    class Meta:
        ordering = ["-issued_at"]


class TestResult(models.Model):
    """Proxy model with no DB table. Only exists to register the test viewer in Django admin."""
    class Meta:
        managed = False
        verbose_name = "Test Result"
        verbose_name_plural = "Test Results"
