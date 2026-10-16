#!/usr/bin/env python3
"""Prepare, publish and submit Library Card using GitHub CLI, without tokens in files."""
from __future__ import annotations

import argparse
import base64
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time

VERSION = "1.0.0"
TAG = f"v{VERSION}"
SOURCE = Path(__file__).resolve().parent
DESCRIPTION = "Reusable Home Assistant dashboard templates, shared settings and hash-based Bubble popups."
TOPICS = ["home-assistant", "hacs", "lovelace", "custom-integration", "dashboard", "bubble-card", "templates"]
EXCLUDED = {".git", ".venv", ".publication", "dist", "__pycache__", "node_modules", ".pytest_cache", ".storage", ".checks"}


class PublicationError(RuntimeError):
    """A prerequisite or remote check did not pass."""


class Runner:
    def run(self, args, cwd=None, allow_failure=False):
        # Argument arrays deliberately avoid shells, token interpolation and quoting bugs.
        result = subprocess.run([str(arg) for arg in args], cwd=cwd, text=True, capture_output=True, encoding="utf-8", env=os.environ | {"PYTHONUTF8": "1", "GH_HOST": "github.com"})
        if result.returncode and not allow_failure:
            raise PublicationError(f"{args[0]} {args[1]} failed:\n{result.stderr or result.stdout}")
        return result

    def api(self, endpoint, method="GET", payload=None):
        command = ["gh", "api", "--hostname", "github.com", endpoint, "--method", method]
        if payload is None:
            result = self.run(command)
        else:
            with tempfile.TemporaryDirectory() as directory:
                body = Path(directory) / "body.json"
                body.write_text(json.dumps(payload), encoding="utf-8")
                result = self.run([*command, "--input", body])
        return json.loads(result.stdout) if result.stdout.strip() else None

    def content(self, repo, path, ref):
        value = self.api(f"repos/{repo}/contents/{path}?ref={ref}")
        return base64.b64decode(value["content"]).decode("utf-8")


def valid_name(value, repository=False):
    pattern = r"[A-Za-z0-9][A-Za-z0-9_.-]{0,99}" if repository else r"[A-Za-z0-9][A-Za-z0-9-]{0,38}"
    if not re.fullmatch(pattern, value):
        raise PublicationError("Ungültiger GitHub-Name.")
    return value


def assert_identity(runner, user):
    current = runner.api("user")
    if current.get("id") != user["id"] or current.get("login", "").lower() != user["login"].lower():
        raise PublicationError("Das aktive GitHub-Konto wurde gewechselt. Mit dem ursprünglichen Konto erneut starten.")


def source_files(root):
    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root)
        if any(part in EXCLUDED or part == ".env" or part.startswith(".env.") for part in relative.parts) or path.name in {"secrets.yaml", ".DS_Store", "Thumbs.db"} or path.name.startswith("home-assistant.log") or path.suffix in {".pyc", ".pyo", ".zip"}:
            continue
        if path.is_symlink():
            raise PublicationError(f"Symlink im Quellpaket: {relative}")
        if path.is_file():
            yield path, relative


def stage_project(source, target):
    source, target = source.resolve(), target.expanduser().resolve()
    marker = target / ".publication/project.json"
    if marker.is_file():
        state = json.loads(marker.read_text(encoding="utf-8"))
        if not isinstance(state, dict) or state.get("project") != "library-card":
            raise PublicationError("Der Veröffentlichungsmarker gehört nicht zu Library Card.")
    if source != target:
        if target.is_relative_to(source) or source.is_relative_to(target):
            raise PublicationError("Quell- und Zielordner dürfen nicht ineinander liegen.")
        if target.exists() and any(target.iterdir()):
            if not marker.is_file():
                raise PublicationError("Zielordner ist nicht leer. Bitte einen neuen Ordner verwenden.")
            # A restart uses the already prepared local project, preserving later edits.
            return target
        target.mkdir(parents=True, exist_ok=True)
        for path, relative in source_files(source):
            destination = target / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, destination)
    elif (target / ".git").exists() and not marker.is_file():
        raise PublicationError("Vorhandenes Git-Repository wird ohne Veröffentlichungsmarker nicht verändert.")
    marker.parent.mkdir(exist_ok=True)
    if not marker.exists():
        marker.write_text(json.dumps({"project": "library-card", "version": VERSION}), encoding="utf-8")
    return target


