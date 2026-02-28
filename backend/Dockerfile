FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    gcc \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxrender1 \
    libxext6 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download EasyOCR English model weights at build time (~100 MB)
# so the first /api/check/ call does not stall waiting for a download.
RUN python -c "import easyocr; easyocr.Reader(['en'], gpu=False)"

COPY . .

ENTRYPOINT ["sh", "entrypoint.sh"]
