# Cenit en Azure — preparación del 17 de octubre de 2026

Gael autorizó sustituir la VM compartida por Azure en **Chile Central**, conservar GitHub Actions y ejecutar también OCR. Presupuesto: **USD 200 en total hasta diciembre**, procurando ahorrar. Esta decisión sustituye el destino y el polling de la VM anterior; no cambia los contratos de la aplicación, las migraciones ni el flujo de revisión por PR.

| Rama protegida | Entorno | Dirección |
| --- | --- | --- |
| `main` | Producción de la demostración | `https://cenit.dpdns.org` |
| `develop` | Staging | `https://develop.cenit.dpdns.org` |

Una sola B2als v2, Linux/amd64, 2 vCPU y 4 GiB; SSD estándar de 64 GiB e IPv4 fija. Ambos entornos tienen contenedores, redes, volúmenes PostgreSQL, contraseñas y claves de procedencia independientes. Cada uno incluye su propia versión OCR. Se usa Docker Compose en esta VM dedicada para reutilizar el inicializador y los secretos del Compose ya ensayado; la instalación Podman de la VM compartida y el entorno local se conservan durante la transición. Caddy del host termina HTTPS y renueva certificados. Sólo 80/443 tienen entrada pública; API, PostgreSQL y OCR no publican puertos externos. Administración mediante el agente Azure.

## Costos consultados

API oficial [Azure Retail Prices](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices), USD, Chile Central, 17 de octubre:

| Recurso | Precio consultado | Estimación para 730 h |
| --- | --- | --- |
| B2als v2 Linux | USD 0,0526/h | USD 38,40 |
| SSD E6 LRS, 64 GiB | USD 6,72/mes | USD 6,72 |
| IPv4 pública estándar | USD 0,005/h | USD 3,65 |

Base aproximada: **USD 49/mes**, o **USD 120–130 del 17 de octubre al 31 de diciembre**. Agregar operaciones del disco, tráfico e impuestos aplicables. No hay PostgreSQL administrado, ACR, balanceador ni segunda VM. Un presupuesto de Azure sirve para avisar; **no detiene el consumo**. La fecha `expires` de las etiquetas tampoco apaga recursos. La duración real y el saldo del crédito se verifican en la cuenta, no se deducen del importe inicial.

Los límites suman 3,25 GiB para los seis contenedores; los procesos normalmente consumen menos. Hay consumo adicional del host y del migrador temporal. Medir ambas extracciones simultáneas y durante una entrega antes de acreditar capacidad. Staging comparte CPU/disco con producción. No se promete alta disponibilidad ni ausencia de interrupciones.

## Infraestructura reproducible

`main.bicep` contiene red, NSG, IPv4, VM, identidad y federación. `cloud-init.yaml` prepara Docker Compose y Caddy desde paquetes Ubuntu. El script no instala runners de PR en la VM ni hace builds allí.

Con Azure CLI autenticado exclusivamente en la cuenta de Gael indicada para esta tarea:

```bash
az account show --query '{id:id,user:user.name}'
az group create --name cenit-azure --location chilecentral
az deployment group validate --resource-group cenit-azure \
  --template-file deploy/azure/main.bicep --parameters @.local/azure/parameters.json
az deployment group create --name cenit-initial --resource-group cenit-azure \
  --template-file deploy/azure/main.bicep --parameters @.local/azure/parameters.json
```

El archivo privado de parámetros contiene una clave SSH pública y una versión exacta de Ubuntu; la clave privada permanece en `.local/azure`, ignorada por Git. No habilitar SSH público para las entregas. `config.json` conserva sólo IDs públicos y nombres de recursos obtenidos del output Bicep, sin tokens ni contraseñas.

## GitHub Actions

Tras revisión e integración por PR, un push a `develop`/`main` ejecuta CI completo del SHA integrado, construye/verifica la aplicación, descarga los dos pesos OCR con sus SHA-256 ya existentes, verifica inferencia real sin red y publica ambas imágenes por digest en GHCR. Un fallo impide desplegar.

Azure Login usa OIDC con sujetos exactos `repo:Menderin/Cenit:ref:refs/heads/main` y `repo:Menderin/Cenit:ref:refs/heads/develop`. Los IDs públicos no requieren secretos Azure en GitHub. La identidad tiene Virtual Machine Contributor **sólo sobre esta VM**, no sobre la suscripción. Ese permiso permite ejecutar como root en el host compartido por ambos entornos: se confía en las dos ramas protegidas. No añadir federación para ramas de tarea ni PRs.

