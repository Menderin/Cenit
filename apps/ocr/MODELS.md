# Modelos OCR

La versión integrada de la demostración incluye los dos pesos ONNX de runtime para que el equipo pueda clonarla y construir la imagen OCR sin preparar estos archivos por separado. No son pesos entrenados por Cenit. `.gitignore` mantiene ignorados los archivos adicionales de `apps/ocr/models/`; sólo estos dos pesos están versionados.

| Archivo | Uso | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `models/ch_PP-OCRv5_det_mobile.onnx` | Detector PP-OCRv5 móvil | 4,819,576 | `4d97c44a20d30a81aad087d6a396b08f786c4635742afc391f6621f5c6ae78ae` |
| `models/latin_PP-OCRv5_rec_mobile.onnx` | Reconocedor latino PP-OCRv5 móvil | 7,904,513 | `b20bd37c168a570f583afbc8cd7925603890efbcdc000a59e22c269d160b5f5a` |

El runtime usa RapidOCR `3.10.0` y comprueba estos hashes antes de procesar. RapidOCR atribuye los modelos upstream a Baidu y a sus respectivos titulares; su documentación indica que los modelos aplicables y sus conversiones ONNX se redistribuyen bajo Apache-2.0. Revisar los avisos originales antes de cambiar o redistribuir otros modelos: [RapidOCR, sección Models](https://github.com/RapidAI/RapidOCR#models), [licencia PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR/blob/main/LICENSE).
