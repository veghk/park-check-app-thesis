# Park Check

Mobile parking enforcement PWA. Enforcers point their phone camera at a licence plate, the app detects and reads it in the browser, checks it against the company's registered plates, and lets them file a violation on the spot.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite, PWA (Service Worker + manifest) |
| Detection | YOLOv8n-seg ONNX, runs via ONNX Runtime Web (WebGPU / WebGL / WASM) |
| OCR | european-plates-mobile-vit-v2 ONNX model, WASM backend |
| Backend | Django 4.2 + Django REST Framework, JWT auth (simplejwt) |
| Database | PostgreSQL 16 |
| Serving | Nginx (frontend + reverse proxy to Django) |
| Deployment | Docker Compose |

## Setup

```bash
# create a .env file in the project root with SECRET_KEY and DB creds
docker-compose up --build -d
docker-compose exec backend python manage.py createsuperuser
```

App at `http://localhost`, admin panel at `http://localhost/admin/`.

Use the Django admin to create a `Company` and a `CompanyAdmin` profile, then log in to the app as that admin to manage plates and enforcers.
