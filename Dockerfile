FROM python:3.11-slim

WORKDIR /app

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt gunicorn

COPY backend/ ./backend/
COPY index.html manifest.json sw.js ./
COPY css/ ./css/
COPY js/ ./js/
COPY icons/ ./icons/

WORKDIR /app/backend

ENV PORT=5000
EXPOSE 5000

CMD gunicorn -b 0.0.0.0:${PORT} --workers 2 --timeout 120 app:app
