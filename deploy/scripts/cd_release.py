# Managed by Cenit: verify immutable workflow artifacts before selecting an image.
import hashlib
import io
import json
import re
import urllib.error
import urllib.parse
import urllib.request
import zipfile

from github_read import API_ROOT, GitHubReadError, REPOSITORY

WORKFLOW_PATH = '.github/workflows/release.yml'
MANIFEST_FILE = 'cenit-release.json'
MANIFEST_KEYS = {
    'schemaVersion', 'repository', 'branch', 'commit', 'image', 'workflowRunId',
    'workflowRunAttempt', 'runNumber', 'migrationPolicy',
}
SHA = re.compile(r'[0-9a-f]{40}')
IMAGE = re.compile(r'ghcr\.io/menderin/cenit@sha256:[0-9a-f]{64}')
REQUIRED_JOBS = {'CI / CI required', 'CI / Application', 'Publish image'}


def require(condition, message):
    if not condition:
        raise GitHubReadError(message)


def validate_manifest(manifest):
    require(isinstance(manifest, dict) and set(manifest) == MANIFEST_KEYS, 'Manifiesto inválido.')
    require(type(manifest['schemaVersion']) is int and manifest['schemaVersion'] == 1, 'Versión de manifiesto inválida.')
    require(manifest['repository'] == REPOSITORY and manifest['branch'] == 'produccion', 'Origen de entrega inválido.')
    require(isinstance(manifest['commit'], str) and SHA.fullmatch(manifest['commit']), 'Commit inválido.')
    require(isinstance(manifest['image'], str) and IMAGE.fullmatch(manifest['image']), 'Se requiere imagen Cenit por digest.')
    for key in ('workflowRunId', 'workflowRunAttempt', 'runNumber'):
        require(type(manifest[key]) is int and manifest[key] > 0, 'Identificador de ejecución inválido.')
    require(manifest['migrationPolicy'] == 'backward-compatible', 'La migración debe ser compatible con la imagen anterior.')
    return manifest


def validate_run(run, workflow, commit, attempt):
    require(workflow.get('path') == WORKFLOW_PATH and run.get('workflow_id') == workflow.get('id'), 'Workflow de entrega incorrecto.')
    require(run.get('event') == 'push' and run.get('head_branch') == 'produccion', 'La ejecución no es un push a produccion.')
    require(run.get('head_sha') == commit and run.get('run_attempt') == attempt, 'Commit o intento no corresponde.')
    require(run.get('head_repository', {}).get('full_name') == REPOSITORY, 'Repositorio de ejecución incorrecto.')
    require(run.get('status') == 'completed' and run.get('conclusion') == 'success', 'La entrega aún no terminó con éxito.')


def artifact_manifest(archive, digest):
    require(isinstance(digest, str) and re.fullmatch(r'sha256:[0-9a-f]{64}', digest), 'Falta digest del artefacto de Actions.')
    require('sha256:' + hashlib.sha256(archive).hexdigest() == digest, 'El artefacto no coincide con su digest.')
    try:
        with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
            require(bundle.namelist() == [MANIFEST_FILE], 'El artefacto debe contener sólo cenit-release.json.')
            info = bundle.getinfo(MANIFEST_FILE)
            require(info.file_size <= 16384, 'Manifiesto demasiado grande.')
            return validate_manifest(json.loads(bundle.read(info)))
    except (zipfile.BadZipFile, ValueError, UnicodeError, RuntimeError) as error:
        raise GitHubReadError('Artefacto de entrega inválido.') from error


