# Infraestructura de Cenit en la VM compartida

Para preparar PostgreSQL/proxy en el equipo de desarrollo, usar [LOCAL.md](LOCAL.md) y `compose.yaml`. La VM mantiene Quadlet rootless; el Compose local no se instala allí. El repositorio incorpora Containerfile, migrador y workflow de release, pero la aplicación y el ensayo real de despliegue siguen pendientes.

Estado: el usuario ejecutó el instalador en la VM y compartió una salida exitosa el 10 de octubre de 2026: validación Nginx correcta, comprobaciones de PostgreSQL completadas y `/health/proxy` con `status: ok`, `mode: bootstrap`. También compartió la misma respuesta HTTP desde Windows, confirmando acceso efectivo a 8081 desde su equipo. No se recibió la salida de consulta de la regla permanente ni se comprobó continuidad tras cerrar SSH o reiniciar. No hay una versión de la aplicación desplegada.

## Preparar el entorno ahora, sin aplicación estable

Podemos instalar la infraestructura y comprobar acceso antes de terminar el MVP. El modo inicial sirve una página de “Cenit en preparación” con Nginx y prepara una base PostgreSQL vacía y persistente. No requiere `cenit-app`.

```text
http://172.16.13.103:8081
  -> cenit-nginx (Podman, página temporal, puerto interno 8080)
cenit-db:5432 (Podman, base cenit_demo, volumen propio, sin puerto publicado)
```

Servicios rootless bajo `adminc`, gestionados por Quadlet/systemd. Zableke sigue en Docker en 80/443 y Jenkins en 8080. El Nginx instalado en el host permanece inactivo.

### 1. Copiar los archivos a la VM

Estos archivos existen en el workspace local; no se ha realizado commit ni push. Desde PowerShell en Windows:

```powershell
ssh adminc@172.16.13.103 "mkdir -p ~/Cenit"
scp -r "C:\Users\vjopi\OneDrive\Documentos\GitHub\Cenit\deploy" "adminc@172.16.13.103:~/Cenit/"
```

Esto deja los archivos en `~/Cenit/deploy`; no necesita clonar ni publicar cambios. Para copiar desde otra ubicación, ajustar la ruta local.

### 2. Instalar en la sesión SSH

```bash
sudo loginctl enable-linger adminc
bash ~/Cenit/deploy/scripts/bootstrap-vm.sh
```

Linger mantiene el gestor systemd del usuario después de cerrar SSH y permite iniciarlo al arrancar la VM. Los Quadlets usan `WantedBy=default.target`; no ejecutar `systemctl enable` sobre los servicios generados.

El script:

- Comprueba cgroups v2, systemd de usuario, linger, puerto, propiedad de recursos y disponibilidad mínima de disco/memoria.
- Descarga imágenes oficiales con tags exactos: Nginx `1.30.5-alpine` y PostgreSQL `17.11-alpine3.24`; guarda el digest y lo utiliza en las unidades. No actualiza imágenes automáticamente al repetir la instalación.
- Crea una contraseña aleatoria fuera de Git y un secreto Podman, sin imprimirla.
- Prepara red `cenit-net`, volumen `cenit-postgres-data` y unidades de usuario `cenit-nginx.service` y `cenit-db.service`.
- Valida el Nginx temporal con `nginx -t`, consulta PostgreSQL y comprueba `/health/proxy`.
- Limita Nginx a 128 MiB/0,5 CPU y PostgreSQL a 512 MiB/1 CPU; son límites iniciales, ajustables después de medir.
- Conserva la base, contraseñas e imágenes al repetirlo en modo preparación. Rechaza recursos ajenos y se detiene si detecta que el proxy ya pasó a modo aplicación.
- No ejecuta sudo, no modifica Docker, Nginx del host ni firewalld, no reinicia la VM y no instala paquetes.

