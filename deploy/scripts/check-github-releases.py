# Managed by Cenit: observe GitHub releases; never authorize or perform deployment.
"""Read-only preparation monitor; provenance and deployment are a later stage."""
import sys

from github_read import GitHubClient, GitHubReadError, inspect_repository, read_token


def main():
    try:
        releases = inspect_repository(GitHubClient(read_token()))
        published = sum(not item.get("draft") and not item.get("prerelease") for item in releases)
        print(f"GitHub accesible: {published} releases publicadas entre las últimas {len(releases)}.")
        print("Modo observación: ninguna release se autoriza ni despliega en esta etapa.")
        return 0
    except GitHubReadError as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
