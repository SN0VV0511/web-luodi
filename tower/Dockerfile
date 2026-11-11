FROM python:3.11-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
COPY server.py admin.html ./
EXPOSE 3004
CMD ["python3", "server.py"]
