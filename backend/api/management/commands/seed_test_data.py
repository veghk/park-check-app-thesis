from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from api.models import Company, CompanyAdmin, Enforcer

User = get_user_model()


class Command(BaseCommand):
    help = "Create test company, company admin, and enforcers"

    def handle(self, *args, **options):
        company, created = Company.objects.get_or_create(name="Test Company")
        if created:
            self.stdout.write(f"  Created company: {company.name}")
        else:
            self.stdout.write(f"  Company already exists: {company.name}")

        admin_user, created = User.objects.get_or_create(username="testcompany")
        admin_user.set_password("testcompany")
        admin_user.save()
        CompanyAdmin.objects.get_or_create(user=admin_user, defaults={"company": company})
        self.stdout.write(f"  {'Created' if created else 'Updated'} company admin: testcompany / testcompany")

        for i in range(1, 4):
            username = f"testenforcer{i}"
            enforcer_user, created = User.objects.get_or_create(username=username)
            enforcer_user.set_password(username)
            enforcer_user.save()
            Enforcer.objects.get_or_create(
                user=enforcer_user,
                defaults={"company": company, "badge_number": f"T00{i}"},
            )
            self.stdout.write(f"  {'Created' if created else 'Updated'} enforcer: {username} / {username}")

        self.stdout.write(self.style.SUCCESS("Done."))
