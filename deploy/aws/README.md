# Entrega en AWS (EC2 + Systems Manager)

Destino alternativo a [Azure](../azure/README.md). Un único nodo EC2 `t3.medium` (us-east-2) aloja staging y producción, cada uno con su propio proyecto Compose, base, secretos y puerto loopback (8082 staging, 8081 producción). Caddy publica HTTPS en 80/443; no hay SSH público.

## Cómo se elige el destino

El workflow `Cenit Release` lee la variable de repositorio `CENIT_DEPLOY_TARGET`:

| Valor | Efecto |
| --- | --- |
| vacío o `azure` | Se entrega a Azure, como hasta ahora |
| `aws` | Se entrega a AWS; el job de Azure no corre |

Con `CENIT_AWS_PUBLIC_VERIFY=true` el job AWS comprueba además `https://<dominio>/health/ready`. Activarla sólo cuando el DNS apunte al nodo AWS.

## Configuración versionada

[`config.json`](config.json) es la única fuente de región, nombre del nodo, etiqueta de SSM, rol de entrega, dominios y puertos. `run-command-aws.py` genera el Caddyfile y los orígenes (`CENIT_ORIGIN`/`AUTH_ALLOWED_ORIGINS`) desde ese archivo. Para cambiar de dominio se edita `hosts` y se realiza una entrega.

## Recursos (lista cerrada)

Instancia EC2 `cenit-aws` (Ubuntu 24.04, disco gp3 cifrado de 30 GB, IMDSv2 obligatorio), una Elastic IP, el grupo de seguridad `cenit-aws` (sólo TCP 80/443, sin SSH), el rol/perfil `cenit-ec2-node` (Systems Manager y lectura de un único parámetro), un bucket S3 privado para volcados, el usuario IAM `cenit-github-deploy` y un AWS Budget. [`provision.sh`](provision.sh) crea el rol, el grupo, la instancia y la IP de forma idempotente. No se usa Session Manager ni snapshots.

La cuenta se creó dentro de una organización AWS cuyo SCP prohíbe los proveedores OIDC y bloquea otras regiones (por ejemplo `sa-east-1`) y Lightsail `medium`; por eso la entrega usa un usuario IAM con llaves en lugar de OIDC y EC2 en lugar de Lightsail. Las llaves son los secretos `CENIT_AWS_ACCESS_KEY_ID` y `CENIT_AWS_SECRET_ACCESS_KEY` del repositorio. Rotarlas si se sospecha exposición.

## Entrega

1. `deploy/aws/run-command-aws.py` valida: sólo `push` a `main`/`develop` de `Menderin/Cenit`, imágenes de Cenit fijadas por digest.
2. Guarda el token de lectura de GHCR (el del workflow, de vida corta) en Parameter Store como `SecureString` en `/cenit/aws/ghcr-pull-token`. El texto del comando nunca lo contiene.
3. Envía `AWS-RunShellScript` al nodo etiquetado `Cenit=aws-node` y espera el resultado de la invocación.
4. [`deploy.sh`](deploy.sh) hace lo mismo que en Azure: verifica etiquetas de las imágenes, respaldo previo a migrar, migración con `deploy/migrate.cjs`, readiness local y Caddy.

El usuario de entrega sólo puede: `ssm:SendCommand` sobre el documento `AWS-RunShellScript` y nodos con la etiqueta, consultar invocaciones y escribir ese parámetro.

## Verificación en el nodo

Con ambos entornos activos, medir memoria (`free -m`, `docker stats --no-stream`) y repetir la medición del OCR con la imagen vigente antes de dar la capacidad por buena. El nodo crea 2 GB de swap como margen.

## Verificación de seguridad

Registrar fecha, destino AWS, entorno, SHA e imágenes de `current.json` y la ejecución de Actions. Revisar si el paso `Verify public HTTPS` se ejecutó; su omisión requiere comprobar HTTPS por separado en los dominios de `config.json`, con validación del certificado. Comprobar salud, acceso con cuenta ficticia autorizada, cookie `Secure`/`HttpOnly`/`SameSite=Lax`, cierre y rechazo de Origin ajeno.

El [diagnóstico acotado del host](../azure/README.md#diagnóstico-acotado-en-la-vm) también sirve en este nodo mediante Systems Manager, porque ambos destinos usan la misma estructura `/opt/cenit/<entorno>` y Compose. Comprueba SHA/digests, puertos, redes, permisos de archivos y separación de credenciales de aplicación/migrador sin imprimir contraseñas. Los comandos `az` corresponden al destino Azure.

El operador debe aportar además la configuración efectiva de EC2/EBS y sus grupos de seguridad. Contrastar discos adjuntos, cifrado EBS y referencia de clave KMS, IMDSv2, entrada de 80/443 y ausencia de exposición pública de PostgreSQL/OCR. El disco cifrado declarado en `provision.sh` requiere cotejo con el volumen instalado. Los dumps de `backups/*.dump`, la configuración de un bucket privado y un despliegue correcto tienen comprobaciones de cifrado de archivo, copia externa y restauración pendientes en SCRUM-130/131.

La [custodia de secretos compartidos](../azure/README.md#custodia-y-cambios-de-secretos) cubre PostgreSQL, procedencia, Google y Sheets. Para AWS, el operador custodia también los secretos de repositorio `CENIT_AWS_ACCESS_KEY_ID`/`CENIT_AWS_SECRET_ACCESS_KEY` y revisa la política efectiva de su usuario IAM. El token efímero de GHCR se guarda en el parámetro `SecureString` configurado, leído por el nodo. Rotar las llaves IAM exige actualizar GitHub, comprobar la siguiente entrega y revocar las anteriores. Registrar responsables y referencias de almacenamiento por canal privado, junto con cualquier comprobación pendiente.