def configure(root, owner, repository):
    owner, repository = valid_name(owner), valid_name(repository, True)
    marker = root / ".publication/project.json"
    state = json.loads(marker.read_text(encoding="utf-8"))
    identity = f"{owner}/{repository}"
    if state.get("repository") and state["repository"].lower() != identity.lower():
        raise PublicationError("Dieser Projektordner wurde für ein anderes Repository vorbereitet.")
    manifest_path = root / "custom_components/card_library/manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest.update(codeowners=[f"@{owner}"], documentation=f"https://github.com/{identity}", issue_tracker=f"https://github.com/{identity}/issues", version=VERSION)
    # HA manifest convention: domain and name first, remaining keys alphabetically.
    manifest = {key: manifest[key] for key in ["domain", "name", *sorted(set(manifest) - {"domain", "name"})]}
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    readme = root / "README.md"
    text = readme.read_text(encoding="utf-8").replace("GITHUB_OWNER", owner)
    if repository != "library-card":
        text = text.replace(f"github.com/{owner}/library-card", f"github.com/{identity}").replace("repository=library-card", f"repository={repository}")
    readme.write_text(text, encoding="utf-8")
    (root / ".github/CODEOWNERS").write_text(f"* @{owner}\n", encoding="utf-8")
    state["repository"] = identity
    marker.write_text(json.dumps(state, indent=2), encoding="utf-8")


def run_local_checks(runner, root):
    if not shutil.which("node"):
        raise PublicationError("Node.js 22 wird benötigt. https://nodejs.org/")
    environment = root / ".venv"
    python = environment / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")
    if not python.exists():
        runner.run([sys.executable, "-m", "venv", environment])
    print("Lokale Prüfungen und isolierte Testabhängigkeiten …", flush=True)
    runner.run([python, "-m", "pip", "install", "--no-cache-dir", "--disable-pip-version-check", "-r", "requirements-dev.txt"], root)
    runner.run([python, "scripts/check_release.py", "--configured"], root)
    for name in ("core", "tools", "workflows", "ui", "native-ui", "resources", "family-calendar", "popup", "popup-resource", "yaml-export", "editor-scope", "preload"):
        runner.run(["node", f"tests/{name}.test.js"], root)
    for path in (root / "custom_components/card_library/frontend").glob("*.js"):
        runner.run(["node", "--check", path], root)
    runner.run([python, "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py", "-v"], root)
    runner.run([python, "tests/check_websocket_schemas.py"], root)
    runner.run([python, "scripts/build_release.py"], root)


def set_git_identity(runner, root, user):
    runner.run(["git", "config", "user.name", user.get("name") or user["login"]], root)
    runner.run(["git", "config", "user.email", f'{user["id"]}+{user["login"]}@users.noreply.github.com'], root)
    runner.run(["git", "config", "credential.https://github.com.helper", ""], root)
    runner.run(["git", "config", "--add", "credential.https://github.com.helper", "!gh auth git-credential"], root)


