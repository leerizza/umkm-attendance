FROM python:3.11-slim

WORKDIR /app

# Copy requirements dari lokasi mana pun dia berada
COPY requirements.txt* ./
COPY backend/requirements.txt* ./

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt || pip install --no-cache-dir -r backend/requirements.txt

# Copy semua file project
COPY . .

# Tambahkan /app dan /app/backend ke PYTHONPATH agar Python bisa menemukan modul
ENV PYTHONPATH=/app:/app/backend

# Beri izin eksekusi (opsional tapi bagus)
RUN chmod +x main.py || chmod +x backend/main.py

# Railway PORT
ENV PORT=8080

# Perintah menjalankan: Coba di root, kalau gagal coba di folder backend
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]