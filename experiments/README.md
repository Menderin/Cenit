# Experimentos de Cenit

Laboratorios aislados para investigar alternativas antes de incorporarlas a la aplicación. No se ejecutan desde `npm run dev`, las migraciones ni CI/CD, y no constituyen endpoints o funcionalidades entregadas.

- `purchases/baseline`: código y evidencia histórica de la primera comparación OCR; conservar sus fuentes para poder verificar los hashes.
- `purchases`: segunda batería de capturas ficticias, segmentación dinámica, evaluación separada y entorno Python/Podman.
- `purchases/battery-evidence.json`: resultados congelados de la segunda batería; ampliar o segmentar más no mejoró globalmente la lectura.
- `purchases/round3-evidence.json` y `round4-evidence.json`: recorte numérico, contraste entre motores y reconstrucción por encabezados/celdas; cada ronda usa otra evaluación congelada. Consultar las limitaciones junto a los porcentajes.
- Imágenes, pesos y salidas completas se generan en `tmp/ocr-research` y `tmp/ocr-battery`, fuera de Git. No colocar información institucional real, credenciales o datos de BD aquí.

Procedimiento y resultados: [investigación de extracción](../Docs/INVESTIGACION-EXTRACCION-COMPRAS.md). El procesamiento sigue en el notebook, dentro de Podman Linux con CPU; no se ha instalado el extractor en la VM universitaria.
