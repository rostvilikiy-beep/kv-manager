FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# data/ и *.session монтируются томом, чтобы переживать пересборку
VOLUME ["/app/data"]
ENV DB_PATH=/app/data/leadbot.sqlite3 TG_SESSION=/app/data/userbot
CMD ["python", "main.py"]