El script puede fallar si la sesión rootless, el registro de imágenes, los recursos o Quadlet no están disponibles. En ese caso revisar la salida antes de cambiar servicios. No repetir con sudo: eso crea otro ámbito de contenedores.

### 3. Permitir el puerto de Cenit de forma persistente

La interfaz `ens18` pertenece a `public`; `docker` contiene bridges Docker y `trusted` contiene `tailscale0`. Consultar la configuración vigente antes de agregar la regla:

```bash
sudo firewall-cmd --zone=public --list-all
sudo firewall-cmd --zone=public --query-port=8081/tcp
sudo firewall-cmd --permanent --zone=public --query-port=8081/tcp
```

Después de que el script haya comprobado el proxy local, agregar únicamente 8081/tcp en runtime y configuración persistente:

```bash
sudo firewall-cmd --zone=public --add-port=8081/tcp
sudo firewall-cmd --permanent --zone=public --add-port=8081/tcp
```

No hace falta `--reload`. Si existe una apertura temporal previa de 8081 creada para Cenit, retirar esa regla temporal y volver a agregar la regla runtime sin timeout; de lo contrario el timer previo podría cerrar el acceso hasta el siguiente arranque. No retirar reglas previas que no pertenezcan a este trabajo. No modificar las zonas Docker/Tailscale ni convertir todas las reglas runtime del host en permanentes.

La regla permite tráfico al puerto desde orígenes que alcancen esa interfaz y estén permitidos por el resto de políticas de red. El proxy se publica sólo en `172.16.13.103:8081`. No añadir rangos de origen inventados; si la escuela exige limitar clientes/subredes, obtenerlos y aplicar una regla específica antes de ampliar el acceso. Esta preparación usa datos ficticios y no habilita datos institucionales.

### 4. Comprobar desde Windows y cerrar la sesión

Desde PowerShell:

```powershell
Test-NetConnection 172.16.13.103 -Port 8081
Invoke-RestMethod 'http://172.16.13.103:8081/health/proxy'
Start-Process 'http://172.16.13.103:8081'
```

Esperar TCP exitoso, `{ status: "ok", mode: "bootstrap" }` y la página temporal. `/health/ready` y `/api` devuelven 503 porque la aplicación todavía no existe. El éxito de `/health/proxy` no acredita compras, malla ni API funcionando.

Cerrar SSH y comprobar nuevamente la URL desde Windows acredita que la sesión interactiva no es necesaria. El arranque tras reinicio está configurado mediante linger y Quadlet, pero sólo se acredita después de probarlo en una ventana acordada: no reiniciar ahora una VM compartida para comprobarlo.

## Archivos instalados y operación

- `~/.config/containers/systemd/`: Quadlets gestionados con prefijo Cenit.
- `~/.local/share/cenit/nginx/default.conf`: configuración activa independiente del checkout.
- `~/.local/share/cenit/html/`: página temporal.
- `~/.local/share/cenit/images/`: referencias fijadas por digest, no secretos.
- `~/.local/share/cenit/secrets/`: contraseña privada, permisos restringidos; nunca copiar a Git o al chat.
- Volumen Podman `cenit-postgres-data`: datos persistentes fuera del checkout.

Comandos de diagnóstico:

```bash
systemctl --user status cenit-nginx.service cenit-db.service --no-pager
podman ps --format 'table {{.Names}}\t{{.Ports}}'
journalctl --user -u cenit-nginx.service -n 50 --no-pager
journalctl --user -u cenit-db.service -n 50 --no-pager
podman exec cenit-db pg_isready -U cenit_admin -d cenit_demo
```

Si una unidad no se genera:

```bash
/usr/lib/systemd/system-generators/podman-system-generator --user --dryrun
```

No administrar estos contenedores mediante `sudo podman` ni combinarlos con arranques manuales `podman run --name cenit-nginx`. Tampoco borrar volumen o secreto para corregir un fallo. `cenit_admin` es el administrador de inicialización de PostgreSQL: antes de conectar la aplicación, crear su rol con privilegios acotados y su secreto propio. No usar esa cuenta administradora como credencial runtime de la API.

