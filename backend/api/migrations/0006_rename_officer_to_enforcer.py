from django.conf import settings
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("api", "0005_add_plate_company_and_dates"),
    ]

    operations = [
        migrations.RenameField(
            model_name="checklog",
            old_name="officer",
            new_name="enforcer",
        ),
        migrations.RenameField(
            model_name="violation",
            old_name="officer",
            new_name="enforcer",
        ),
    ]