def ensure_repository(runner, root, identity, user):
    expected = f"https://github.com/{identity}.git"
    has_git = (root / ".git").exists()
    if has_git:
        actual_root = runner.run(["git", "rev-parse", "--show-toplevel"], root).stdout.strip()
        if Path(actual_root).resolve() != root.resolve():
            raise PublicationError("Obersten Projektordner angeben.")
        if runner.run(["git", "branch", "--show-current"], root).stdout.strip() != "main":
            raise PublicationError("Veröffentlicht wird nur der vorbereitete main-Branch.")
        remote = runner.run(["git", "remote", "get-url", "origin"], root, True)
        if not remote.returncode:
            push_remote = runner.run(["git", "remote", "get-url", "--push", "origin"], root)
            if any(value.lower() != expected.lower() for value in (remote.stdout.strip(), push_remote.stdout.strip())):
                raise PublicationError("Der bestehende origin-Remote zeigt auf ein anderes Repository.")
    existing = runner.run(["gh", "api", f"repos/{identity}"], allow_failure=True)
    if existing.returncode:
        if "HTTP 404" not in existing.stderr:
            raise PublicationError(existing.stderr)
        runner.run(["gh", "repo", "create", identity, "--public", "--description", DESCRIPTION])
        metadata = runner.api(f"repos/{identity}")
    else:
        metadata = json.loads(existing.stdout)
        if metadata.get("private") or metadata.get("archived"):
            raise PublicationError("Das Ziel-Repository muss öffentlich und aktiv sein; keine automatische Sichtbarkeitsänderung.")
        marker = root / ".publication/project.json"
        local_state = json.loads(marker.read_text(encoding="utf-8"))
        if not local_state.get("published"):
            # A crash after creation may leave the intended empty repo. Never adopt foreign contents.
            contents = runner.run(["gh", "api", f"repos/{identity}/contents/custom_components/card_library/manifest.json"], allow_failure=True)
            if contents.returncode == 0:
                raise PublicationError("Repository enthält bereits eine Integration. Nachweis des bisherigen lokalen Veröffentlichungsstands fehlt.")
            if "HTTP 404" not in contents.stderr or metadata.get("size", 0) != 0:
                raise PublicationError("Vorhandenes Repository ist nicht leer; automatische Übernahme abgebrochen.")
            heads = runner.run(["git", "ls-remote", "--heads", f"https://github.com/{identity}.git"]).stdout.strip()
            if heads:
                raise PublicationError("Vorhandenes Repository hat bereits Branches; keine automatische Übernahme.")
    runner.api(f"repos/{identity}", "PATCH", {"description": DESCRIPTION, "has_issues": True, "homepage": f"https://github.com/{identity}#readme"})
    runner.api(f"repos/{identity}/topics", "PUT", {"names": TOPICS})
    if not has_git:
        runner.run(["git", "init", "--initial-branch=main"], root)
    set_git_identity(runner, root, user)
    remote = runner.run(["git", "remote", "get-url", "origin"], root, True)
    if remote.returncode:
        runner.run(["git", "remote", "add", "origin", expected], root)
    elif remote.stdout.strip().lower() != expected.lower():
        raise PublicationError("Der bestehende origin-Remote zeigt auf ein anderes Repository.")
    branch = runner.run(["git", "branch", "--show-current"], root).stdout.strip()
    if branch != "main":
        raise PublicationError("Veröffentlicht wird nur der vorbereitete main-Branch.")
    runner.run(["git", "add", "--all"], root)
    dirty = runner.run(["git", "diff", "--cached", "--quiet"], root, True)
    if dirty.returncode == 1:
        runner.run(["git", "commit", "-m", f"Prepare public release {TAG}"], root)
    elif dirty.returncode:
        raise PublicationError(dirty.stderr)
    sha = runner.run(["git", "rev-parse", "HEAD"], root).stdout.strip()
    # Record intended commit before pushing, allowing a safe retry after network interruption.
    marker = root / ".publication/project.json"
    local_state = json.loads(marker.read_text(encoding="utf-8")); local_state.update(published=True, commit=sha)
    marker.write_text(json.dumps(local_state, indent=2), encoding="utf-8")
    runner.run(["git", "push", "--set-upstream", "origin", "main"], root)
    runner.api(f"repos/{identity}", "PATCH", {"default_branch": "main"})
    return sha


