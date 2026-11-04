FROM ubuntu:24.04

# Evitar preguntas interactivas durante la instalación con apt
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV HOME=/tmp
ENV OMP_NUM_THREADS=1
ENV OPENBLAS_NUM_THREADS=1

# 1. Instalar Tesseract (con idioma español) y dependencias de sistema para OpenCV y Python
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-spa \
    python3 \
    python3-pip \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# 2. Definir carpeta de trabajo dentro del contenedor
WORKDIR /app

# 3. Instalar las librerías de Python (OpenCV, Tesseract, Pandas y FastAPI con Uvicorn)
# (Nota: --break-system-packages se usa en Ubuntu 24.04+ para instalar en el entorno del sistema)
RUN pip3 install --no-cache-dir --break-system-packages \
    pytesseract \
    opencv-python-headless \
    pillow \
    pandas \
    fastapi \
    "uvicorn[standard]" \
    python-multipart

# 4. Copiar script, capturas y archivos de la app
COPY . /app

# 5. Exponer los puertos del microservicio (8000 standalone y 8090 en red Cenit)
EXPOSE 8000 8090

# 6. Comando para iniciar el microservicio FastAPI con Uvicorn (respeta HOST y PORT)
CMD ["python3", "main.py"]
