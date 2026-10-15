# Experimentos aislados

Leer primero las instrucciones raíz y `experiments/README.md`. Esta carpeta contiene investigación, no módulos de la aplicación. No conectar estos scripts a dev, migraciones o CD por iniciativa del agente.

- Usar sólo capturas completamente ficticias; pesos, imágenes generadas y reportes completos permanecen en `tmp`, fuera de Git.
- Mantener la verdad esperada fuera de los extractores: sólo el evaluador accede a ella. No usar nombres de archivos ni coordenadas del generador para extraer campos.
- Ajustar con desarrollo y congelar código/configuración antes de evaluación. Después de ver resultados, cualquier ajuste necesita otra batería de evaluación; no presentar el mismo conjunto como no visto.
- Conservar evidencia histórica, hashes, errores, parámetros y límites de CPU/RAM. No confundir coincidencia en muestras sintéticas con precisión institucional ni con una integración funcionando.
- No entrenar ni ajustar pesos sin autorización y un conjunto adecuado. Los ensayos actuales usan modelos preentrenados sin entrenamiento.