def wait_workflow(runner, identity, filename, sha, timeout):
    if timeout <= 0:
        raise PublicationError("Zeitlimit muss positiv sein.")
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        result = runner.run(["gh", "run", "list", "--repo", identity, "--workflow", filename, "--commit", sha, "--event", "push", "--limit", "20", "--json", "databaseId,status,conclusion,url,headSha"], allow_failure=True)
        if result.returncode:
            if "could not find" not in result.stderr.lower() and "HTTP 404" not in result.stderr:
                raise PublicationError(result.stderr)
        else:
            runs = json.loads(result.stdout)
            if runs:
                run = runs[0]
                if run["headSha"] != sha:
                    raise PublicationError("GitHub lieferte einen Prüflauf für den falschen Commit.")
                if run["status"] == "completed":
                    if run["conclusion"] != "success":
                        raise PublicationError(f'{filename} ist nicht erfolgreich: {run["url"]}. Kein Release/HACS-Antrag erstellt.')
                    endpoint = f'repos/{identity}/actions/runs/{run["databaseId"]}/jobs?per_page=100'
                    page = runner.api(endpoint)
                    jobs = page.get("jobs", [])
                    if not isinstance(jobs, list):
                        raise PublicationError("GitHub lieferte eine ungültige Job-Liste.")
                    total = page.get("total_count", len(jobs))
                    number = 1
                    if not isinstance(total, int) or total < len(jobs):
                        raise PublicationError("GitHub lieferte eine ungültige Job-Liste.")
                    while len(jobs) < total:
                        number += 1
                        following = runner.api(f"{endpoint}&page={number}").get("jobs", [])
                        if not isinstance(following, list) or not following:
                            raise PublicationError("Die erforderlichen GitHub-Jobs sind nicht vollständig prüfbar.")
                        jobs.extend(following)
                    if len(jobs) != total:
                        raise PublicationError("GitHub lieferte eine widersprüchliche Job-Liste.")
                    if not jobs or any(job.get("conclusion") != "success" for job in jobs):
                        raise PublicationError("Ein erforderlicher Job wurde übersprungen oder ist fehlgeschlagen.")
                    return run
        time.sleep(5)
    raise PublicationError(f"Zeitlimit für {filename}. Erneuter Skriptstart setzt den Ablauf fort.")


def release_repository(runner, root, identity, sha, checks):
    existing = runner.run(["gh", "api", f"repos/{identity}/releases/tags/{TAG}"], allow_failure=True)
    if existing.returncode == 0:
        release = json.loads(existing.stdout)
        if release.get("draft") or release.get("prerelease"):
            raise PublicationError("Vorhandene Version ist kein öffentliches stabiles Release.")
    else:
        if "HTTP 404" not in existing.stderr:
            raise PublicationError(existing.stderr)
        tagged = runner.run(["git", "rev-parse", "--verify", f"{TAG}^{{commit}}"], root, True)
        if not tagged.returncode and tagged.stdout.strip() != sha:
            raise PublicationError("Der Release-Tag verweist auf anderen Code; kein Überschreiben.")
        if tagged.returncode:
            runner.run(["git", "tag", "-a", TAG, "-m", TAG, sha], root)
        runner.run(["git", "push", "origin", TAG], root)
        runner.run(["gh", "release", "create", TAG, root / "dist" / f"library-card-{TAG}.zip", root / "dist/SHA256SUMS.txt", "--repo", identity, "--verify-tag", "--target", sha, "--title", f"Library Card {TAG}", "--notes-file", root / "RELEASE-NOTES.md"])
        release = runner.api(f"repos/{identity}/releases/tags/{TAG}")
    ref = runner.api(f"repos/{identity}/git/ref/tags/{TAG}")["object"]
    if ref["type"] == "tag":
        ref = runner.api(f'repos/{identity}/git/tags/{ref["sha"]}')["object"]
    if ref.get("type") != "commit" or ref["sha"] != sha:
        raise PublicationError("Das veröffentlichte Release entspricht nicht dem geprüften Commit.")
    assets = {asset["name"]: asset for asset in release.get("assets", [])}
    for name in (f"library-card-{TAG}.zip", "SHA256SUMS.txt"):
        local = root / "dist" / name
        asset = assets.get(name)
        if not asset or asset.get("state") != "uploaded" or asset.get("size") != local.stat().st_size:
            raise PublicationError("Release-Dateien fehlen oder sind unvollständig. Kein HACS-Antrag.")
        if asset.get("digest") and asset["digest"] != "sha256:" + hashlib.sha256(local.read_bytes()).hexdigest():
            raise PublicationError("Release-Prüfsumme stimmt nicht mit dem lokalen Paket überein.")
        if not asset.get("digest"):
            with tempfile.TemporaryDirectory(prefix="library-card-release-check-") as directory:
                runner.run(["gh", "release", "download", TAG, "--repo", identity, "--pattern", name, "--dir", directory])
                downloaded = Path(directory) / name
                if not downloaded.is_file() or hashlib.sha256(downloaded.read_bytes()).digest() != hashlib.sha256(local.read_bytes()).digest():
                    raise PublicationError("Release-Datei stimmt nicht mit dem lokal geprüften Paket überein.")
    published = datetime.fromisoformat(release["published_at"].replace("Z", "+00:00"))
    for run in checks.values():
        details = runner.api(f'repos/{identity}/actions/runs/{run["databaseId"]}')
        completed = datetime.fromisoformat(details["updated_at"].replace("Z", "+00:00"))
        if published < completed:
            raise PublicationError("Das Release ist älter als die erforderlichen erfolgreichen Prüfläufe. Kein HACS-Antrag.")
    return release