def download_artifact(client, artifact_id):
    require(type(artifact_id) is int and artifact_id > 0, 'ID de artefacto inválido.')
    request = urllib.request.Request(API_ROOT + f'/actions/artifacts/{artifact_id}/zip', headers={
        'Authorization': 'Bearer ' + client.token,
        'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Cenit-VM-CD',
    })
    try:
        try:
            response = client.opener.open(request, timeout=20)
        except urllib.error.HTTPError as error:
            require(error.code == 302, 'No se puede descargar el artefacto autorizado.')
            location = error.headers.get('Location', '')
            error.close()
            parsed = urllib.parse.urlsplit(location)
            require(parsed.scheme == 'https' and parsed.hostname and not parsed.username and not parsed.password, 'Redirección de artefacto inválida.')
            # Follow only the API-provided signed URL, without the GitHub token.
            # No further redirects are accepted, including HTTPS -> HTTP.
            response = client.opener.open(urllib.request.Request(location), timeout=20)
        with response:
            data = response.read(2 * 1024 * 1024 + 1)
        require(len(data) <= 2 * 1024 * 1024, 'Artefacto demasiado grande.')
        return data
    except (urllib.error.URLError, OSError, TimeoutError, ValueError) as error:
        raise GitHubReadError('No se pudo descargar el artefacto con TLS válido.') from error


def approved_release(client):
    releases = client.get('/releases?per_page=20')
    require(isinstance(releases, list), 'Listado de releases inválido.')
    candidates = [r for r in releases if isinstance(r, dict) and not r.get('draft')
                  and not r.get('prerelease') and re.fullmatch(r'cenit-[0-9a-f]{40}', r.get('tag_name', ''))]
    if not candidates:
        return None
    release = max(candidates, key=lambda r: r.get('published_at') or r.get('created_at', ''))
    commit = release['tag_name'][6:]
    try:
        pointer = json.loads(release.get('body', ''))
    except (ValueError, TypeError) as error:
        raise GitHubReadError('La release no contiene un puntero de ejecución válido.') from error
    require(isinstance(pointer, dict) and set(pointer) == {'workflowRunId', 'workflowRunAttempt'}, 'Puntero de release inválido.')
    run_id, attempt = pointer['workflowRunId'], pointer['workflowRunAttempt']
    require(type(run_id) is int and run_id > 0 and type(attempt) is int and attempt > 0, 'Puntero de ejecución inválido.')
    workflow = client.get('/actions/workflows/release.yml')
    run = client.get(f'/actions/runs/{run_id}')
    validate_run(run, workflow, commit, attempt)
    comparison = client.get(f'/compare/{commit}...produccion')
    require(comparison.get('status') in ('ahead', 'identical') and comparison.get('merge_base_commit', {}).get('sha') == commit, 'El commit no pertenece a la historia de produccion.')
    jobs = client.get(f'/actions/runs/{run_id}/attempts/{attempt}/jobs?per_page=100')
    require(jobs.get('total_count', 101) <= 100, 'Demasiados jobs para verificar la entrega.')
    successful = {job.get('name') for job in jobs.get('jobs', []) if job.get('conclusion') == 'success'}
    require(REQUIRED_JOBS <= successful, 'Faltan gates exitosos de aplicación/publicación.')
    artifacts = client.get(f'/actions/runs/{run_id}/artifacts?per_page=100')
    require(artifacts.get('total_count', 101) <= 100, 'Demasiados artefactos para verificar la entrega.')
    matches = [a for a in artifacts.get('artifacts', []) if a.get('name') == f'cenit-release-{attempt}' and not a.get('expired')]
    require(len(matches) == 1, 'Falta el artefacto inmutable de la entrega o expiró.')
    artifact = matches[0]
    source = artifact.get('workflow_run', {})
    require(source.get('id') == run_id and source.get('head_sha') == commit and source.get('head_branch') == 'produccion', 'Artefacto de otro origen.')
    manifest = artifact_manifest(download_artifact(client, artifact.get('id')), artifact.get('digest'))
    require(manifest['commit'] == commit and manifest['workflowRunId'] == run_id
            and manifest['workflowRunAttempt'] == attempt and manifest['runNumber'] == run.get('run_number'), 'Manifiesto de otra ejecución.')
    return manifest
