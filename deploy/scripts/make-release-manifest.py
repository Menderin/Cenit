"""Create publisher metadata using the exact VM consumer contract."""
import argparse
import json
import os
from pathlib import Path
from cd_release import validate_manifest


def make_manifest(environment, image):
    manifest = {
        'schemaVersion': 1,
        'repository': environment['GITHUB_REPOSITORY'],
        'branch': environment['GITHUB_REF_NAME'],
        'commit': environment['GITHUB_SHA'],
        'image': image,
        'workflowRunId': int(environment['GITHUB_RUN_ID']),
        'workflowRunAttempt': int(environment['GITHUB_RUN_ATTEMPT']),
        'runNumber': int(environment['GITHUB_RUN_NUMBER']),
        'migrationPolicy': 'backward-compatible',
    }
    if environment.get('GITHUB_EVENT_NAME') != 'push':
        raise ValueError('Only a push can publish a release.')
    return validate_manifest(manifest)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--image', required=True)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    manifest = make_manifest(os.environ, args.image)
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / 'cenit-release.json').write_text(json.dumps(manifest) + '\n', encoding='utf-8')
    # Keep the release pointer out of the artifact: the consumer accepts exactly one ZIP member.
    pointer = {'workflowRunId': manifest['workflowRunId'], 'workflowRunAttempt': manifest['workflowRunAttempt']}
    (args.output.parent / 'release-pointer.json').write_text(json.dumps(pointer) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