def fill_hacs_template(template, release, checks):
    lines = template.splitlines()
    checklist = [(index, line) for index, line in enumerate(lines) if re.match(r"\s*- \[ \]", line)]
    # Fail closed if upstream introduces an unfamiliar attestation.
    patterns = [r"read.*publishing", r"added.*HACS action", r"added.*hassfest action", r"actions.*passing.*disabled", r"link.*action run", r"release.*actions.*successfully"]
    if len(checklist) != len(patterns) or any(not re.search(pattern, line, re.I) for (_, line), pattern in zip(checklist, patterns)):
        raise PublicationError("Die HACS-Antragsvorlage wurde geändert. Aktuelle Anforderungen prüfen; kein automatischer Antrag.")
    for index, line in checklist:
        lines[index] = line.replace("[ ]", "[x]", 1)
    links = {"Link to current release:": release["html_url"], "Link to successful HACS action": checks["hacs"]["url"], "Link to successful hassfest action": checks["hassfest"]["url"]}
    for prefix, url in links.items():
        matches = [index for index, line in enumerate(lines) if line.startswith(prefix) and "<>" in line]
        if len(matches) != 1:
            raise PublicationError("HACS-Linkvorlage ist unerwartet; kein automatischer Antrag.")
        index = matches[0]; lines[index] = lines[index].replace("<>", f"<{url}>")
    return "\n".join(lines) + "\n"


def add_sorted_repository(text, identity):
    entries = json.loads(text)
    if not isinstance(entries, list) or not all(isinstance(value, str) for value in entries):
        raise PublicationError("Unerwartetes HACS-Katalogformat.")
    if any(value.lower() == identity.lower() for value in entries):
        return text
    if entries != sorted(entries, key=str.casefold):
        raise PublicationError("Der aktuelle HACS-Katalog ist nicht alphabetisch sortiert.")
    return json.dumps(sorted([*entries, identity], key=str.casefold), indent=2) + "\n"


