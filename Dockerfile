FROM python:3.12-slim

WORKDIR /app

COPY backend/pyproject.toml ./
RUN pip install --no-cache-dir ".[prod]"

COPY backend/app ./app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/v1/settings/health')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
