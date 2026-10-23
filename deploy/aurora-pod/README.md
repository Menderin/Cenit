# Unidades Podman Quadlet (`.pod` + `.container`) para Aurora Linux

Conversión de [compose.aurora.yaml](../../compose.aurora.yaml) a un único Pod de Podman (`cenit-local`) gestionado por `systemd --user` mediante Quadlet.

## Archivos incluidos

- `cenit-local.pod`: define el Pod `cenit-local`, publica los puertos locales (`127.0.0.1:55432->5432`, `127.0.0.1:8081->8080`, `127.0.0.1:8090->8090`) y registra los alias internos (`db`, `cenit-app`, `ocr` → `127.0.0.1`) para conservar intactos `.local/secrets/*-url` y `deploy/nginx/cenit.conf`.
- `cenit-local-postgres.volume`: volumen persistente `cenit-local-postgres-data`.
- `cenit-local-db.container`: PostgreSQL 17 con `SecurityLabelDisable=true` y secretos montados desde `.local/secrets/`.
- `cenit-local-proxy.container`: proxy Nginx en modo bootstrap (`127.0.0.1:8081`).
- `cenit-local-migrate.container`: servicio `oneshot` para ejecutar `node /app/deploy/migrate.cjs` con `localhost/cenit-local:dev`.
- `cenit-local-app.container`: contenedor de producción del monolito (`localhost/cenit-local:dev`).
- `cenit-local-ocr.container`: contenedor auxiliar de OCR (`localhost/cenit-ocr:adapter1`).

## Uso en Aurora Linux

1. Preparar secretos locales si aún no existen:
   ```bash
   python3 deploy/scripts/setup-local.py
   ```
2. Detener los contenedores previos de `podman compose` si están usando los puertos `55432` u `8081`:
   ```bash
   podman compose -f compose.aurora.yaml down
   ```
3. Enlazar las unidades en `~/.config/containers/systemd/` y recargar `systemd --user`:
   ```bash
   mkdir -p ~/.config/containers/systemd
   ln -sf /var/home/Helo/Documents/Cenit/deploy/aurora-pod/* ~/.config/containers/systemd/
   systemctl --user daemon-reload
   ```
4. Iniciar el Pod base (`db` + `proxy`):
   ```bash
   systemctl --user start cenit-local-db.service cenit-local-proxy.service
   ```
5. Opcionalmente, iniciar migración + aplicación compilada u OCR:
   ```bash
   systemctl --user start cenit-local-app.service
   systemctl --user start cenit-local-ocr.service
   ```
