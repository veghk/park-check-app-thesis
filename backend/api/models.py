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
    def __str__(self):
        return self.username


class CompanyAdmin(models.Model):
    """A company administrator who manages enforcers and devices."""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="company_admin_profile")
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="admins")

    def __str__(self):
        return f"{self.user.username} (admin of {self.company})"


class Enforcer(models.Model):
    """A parking enforcement enforcer employed by a company."""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="enforcer_profile")
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="enforcers")
    badge_number = models.CharField(max_length=32, unique=True, null=True, blank=True)

    def __str__(self):
        return f"{self.user.username} (enforcer, {self.company})"


class Plate(models.Model):
    """A registered licence plate that is allowed to park."""
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="plates", null=True, blank=True)
    plate_number = models.CharField(max_length=16)
    owner_name = models.CharField(max_length=128, blank=True)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    valid_from = models.DateField(null=True, blank=True)
    valid_until = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("company", "plate_number")]

    def __str__(self):
        return self.plate_number


class CheckLog(models.Model):
    """Records every plate check performed by an enforcer."""
    enforcer = models.ForeignKey(User, on_delete=models.CASCADE, related_name="check_logs")
    plate_text = models.CharField(max_length=16)
    plate = models.ForeignKey(Plate, on_delete=models.SET_NULL, null=True, blank=True)
    registered = models.BooleanField()
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    checked_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        status = "registered" if self.registered else "unregistered"
        return f"{self.plate_text} — {status} ({self.enforcer})"

    class Meta:
        ordering = ["-checked_at"]


class Violation(models.Model):
    """
    An enforcement notice issued against an unregistered plate.
    All check data (enforcer, plate, GPS) is on the linked CheckLog.
    """
    check_log = models.OneToOneField(CheckLog, on_delete=models.CASCADE, related_name="violation")
    notes = models.TextField(blank=True)
    issued_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Violation — {self.check_log.plate_text} ({self.check_log.enforcer})"

    class Meta:
        ordering = ["-issued_at"]