def submit_hacs(runner, root, identity, user, release, checks):
    assert_identity(runner, user)
    upstream = runner.api("repos/hacs/default")
    if upstream["default_branch"] != "master":
        raise PublicationError("HACS hat den Ausgangsbranch geändert. Aktuelle Richtlinien prüfen.")
    template = runner.content("hacs/default", ".github/PULL_REQUEST_TEMPLATE.md", "master")
    body = fill_hacs_template(template, release, checks)
    branch = "add-" + identity.replace("/", "-").lower()
    existing = runner.run(["gh", "pr", "list", "--repo", "hacs/default", "--head", f'{user["login"]}:{branch}', "--state", "all", "--json", "url,state"], allow_failure=False)
    prs = json.loads(existing.stdout)
    if prs:
        if prs[0]["state"] in {"OPEN", "MERGED"}:
            return prs[0]["url"]
        raise PublicationError("Der vorherige HACS-Antrag wurde geschlossen. Grund bearbeiten statt automatisch neu einzureichen.")
    content = runner.content("hacs/default", "integration", "master")
    if add_sorted_repository(content, identity) == content:
        return "Bereits im HACS-Katalog enthalten."
    fork_identity = f'{user["login"]}/default'
    fork = runner.run(["gh", "api", f"repos/{fork_identity}"], allow_failure=True)
    if fork.returncode:
        if "HTTP 404" not in fork.stderr:
            raise PublicationError(fork.stderr)
        runner.api("repos/hacs/default/forks", "POST", {})
        time.sleep(5)
    metadata = runner.api(f"repos/{fork_identity}")
    if metadata.get("parent", {}).get("full_name", "").lower() != "hacs/default":
        raise PublicationError("Das vorhandene default-Repository ist kein HACS-Fork.")
    with tempfile.TemporaryDirectory(prefix="library-card-hacs-") as directory:
        checkout = Path(directory) / "default"
        runner.run(["git", "clone", "--quiet", f"https://github.com/{fork_identity}.git", checkout])
        set_git_identity(runner, checkout, user)
        runner.run(["git", "remote", "add", "upstream", "https://github.com/hacs/default.git"], checkout)
        runner.run(["git", "fetch", "--quiet", "upstream", "master"], checkout)
        remote_branch = runner.run(["git", "ls-remote", "--heads", "origin", branch], checkout).stdout.strip()
        if remote_branch:
            runner.run(["git", "fetch", "origin", branch], checkout)
            reference = f"origin/{branch}"
            files = runner.run(["git", "diff", "--name-only", f"upstream/master...{reference}"], checkout).stdout.splitlines()
            base = runner.run(["git", "merge-base", "upstream/master", reference], checkout).stdout.strip()
            before = runner.run(["git", "show", f"{base}:integration"], checkout).stdout
            after = runner.run(["git", "show", f"{reference}:integration"], checkout).stdout
            if files != ["integration"] or after != add_sorted_repository(before, identity):
                raise PublicationError("Vorhandener Antragsbranch enthält weitere Änderungen. Kein automatisches Überschreiben.")
        else:
            runner.run(["git", "checkout", "-b", branch, "upstream/master"], checkout)
            path = checkout / "integration"
            updated = add_sorted_repository(path.read_text(encoding="utf-8"), identity)
            if updated == path.read_text(encoding="utf-8"):
                return "Bereits im HACS-Katalog enthalten."
            path.write_text(updated, encoding="utf-8")
            runner.run(["git", "add", "integration"], checkout)
            runner.run(["git", "commit", "-m", f"Add {identity}"], checkout)
            runner.run(["git", "push", "origin", branch], checkout)
        body_file = root / ".publication/HACS-APPLICATION.md"
        body_file.write_text(body, encoding="utf-8")
        assert_identity(runner, user)
        result = runner.run(["gh", "pr", "create", "--repo", "hacs/default", "--base", "master", "--head", f'{user["login"]}:{branch}', "--title", f"Add {identity}", "--body-file", body_file])
        return result.stdout.strip()


