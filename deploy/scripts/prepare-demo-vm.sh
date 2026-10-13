#!/usr/bin/env bash
# Explicit demo account preparation; never called by migrations or CD.
set -Eeuo pipefail
umask 077
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[[ $(id -u) -ne 0 ]] || fail 'Ejecuta sin sudo, bajo adminc.'
[[ $# == 1 && $1 =~ ^localhost/cenit-demo-tools:[a-f0-9]{40}$ ]] || fail 'Indica localhost/cenit-demo-tools:<SHA completo desplegado>.'
image=$1
state_dir="$HOME/.local/share/cenit"
[[ -f $state_dir/cd/current.json ]] || fail 'Primero debe finalizar una entrega verificada.'
commit=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["commit"])' "$state_dir/cd/current.json")
[[ ${image##*:} == "$commit" ]] || fail 'La herramienta debe corresponder al commit desplegado.'
[[ $(podman image inspect --format '{{index .Labels "org.opencontainers.image.revision"}}' "$image") == "$commit" ]] || fail 'Revisión de imagen incompatible.'
[[ $(podman image inspect --format '{{index .Labels "org.opencontainers.image.source"}}' "$image") == 'https://github.com/Menderin/Cenit' ]] || fail 'Origen de imagen incompatible.'
podman network exists cenit-net || fail 'Falta la red Cenit.'
[[ ! -L $state_dir && ! -L $state_dir/demo-local ]] || fail 'No utilizar enlaces para el estado privado.'
install -d -m 700 "$state_dir/demo-local"
# keep-id preserves ownership of private files on the host, without giving runtime credentials for migrations.
podman run --rm --pull=never --userns=keep-id --user "$(id -u):$(id -g)" \
  --network cenit-net --cap-drop=all --security-opt=no-new-privileges \
  --memory=512m --cpus=1 \
  --secret "cenit-migration-database-url,type=mount,target=database-url,uid=$(id -u),gid=$(id -g),mode=0400" \
  --volume "$state_dir/demo-local:/app/.local:Z" \
  --env APP_ENV=demo --env DATABASE_URL_FILE=/run/secrets/database-url \
  "$image" npm run auth:prepare-demo
printf 'Cuentas de demo preparadas/verificadas; no se rotaron. Archivo privado: %s/demo-local/secrets/auth-demo.json\n' "$state_dir"