`run-command.py` vuelve a exigir repositorio/evento/rama y digests esperados. Envía el token efímero de GHCR como parámetro protegido del agente, nunca como parte del script. El host usa un directorio temporal de autenticación y lo elimina al terminar. No se guardan PAT ni claves Azure permanentes para las entregas.

Las entregas se serializan en el host. Cada entorno rechaza runs anteriores al instalado, verifica las etiquetas OCI de ambas imágenes, conserva las credenciales existentes y crea/verifica `pg_dump` antes del migrador separado. No se ejecutan semillas, cargas de catálogo, cuentas ni resets. Una migración fallida/interrumpida deja `migration-blocked`: revisar el ledger y la base antes de retirar ese marcador explícitamente. Una aplicación fallida intenta recuperar imágenes/configuración anteriores; nunca restaura datos automáticamente. Las imágenes deben conservar compatibilidad con la base tras migrar.

Estado, Compose, credenciales y backups viven en `/opt/cenit/production` o `/opt/cenit/staging`, con acceso privado de root. Los backups locales no protegen frente a pérdida del disco/VM; exportar un respaldo verificado fuera del host antes del retiro definitivo del servidor anterior. No ejecutar `down --volumes`, prune global ni borrar volúmenes para resolver fallos.

El workflow comprueba readiness por HTTPS al terminar. Sin DNS/certificado válido la entrega no se declara exitosa. Primera preparación de cuentas/catálogo o transferencia de datos: operación privada explícita separada, conservando identidades y credenciales; nunca incluirla en CD.

## DNS y transición

En el editor DNS que administra la zona de DigitalPlat, crear dos registros **A** hacia la IPv4 fija confirmada por Azure: nombre `@` y nombre `develop`, TTL 300–3600. Conservar los NS existentes. No asumir que cambiar NS crea esos registros. Antes de modificar otros A/AAAA/CNAME, revisar cuáles existen; un AAAA anterior puede enviar clientes a otro servidor. Para HTTPS directo, ambos nombres deben resolver a la VM y permitir 80/443.

La rama de preparación es `feat/azure-deploy`; no despliega por sí misma. El líder crea/revisa los PR y promueve `develop` a `main`. No se omiten las protecciones para estrenar el servidor.

Antes de retirar la instalación anterior: obtener un respaldo, transferir/verificar cuentas y datos necesarios, comprobar login de los tres roles, búsqueda/guardado/revisión de compras, malla, OCR real, HTTPS y persistencia tras recrear contenedores/reiniciar. Ensayar recuperación de aplicación fallida. Registrar commit/digests, tiempos y memoria de OCR en Chile.

Sólo después, detener los timers y servicios **de Cenit** en la VM compartida. Conservar respaldo y posibilidad de recuperación; no tocar Zableke, Jenkins, Tailscale del host ni borrar la base. Las guías [VM anterior](../README.md), [CI/CD anterior](../CI-CD.md) y [contrato anterior](../CD-VM.md) quedan como referencia de transición; su polling de releases no corresponde al nuevo workflow Azure.

## Evidencia y pendientes

Infraestructura creada: grupo `cenit-azure`, VM `cenit` B2als v2 en Chile Central, IPv4 fija **57.156.63.4**, SSD de 64 GiB, identidad/OIDC para main y develop. Aprovisionamiento Bicep completado; la primera ejecución detectó la restricción de escrituras OIDC concurrentes y se corrigió con `@batchSize(1)`.

Presupuesto Azure `cenit-until-december`: USD 180 trimestrales para octubre-diciembre, avisos al correo de la cuenta en 50/80/100 % (USD 90/144/180). No es un corte automático. Los IDs públicos están en `config.json`.

Pruebas locales: 46 pruebas de infraestructura correctas, sintaxis Bash/Python, Compose y ambos workflows con actionlint. Pendientes: entrega real por Actions tras revisión/integración, transferencia de cuentas/datos, DNS/HTTPS, OCR y recursos en la VM, recuperación y retiro del servidor anterior. Los checks locales no acreditan esos pasos.
