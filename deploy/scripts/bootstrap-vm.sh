#!/usr/bin/env bash
# Install only Cenit rootless infrastructure. Run as the account that will own it.
set -Eeuo pipefail
umask 077

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
trap 'printf "Instalación interrumpida. Revisa el error anterior; no se eliminaron volúmenes ni datos.\n" >&2' ERR

[[ $(id -u) -ne 0 ]] || fail 'Ejecuta este script sin sudo, bajo adminc.'
deploy_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
state_dir="$HOME/.local/share/cenit"
unit_dir="$HOME/.config/containers/systemd"
[[ $state_dir != *[[:space:]\|\&]* ]] || fail 'La ruta del usuario contiene caracteres no soportados por las plantillas.'

for command_name in podman systemctl loginctl ss curl od tr sed grep install df awk; do
  command -v "$command_name" >/dev/null || fail "Falta el comando $command_name; no se instalarán paquetes automáticamente."
done
[[ $(podman info --format '{{.Host.CgroupsVersion}}') == v2 ]] || fail 'Quadlet requiere cgroups v2.'
systemctl --user show-environment >/dev/null || fail 'La sesión systemd de usuario no está disponible.'
[[ $(loginctl show-user "$(id -un)" --property=Linger --value) == yes ]] ||
  fail 'Primero ejecuta: sudo loginctl enable-linger adminc'

available_kib=$(df -Pk "$HOME" | awk 'NR == 2 { print $4 }')
[[ $available_kib -ge 1048576 ]] || fail 'Se requiere al menos 1 GiB libre para la instalación inicial.'
available_memory_kib=$(awk '/^MemAvailable:/ { print $2 }' /proc/meminfo)
[[ $available_memory_kib -ge 716800 ]] || fail 'Se requieren al menos 700 MiB de memoria disponible; revisa recursos de la VM compartida.'

for resource_name in cenit-nginx cenit-db; do
  if [[ -f "$unit_dir/$resource_name.container" ]]; then
    grep -Fxq '# Managed by Cenit bootstrap-vm.sh' "$unit_dir/$resource_name.container" ||
      fail "Ya existe una unidad $resource_name ajena a este instalador."
  elif podman container exists "$resource_name"; then
    fail "Ya existe un contenedor $resource_name sin unidad gestionada por este instalador."
  fi
done
for unit_name in cenit.network cenit-postgres.volume; do
  if [[ -f "$unit_dir/$unit_name" ]]; then
    grep -Fxq '# Managed by Cenit bootstrap-vm.sh' "$unit_dir/$unit_name" ||
      fail "Ya existe $unit_name ajeno a este instalador."
  fi
done
if podman network exists cenit-net && [[ ! -f "$unit_dir/cenit.network" ]]; then
  fail 'Ya existe cenit-net; inspecciona su propiedad y configuración antes de continuar.'
fi
if podman volume exists cenit-postgres-data && [[ ! -f "$unit_dir/cenit-postgres.volume" ]]; then
  fail 'Ya existe cenit-postgres-data; este instalador no adopta volúmenes desconocidos.'
fi
if [[ -n $(ss -H -ltn 'sport = :8081') ]] &&
   ! systemctl --user is-active --quiet cenit-nginx.service; then
  fail '8081 ya está ocupado por un servicio que no es el Nginx Cenit gestionado.'
fi
if [[ -f "$state_dir/nginx/default.conf" ]]; then
  grep -Fxq '# Cenit infrastructure bootstrap. Do not confuse proxy health with app readiness.' "$state_dir/nginx/default.conf" ||
    fail 'El proxy ya salió del modo bootstrap; no se sustituirá su configuración.'
fi

install -d -m 700 "$state_dir" "$state_dir/nginx" "$state_dir/html" "$state_dir/secrets" "$state_dir/images" "$unit_dir"
# Nginx workers must traverse the mounted HTML directory; its host parent stays private.
chmod 755 "$state_dir/html"

