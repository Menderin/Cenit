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

### Acceso web desde fuera de la universidad

Revisión directa por SSH del 13 de octubre de 2026: `cenit-web-tunnel.service` ya estaba instalado, habilitado y activo bajo `adminc`. Ejecuta Cloudflare Quick Tunnel mediante HTTP/2 hacia `http://172.16.13.103:8081`. La URL HTTPS permite abrir Cenit desde un navegador sin instalar Tailscale; publica únicamente la entrada web de Cenit. No proporciona terminal/SSH.

Se verificaron la página «Cenit en preparación» y `/health/proxy` con HTTP 200 a través del enlace HTTPS público de Cloudflare. La revisión posterior encontró Tailscale instalado/conectado en el Mac; por tanto, no se acredita un ensayo desde un cliente sin Tailscale. El Quick Tunnel publica la web para navegadores externos conforme al mecanismo documentado por Cloudflare. PostgreSQL y Nginx de Cenit estaban activos; `/health/ready` local devolvió 503, coherente con la ausencia de aplicación. Los servicios web/remoto estaban habilitados y `Linger=yes`; no se ensayó un reinicio de la VM. La inspección inicial no modificó servicios ni desplegó aplicación; la habilitación posterior de SSH se describe abajo.

Consultar el enlace vigente dentro de SSH, sin sudo:

```bash
systemctl --user show cenit-web-tunnel.service -p ActiveState -p SubState -p NRestarts
grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$HOME/.local/share/cenit/web-tunnel/tunnel.log" | tail -n 1
```

