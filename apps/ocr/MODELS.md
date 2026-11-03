# Modelos y motor OCR

## Procesador integrado vigente (`tesseract5-spa-grid8-layout-v1`)

El procesador OCR integrado (`apps/ocr/extractor.py`) utiliza **Tesseract OCR 5** (`tesseract-ocr` y `tesseract-ocr-spa`, motor LSTM `--oem 3 --psm 6 -l spa`) junto con segmentación morfológica por celdas y cabeceras en **OpenCV** (`opencv-python-headless`).

- **Pesos externos en `apps/ocr/models/`**: no requiere pesos ONNX externos (`WEIGHTS = {}`). Los datos lingüísticos de español (`spa.traineddata`) se instalan directamente desde los paquetes oficiales de Debian/Ubuntu en [`apps/ocr/Containerfile`](Containerfile) y se verifican al iniciar el servidor mediante `load_engine()`.
- **Dependencias de Python fijadas**: ver [`apps/ocr/requirements.lock`](requirements.lock) (`numpy==2.4.6`, `opencv-python-headless==5.0.0.93`, `packaging==26.3`, `pillow==12.3.0`, `pytesseract==0.3.13`).

## Antecedente histórico (PP-OCRv5 ONNX)

Las baterías experimentales previas (`ppocr5-latin-grid8-v1` a `v4`) usaban dos pesos ONNX de RapidOCR `3.10.0`, que se conservan documentados para trazabilidad de los resultados históricos en [`experiments/purchases/README.md`](../../experiments/purchases/README.md):

| Archivo | Uso histórico | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `models/ch_PP-OCRv5_det_mobile.onnx` | Detector PP-OCRv5 móvil | 4,819,576 | `4d97c44a20d30a81aad087d6a396b08f786c4635742afc391f6621f5c6ae78ae` |
| `models/latin_PP-OCRv5_rec_mobile.onnx` | Reconocedor latino PP-OCRv5 móvil | 7,904,513 | `b20bd37c168a570f583afbc8cd7925603890efbcdc000a59e22c269d160b5f5a` |

RapidOCR atribuye esos modelos upstream a Baidu y a sus respectivos titulares bajo Apache-2.0: [RapidOCR, sección Models](https://github.com/RapidAI/RapidOCR#models), [licencia PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR/blob/main/LICENSE).