## Cuando exista una versión desplegable

Mantener la entrada 8081, red, base y servicios. Añadir un Quadlet `cenit-app` con una imagen identificable por release/digest, sin publicar su puerto 3000. Configurar secretos y rol de aplicación, aplicar las migraciones y comprobar readiness dentro de la red.

La configuración preparada en `nginx/cenit.conf` sustituirá la temporal `nginx/bootstrap.conf`. Validarla en un contenedor de prueba conectado a `cenit-net` cuando `cenit-app` resuelva, respaldar el archivo activo y sustituirlo. Coordinar las dependencias de la unidad Nginx para que la aplicación se inicie antes del proxy en cada arranque. Reiniciar sólo `cenit-nginx.service` para montar el archivo nuevo y verificar rutas web/API.

Ese archivo usa `proxy_pass http://cenit-app:3000`, conserva `/compras`, `/academico` y `/api/v1`, limita el body a 128 KiB y devuelve errores de tamaño en JSON. Host conserva el puerto externo con `$http_host`. No confiar en headers de proxy desde cualquier origen; definir el origen externo si se incorporan redirects o URLs absolutas.

Al recrear `cenit-app` puede cambiar su IP: validar y reiniciar el proxy de Cenit para volver a resolverla. No modificar el proxy de Zableke. Antes de cambiar el esquema, considerar respaldo y compatibilidad: volver a una imagen no revierte una migración.

## CI/CD automático y pendientes

Requisito del usuario: después de superar las pruebas e integrar cambios en la rama de entrega, la VM debe desplegar automáticamente. No se prevé ejecutar `git pull`, construir ni actualizar contenedores manualmente en cada entrega.

La configuración de trabajo usa `feature/* → main → produccion`, mediante PR y CI. Sólo el merge a `produccion` autoriza una entrega: CI del commit integrado y build verificado → release con digest en GHCR → servicio/timer rootless en la VM que verifica y despliega la release. La consulta periódica necesita sólo conexiones salientes; el intervalo propuesto es un minuto, ajustable al implementar. Las pruebas fallidas no producen una release autorizada. El despliegue conserva la base, serializa cambios y comprueba la nueva aplicación antes de declarar éxito. Se preparó el workflow CI local; el CD todavía no está implementado y en la VM sólo está activo el bootstrap. Ver [activación, reglas de ramas y pendientes](CI-CD.md).

El usuario eligió GitHub Actions y despliegue iniciado desde la VM. No hace falta otro Jenkins ni dar acceso entrante al runner alojado. La topología preparada se conserva; la conexión de CD se completa con la aplicación y las credenciales de lectura.

Recursos compartidos por el usuario para evaluar un Jenkins propio: 3,6 GiB de RAM total, 1,7 GiB disponible y alrededor de 13 GiB de disco libre; 8082 estaba libre. Estos recursos justifican mantener CI en runners alojados de GitHub Actions y despliegue acotado en la VM. No se instaló una segunda instancia Jenkins.

Pendientes que no bloquean preparar la infraestructura: aplicación y migraciones, rol runtime de API, pipeline, subdominio/HTTPS y pruebas de arranque tras reinicio. Pendientes a comprobar durante esta instalación: generación de Quadlet, descarga de imágenes, recursos disponibles y acceso desde el equipo cliente. No declarar el entorno listo hasta que las comprobaciones hayan pasado.

Referencias oficiales:

- [Quadlet en Podman 5.6](https://docs.podman.io/en/v5.6.0/markdown/podman-systemd.unit.5.html)
- [Imágenes oficiales de Nginx](https://github.com/docker-library/official-images/blob/master/library/nginx)
- [Imágenes oficiales de PostgreSQL](https://github.com/docker-library/official-images/blob/master/library/postgres)
- [Opciones firewalld](https://firewalld.org/documentation/man-pages/firewall-cmd.html)