El último enlace del log puede pertenecer a una ejecución anterior: comprobar el estado y probar la URL antes de compartirla. [Quick Tunnel](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) es temporal, no garantiza disponibilidad y cambia de hostname al recrearse. Para un enlace estable, configurar un túnel administrado con cuenta/dominio o evaluar [Tailscale Funnel](https://tailscale.com/docs/features/tailscale-funnel) en una instancia exclusiva de Cenit. Antes de conectar la aplicación, ajustar y verificar su origen HTTPS autorizado y cookies, conforme a [AUTENTICACION.md](../Docs/AUTENTICACION.md).

También existe `cenit-remote.service`, una instancia separada de Tailscale con red en espacio de usuario, estado privado y socket `$XDG_RUNTIME_DIR/cenit-remote/tailscaled.sock`. En esta revisión estaba activa pero desconectada de su cuenta (`Logged out`), sin configuración Serve: no acredita acceso remoto por SSH. El Tailscale del host pertenece a otro proyecto y se conserva. No compartir la red universitaria ni modificar esa instancia para resolver el acceso de Cenit.

Gael confirmó el 13 de octubre dos necesidades: web desde cualquier navegador con un futuro dominio de la U, y administración por SSH desde casa. Solicitud técnica propuesta para TI: «Subdominio público de Cenit con certificado HTTPS y proxy inverso institucional hacia `http://172.16.13.103:8081`, conservando rutas web/API y Host. La demo usa datos ficticios». El nombre y la configuración dependen de TI; DNS apuntando directamente a la IP privada no habilita acceso desde Internet. Si TI elige Cloudflare Tunnel, coordinar una zona admitida por la cuenta y sus registros/certificado: un subdominio aislado no acredita esa configuración. [Cloudflare documenta la integración DNS completa/parcial](https://developers.cloudflare.com/cloudflare-one/faq/cloudflare-tunnels-faq/); la [modalidad parcial requiere Business o Enterprise](https://developers.cloudflare.com/dns/zone-setups/partial-setup/). No modificar DNS institucional desde este checkout.

Para SSH, vincular únicamente la instancia de Cenit a la cuenta del equipo mediante el enlace interactivo generado por este comando, dentro de la VM:

```bash
tailscale --socket="$XDG_RUNTIME_DIR/cenit-remote/tailscaled.sock" up --hostname=cenit-vm --accept-dns=false --accept-routes=false --ssh=false --timeout=15s
```

Después de completar el login, comprobar `status` y habilitar [Serve TCP](https://tailscale.com/docs/reference/tailscale-cli/serve) hacia el OpenSSH existente:

```bash
tailscale --socket="$XDG_RUNTIME_DIR/cenit-remote/tailscaled.sock" status
tailscale --socket="$XDG_RUNTIME_DIR/cenit-remote/tailscaled.sock" serve --bg --tcp=22 tcp://127.0.0.1:22
tailscale --socket="$XDG_RUNTIME_DIR/cenit-remote/tailscaled.sock" serve status
```

El acceso conserva la autenticación de OpenSSH. Los integrantes necesitan instalar/iniciar Tailscale una vez y recibir acceso al dispositivo mediante la consola de su propietario; no compartir contraseñas de Tailscale. Desde otro equipo conectado y autorizado, probar `ssh adminc@<IP-Tailscale-de-Cenit>` con la IP que devuelva `status`, comprobar la identidad de la VM y repetir desde una conexión externa. No usar la IP Tailscale del otro proyecto. No anunciar subredes ni exit node ni publicar SSH por el túnel web.

Estado actualizado del 13 de octubre: Gael completó el login. `cenit-vm` obtuvo `100.116.229.120` y `cenit-vm.tail44b08c.ts.net`. Se habilitó Serve TCP `22 → 127.0.0.1:22`, sólo dentro de Tailscale. Desde el Mac de Gael se completó SSH a esa IP y se comprobó `vm-eic-202610-4G`, usuario `adminc` y servicios remoto/Nginx/PostgreSQL activos. La clave SSH se contrastó con la obtenida por el acceso institucional. Tailscale respondió mediante DERP; que no se establezca una ruta directa no impide SSH por relay. Las preferencias verificadas no aceptan rutas/DNS de Tailscale, no anuncian subredes ni tienen exit node. El reenvío se conservó al reiniciar exclusivamente `cenit-remote.service`.

Con Tailscale conectado y acceso concedido, usar desde casa:

```bash
ssh adminc@100.116.229.120
```

Falta ensayar desde una conexión doméstica/móvil y tras reiniciar la VM; la prueba desde el Mac actual acredita el recorrido por Tailscale, no la red de casa. Para compañeros, el propietario puede [compartir sólo este dispositivo](https://tailscale.com/docs/features/sharing) con cada integrante en la consola Tailscale y verificar SSH desde sus equipos; no se enviaron invitaciones en esta sesión.

#### Página web privada con Tailscale

El 13 de octubre se agregó al Quadlet de Cenit `PublishPort=127.0.0.1:8081:8080`, conservando `172.16.13.103:8081`; ambos respondieron HTTP 200 desde la VM. Gael habilitó HTTPS certificates en la consola Tailscale, con Funnel desmarcado. La VM publica `https://cenit-vm.tail44b08c.ts.net` sólo al tailnet y el estado conserva Serve TCP `22 → 127.0.0.1:22`. Desde Safari conectado a Tailscale se abrió `/login` y se mostró el formulario de inicio de sesión. La carga inicial mostró un error temporal al comprobar la sesión; al pulsar «Reintentar» apareció el formulario.

Comprobar el estado en la VM con:

```bash
tailscale --socket="$XDG_RUNTIME_DIR/cenit-remote/tailscaled.sock" serve --bg --https=443 http://127.0.0.1:8081
tailscale --socket="$XDG_RUNTIME_DIR/cenit-remote/tailscaled.sock" serve status
curl --max-time 5 -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8081/
```

Desde un dispositivo conectado y autorizado en el tailnet, abrir `https://cenit-vm.tail44b08c.ts.net`. El nombre del dispositivo queda publicado en el registro de certificados de Tailscale; Funnel sigue deshabilitado. Mantener ambas líneas `PublishPort` en esta plantilla y en la unidad instalada.

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

La configuración vigente usa `rama de tarea → develop → main`, mediante PR y CI. Sólo el push integrado a `main` autoriza entrega: CI del commit integrado y build verificado → release por digest en GHCR → servicio/timer rootless de la VM que verifica/despliega. El timer instalado consulta cada dos minutos tras finalizar la operación anterior. El publicador del repo está preparado, pero aplicación y ensayo real siguen pendientes. El ejecutor instalado todavía valida `produccion` hasta actualizarlo el martes 13; mantener publicación deshabilitada. Ver [transición, protecciones y pendientes](CI-CD.md).

El usuario eligió GitHub Actions y despliegue iniciado desde la VM. No hace falta otro Jenkins ni dar acceso entrante al runner alojado. La topología preparada se conserva; la conexión de CD se completa con la aplicación y las credenciales de lectura.

Recursos compartidos por el usuario para evaluar un Jenkins propio: 3,6 GiB de RAM total, 1,7 GiB disponible y alrededor de 13 GiB de disco libre; 8082 estaba libre. Estos recursos justifican mantener CI en runners alojados de GitHub Actions y despliegue acotado en la VM. No se instaló una segunda instancia Jenkins.

Pendientes que no bloquean preparar la infraestructura: aplicación y migraciones, rol runtime de API, pipeline, subdominio/HTTPS y pruebas de arranque tras reinicio. Pendientes a comprobar durante esta instalación: generación de Quadlet, descarga de imágenes, recursos disponibles y acceso desde el equipo cliente. No declarar el entorno listo hasta que las comprobaciones hayan pasado.

Referencias oficiales:

- [Quadlet en Podman 5.6](https://docs.podman.io/en/v5.6.0/markdown/podman-systemd.unit.5.html)
- [Imágenes oficiales de Nginx](https://github.com/docker-library/official-images/blob/master/library/nginx)
- [Imágenes oficiales de PostgreSQL](https://github.com/docker-library/official-images/blob/master/library/postgres)
- [Opciones firewalld](https://firewalld.org/documentation/man-pages/firewall-cmd.html)
