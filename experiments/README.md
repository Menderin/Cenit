# Experimentos de Cenit

Esta carpeta conserva investigaciones reproducibles antes de incorporar cambios a la aplicación. Los scripts no se ejecutan desde desarrollo, migraciones ni CI/CD.

El [laboratorio de extracción de compras](purchases/README.md) reúne generación de capturas ficticias, comparación de lectores y segmentación, procedimientos y resultados. `purchases/baseline` conserva el primer ensayo; los archivos de evidencia JSON identifican muestras, configuración y límites de cada batería.

Imágenes generadas, pesos adicionales y salidas completas permanecen en `tmp`, fuera de Git. Los experimentos no usan credenciales ni datos institucionales reales. El comportamiento del OCR integrado se explica en [Arquitectura](../Docs/ARQUITECTURA.md#capturas-y-ocr), y su aceptación se verifica en la [matriz](../Docs/PRUEBAS-Y-ACEPTACION.md).