pin_image() {
  local source_image=$1 lock_file=$2 expected_repository=$3 pinned_image
  if [[ -f $lock_file ]]; then
    pinned_image=$(cat "$lock_file")
  else
    printf 'Descargando %s y fijando su digest...\n' "$source_image" >&2
    podman pull --quiet "$source_image" >/dev/null || return 1
    pinned_image=$(podman image inspect --format '{{index .RepoDigests 0}}' "$source_image") || return 1
  fi
  [[ $pinned_image == "$expected_repository"@sha256:* &&
     ${pinned_image#"$expected_repository"@sha256:} =~ ^[a-f0-9]{64}$ ]] || {
    printf 'Referencia de imagen inválida para %s\n' "$expected_repository" >&2
    return 1
  }
  podman image exists "$pinned_image" || podman pull --quiet "$pinned_image" >/dev/null || return 1
  printf '%s\n' "$pinned_image" > "$lock_file"
  printf '%s' "$pinned_image"
}

nginx_image=$(pin_image 'docker.io/library/nginx:1.30.5-alpine' "$state_dir/images/nginx.ref" 'docker.io/library/nginx')
postgres_image=$(pin_image 'docker.io/library/postgres:17.11-alpine3.24' "$state_dir/images/postgres.ref" 'docker.io/library/postgres')

if ! podman secret inspect cenit-postgres-password >/dev/null 2>&1; then
  [[ ! -f "$unit_dir/cenit-db.container" ]] || fail 'La base instalada perdió su secreto; recuperar el original, no generar otra contraseña.'
  if [[ ! -f "$state_dir/secrets/postgres-password" ]]; then
    od -An -N32 -tx1 /dev/urandom | tr -d ' \n' > "$state_dir/secrets/postgres-password"
  fi
  [[ $(wc -c < "$state_dir/secrets/postgres-password") -eq 64 ]] || fail 'Archivo de contraseña inesperado; revisar sin mostrar su contenido.'
  chmod 600 "$state_dir/secrets/postgres-password"
  podman secret create cenit-postgres-password "$state_dir/secrets/postgres-password" >/dev/null
fi

install -m 644 "$deploy_dir/nginx/bootstrap.conf" "$state_dir/nginx/default.conf"
install -m 644 "$deploy_dir/bootstrap/index.html" "$state_dir/html/index.html"
printf 'Validando Nginx sin publicar puertos...\n'
podman run --rm --network none \
  --volume "$state_dir/nginx/default.conf:/etc/nginx/conf.d/default.conf:ro,Z" \
  --volume "$state_dir/html:/usr/share/nginx/html:ro,Z" \
  "$nginx_image" nginx -t

install -m 600 "$deploy_dir/quadlet/cenit.network" "$unit_dir/cenit.network"
install -m 600 "$deploy_dir/quadlet/cenit-postgres.volume" "$unit_dir/cenit-postgres.volume"
sed -e "s|@POSTGRES_IMAGE@|$postgres_image|g" \
  "$deploy_dir/quadlet/cenit-db.container.in" > "$unit_dir/cenit-db.container"
sed -e "s|@NGINX_IMAGE@|$nginx_image|g" -e "s|@STATE_DIR@|$state_dir|g" \
  "$deploy_dir/quadlet/cenit-nginx.container.in" > "$unit_dir/cenit-nginx.container"
systemctl --user daemon-reload
systemctl --user start cenit-db.service

database_ready=false
for ((attempt = 0; attempt < 30; attempt++)); do
  if podman exec cenit-db pg_isready -U cenit_admin -d cenit_demo >/dev/null 2>&1; then
    database_ready=true
    break
  fi
  sleep 2
done
[[ $database_ready == true ]] || fail 'PostgreSQL no respondió; revisa: journalctl --user -u cenit-db.service -n 50'
podman exec cenit-db psql -U cenit_admin -d cenit_demo -Atc 'SELECT 1' | grep -Fxq 1 ||
  fail 'No se pudo consultar la base ficticia.'
systemctl --user restart cenit-nginx.service
curl --retry 5 --retry-connrefused --retry-delay 1 --retry-max-time 20 \
  --connect-timeout 2 --max-time 5 --fail --silent --show-error \
  http://172.16.13.103:8081/health/proxy
printf '\nInfraestructura Cenit activa en modo preparación. No hay aplicación desplegada.\n'
printf 'Imágenes fijadas en %s/images; secretos privados en %s/secrets.\n' "$state_dir" "$state_dir"
printf 'El script no cambió Docker, Nginx del host ni firewalld.\n'