def main(argv=None, runner=None):
    parser = argparse.ArgumentParser(description="Library Card v1.0.0 vorbereiten, veröffentlichen und bei HACS einreichen.")
    parser.add_argument("--project-dir", type=Path, help="Lokaler Projekteordner; ohne Angabe wird der entpackte Quellordner verwendet")
    parser.add_argument("--owner", help="GitHub-Benutzer; standardmäßig der angemeldete Benutzer")
    parser.add_argument("--repo", default="library-card")
    parser.add_argument("--publish", action="store_true", help="Öffentliches GitHub-Repository und stabiles Release erstellen")
    parser.add_argument("--submit-hacs", action="store_true", help="Nach allen erfolgreichen Prüfungen einen HACS-PR erstellen")
    parser.add_argument("--ack-publishing-docs", action="store_true", help="Bestätigt, dass du die verlinkten HACS-Veröffentlichungsrichtlinien gelesen hast")
    parser.add_argument("--dry-run", action="store_true", help="Nur Plan anzeigen; keine Dateien oder Remote-Daten ändern")
    parser.add_argument("--timeout", type=int, default=1800, help="Zeitlimit je GitHub-Workflow in Sekunden")
    args = parser.parse_args(argv)
    runner = runner or Runner()
    if sys.version_info < (3, 12):
        raise PublicationError("Python 3.12 oder neuer wird benötigt.")
    if args.timeout <= 0:
        raise PublicationError("Zeitlimit muss positiv sein.")
    if args.submit_hacs and (not args.publish or not args.ack_publishing_docs):
        raise PublicationError("HACS-Einreichung benötigt --publish und --ack-publishing-docs. https://www.hacs.xyz/docs/publish/include/")
    target = args.project_dir or SOURCE
    if args.dry_run:
        print(f"Projekt: {target.expanduser().resolve()}\nRepository: {args.owner or '<GitHub-Anmeldung>'}/{args.repo}\nRelease: {TAG}\nMIT-Lizenz; lokale Tests → öffentliche GitHub-Prüfungen → Release → optional HACS-Antrag.")
        return 0
    user = None
    if args.publish or not args.owner:
        if not shutil.which("gh"):
            raise PublicationError("GitHub CLI fehlt: https://cli.github.com/ — danach gh auth login ausführen.")
        status = runner.run(["gh", "auth", "status", "--hostname", "github.com"], allow_failure=True)
        if status.returncode:
            raise PublicationError("Zuerst gh auth login --hostname github.com ausführen. Keine Tokens in Skripte eintragen.")
        user = runner.api("user")
    owner = args.owner or user["login"]
    if args.publish and owner.lower() != user["login"].lower():
        raise PublicationError("Die erste automatische Veröffentlichung verwendet dein persönliches GitHub-Konto.")
    if args.publish and not shutil.which("git"):
        raise PublicationError("Git fehlt: https://git-scm.com/")
    root = stage_project(SOURCE, target)
    configure(root, owner, args.repo)
    run_local_checks(runner, root)
    if not args.publish:
        print(f"Lokal vorbereitet und geprüft: {root}. Noch nichts auf GitHub veröffentlicht.")
        return 0
    identity = f"{owner}/{args.repo}"
    assert_identity(runner, user)
    sha = ensure_repository(runner, root, identity, user)
    print("GitHub-Prüfungen abwarten. Bei Fehlern stoppt der Ablauf vor Release und Antrag.", flush=True)
    checks = {name: wait_workflow(runner, identity, f"{name}.yml", sha, args.timeout) for name in ("hacs", "hassfest", "tests")}
    assert_identity(runner, user)
    release = release_repository(runner, root, identity, sha, checks)
    result = {"repository": f"https://github.com/{identity}", "commit": sha, "release": release["html_url"], "checks": {name: run["url"] for name, run in checks.items()}}
    if args.submit_hacs:
        result["hacs_application"] = submit_hacs(runner, root, identity, user, release, checks)
    (root / ".publication/result.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    for name, value in result.items():
        print(name + ":", value)
    print("Der HACS-Antrag wird durch das HACS-Team geprüft; Einreichen bedeutet keine automatische Aufnahme.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (PublicationError, OSError, ValueError, KeyError) as error:
        print("STOP:", error, file=sys.stderr)
        raise SystemExit(1)
