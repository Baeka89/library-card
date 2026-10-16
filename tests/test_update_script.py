"""Offline updater regressions: no GitHub request or publication is performed."""
from contextlib import contextmanager, redirect_stdout
from pathlib import Path
from subprocess import CompletedProcess
import base64
import hashlib
import importlib.util
import io
import json
import tempfile
import unittest
from unittest.mock import patch
import warnings
import zipfile


ROOT = Path(__file__).resolve().parents[1]


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


updater = load_module("tested_library_updater", ROOT / "scripts/update_publication.py")
generator = load_module("tested_update_generator", ROOT / "scripts/make_update_script.py")


def fixture_files():
    version = json.dumps({"version": updater.VERSION}).encode()
    return {"package.json": version,
            "custom_components/card_library/manifest.json": version,
            "custom_components/card_library/__init__.py": b"value = 'reviewed'\n",
            "custom_components/card_library/brand/icon.png": b"\x89PNG\r\n\x1a\n\x00\xff\x80",
            "README.md": "Geprüfte Quellen\n".encode()}


def bundle_bytes(entries, modes=None):
    stream = io.BytesIO()
    with warnings.catch_warnings(), zipfile.ZipFile(stream, "w", zipfile.ZIP_DEFLATED) as bundle:
        warnings.simplefilter("ignore", UserWarning)
        for name, data in entries:
            info = zipfile.ZipInfo(name)
            info.create_system = 3
            info.external_attr = (modes or {}).get(name, 0o100644) << 16
            bundle.writestr(info, data)
    return stream.getvalue()


@contextmanager
def embedded(payload=None, entries=None, modes=None):
    payload = fixture_files() if payload is None else payload
    entries = [("library-card/" + name, data) for name, data in payload.items()] if entries is None else entries
    raw = bundle_bytes(entries, modes)
    with patch.object(updater, "PAYLOAD", base64.b64encode(raw).decode()), patch.object(updater, "DIGEST", hashlib.sha256(raw).hexdigest()):
        yield raw


def completed(stdout="", code=0, stderr=""):
    return CompletedProcess([], code, stdout, stderr)


class UpdateScriptTest(unittest.TestCase):
    def setUp(self):
        # Any unexpected connector call fails locally rather than reaching gh.
        guard = patch.object(updater, "api", side_effect=AssertionError("Unexpected GitHub request"))
        guard.start()
        self.addCleanup(guard.stop)

    @contextmanager
    def git_project(self):
        with tempfile.TemporaryDirectory(prefix="library-updater-test-") as directory:
            root = Path(directory)
            updater.run(["git", "init", "-b", "main"], root)
            updater.run(["git", "config", "user.name", "Offline Test"], root)
            updater.run(["git", "config", "user.email", "offline@example.invalid"], root)
            (root / "source.txt").write_bytes(b"baseline\n")
            updater.run(["git", "add", "source.txt"], root)
            updater.run(["git", "commit", "-m", "Baseline"], root)
            yield root, updater.run(["git", "rev-parse", "HEAD"], root)

    def release_outputs(self, root):
        (root / "RELEASE-NOTES.md").write_text("Reviewed release notes",encoding="utf-8")
        output = root / "dist"
        output.mkdir()
        contents = {"library-card-" + updater.TAG + ".zip": b"PK\x03\x04\x00\xff\x80\xfe",
                    "SHA256SUMS.txt": b"checksums\n"}
        for name, data in contents.items():
            (output / name).write_bytes(data)
        return contents

    def test_reviewed_public_baseline_is_fixed(self):
        self.assertEqual(updater.BASE, "b8191075b8754243fae6664b337e4db3b1f2019e")

    def test_payload_integrity_and_versions_are_checked(self):
        payload = fixture_files()
        with embedded(payload):
            self.assertEqual(updater.files(), payload)
            with patch.object(updater, "DIGEST", "0" * 64), self.assertRaisesRegex(updater.UpdateError, "Beschädigtes Veröffentlichungspaket"):
                updater.files()
        payload["package.json"] = b'{"version":"999.0.0"}'
        with embedded(payload), self.assertRaisesRegex(updater.UpdateError, "Paketversion"):
            updater.files()

    def test_payload_rejects_paths_outside_reviewed_source(self):
        invalid = ["/absolute/file", "library-card/../escape", "other-project/file", "library-card",
                   "library-card/.git/config", "library-card/.publication/marker.json", "library-card/.venv/bin/python",
                   "library-card/dist/archive.zip", "library-card/.storage/config", "library-card/dir\\escape"]
        original = [("library-card/" + name, data) for name, data in fixture_files().items()]
        for name in invalid:
            with self.subTest(name=name), embedded(entries=original + [(name, b"unexpected")]), self.assertRaisesRegex(updater.UpdateError, "Paketpfad"):
                updater.files()

    def test_payload_rejects_duplicates_directories_and_symlinks(self):
        original = [("library-card/" + name, data) for name, data in fixture_files().items()]
        cases = [("library-card/package.json", 0o100644), ("library-card/directory/", 0o040755), ("library-card/link", 0o120777)]
        for name, mode in cases:
            with self.subTest(name=name), embedded(entries=original + [(name, b"target")], modes={name: mode}), self.assertRaisesRegex(updater.UpdateError, "Paketpfad"):
                updater.files()

    def test_apply_rejects_symlink_files_and_parents_without_touching_targets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "project"; root.mkdir()
            outside = Path(directory) / "outside.txt"; outside.write_bytes(b"keep")
            (root / "file.txt").symlink_to(outside)
            with self.assertRaisesRegex(updater.UpdateError, "Symlink"):
                updater.apply_files(root, {"file.txt": b"replace"})
            parent = Path(directory) / "outside"; parent.mkdir()
            (root / "linked").symlink_to(parent, target_is_directory=True)
            with self.assertRaisesRegex(updater.UpdateError, "Symlink"):
                updater.apply_files(root, {"linked/new.txt": b"replace"})
            self.assertEqual(outside.read_bytes(), b"keep"); self.assertFalse((parent / "new.txt").exists())

    def test_local_unknown_unstaged_staged_and_untracked_edits_are_preserved(self):
        for kind in ("unstaged", "staged", "untracked"):
            with self.subTest(kind=kind), self.git_project() as (root, _):
                path = root / ("unknown.txt" if kind == "untracked" else "source.txt")
                path.write_bytes(b"user edit\n")
                if kind == "staged": updater.run(["git", "add", "source.txt"], root)
                with self.assertRaisesRegex(updater.UpdateError, "Andere lokale Änderung"):
                    updater.check_changes(root, {"source.txt": b"reviewed update\n"})
                self.assertEqual(path.read_bytes(), b"user edit\n")

    def test_replaying_exact_payload_edits_is_allowed_but_deleted_sources_are_not(self):
        with self.git_project() as (root, _):
            payload = {"source.txt": b"reviewed update\n", "new.txt": b"new reviewed source\n"}
            for name, data in payload.items(): (root / name).write_bytes(data)
            updater.check_changes(root, payload)
            updater.run(["git", "add", "."], root); updater.check_changes(root, payload)
            (root / "source.txt").unlink()
            with self.assertRaisesRegex(updater.UpdateError, "Andere lokale Änderung"):
                updater.check_changes(root, payload)

    def test_local_plan_accepts_known_base_and_exact_payload_commit(self):
        with self.git_project() as (root, head), patch.object(updater, "BASE", head):
            payload = {"source.txt": b"reviewed update\n"}
            self.assertEqual(updater.local_plan(root, payload), (head, head))
            (root / "source.txt").write_bytes(payload["source.txt"])
            updater.run(["git", "add", "."], root); updater.run(["git", "commit", "-m", "Reviewed update"], root)
            updated = updater.run(["git", "rev-parse", "HEAD"], root)
            self.assertEqual(updater.local_plan(root, payload), (updated, updated))
            self.assertTrue(updater.is_payload_commit(root, updated, payload))

    def test_local_plan_rejects_unknown_commits_and_stale_marker_digest(self):
        with self.git_project() as (root, head), patch.object(updater, "BASE", "f" * 40):
            with self.assertRaisesRegex(updater.UpdateError, "Unbekannter Projektstand"):
                updater.local_plan(root, {"source.txt": b"reviewed update\n"})
            marker = root / ".publication" / updater.MARKER; marker.parent.mkdir()
            marker.write_text(json.dumps({"base": head, "digest": "wrong"}))
            with self.assertRaisesRegex(updater.UpdateError, "beschädigte Veröffentlichungsvorbereitung"):
                updater.local_plan(root, {"source.txt": b"reviewed update\n"})

    def test_payload_commit_compares_committed_bytes_instead_of_worktree(self):
        with self.git_project() as (root, head):
            (root / "source.txt").write_bytes(b"reviewed update\n")
            self.assertFalse(updater.is_payload_commit(root, head, {"source.txt": b"reviewed update\n"}))
            self.assertTrue(updater.is_payload_commit(root, head, {"source.txt": b"baseline\n"}))

    def test_draft_discovery_reads_every_page_and_rejects_duplicate_tags(self):
        first = [{"id": index + 1, "tag_name": "vold-" + str(index)} for index in range(100)]
        draft = {"id": 501, "tag_name": updater.TAG, "draft": True}
        calls = []
        def api(endpoint, **kwargs):
            calls.append(endpoint)
            if "/tags/" in endpoint: return None
            return first if endpoint.endswith("page=1") else [draft]
        with patch.object(updater, "api", side_effect=api): self.assertEqual(updater.find_release(), draft)
        self.assertTrue(any("page=2" in endpoint for endpoint in calls))
        with patch.object(updater, "api", side_effect=[None, [draft, {**draft, "id": 502}]]), self.assertRaisesRegex(updater.UpdateError, "Mehrere Releases"):
            updater.find_release()

    def test_release_and_asset_pagination_reject_malformed_or_duplicate_entries(self):
        with patch.object(updater, "api", side_effect=[None, {}]), self.assertRaisesRegex(updater.UpdateError, "Release-Liste"):
            updater.find_release()
        first = [{"name": "asset-" + str(index), "id": index + 1} for index in range(100)]
        with patch.object(updater, "api", side_effect=[first, [{"name": "last", "id": 101}]]):
            self.assertEqual(len(updater.release_assets(77)), 101)
        with patch.object(updater, "api", side_effect=[first, [first[0]]]), self.assertRaisesRegex(updater.UpdateError, "Doppelte Release-Datei"):
            updater.release_assets(77)

    def test_binary_download_uses_raw_stdout_and_explicit_asset_id(self):
        binary = b"\x00\xff\x80PK\r\n"
        def run(args, **kwargs):
            self.assertIn("repos/" + updater.REPO + "/releases/assets/37", args)
            self.assertIn("Accept: application/octet-stream", args)
            self.assertNotIn("text", kwargs); self.assertNotIn("encoding", kwargs)
            kwargs["stdout"].write(binary)
            return completed()
        with tempfile.TemporaryDirectory() as directory, patch.object(updater.subprocess, "run", side_effect=run):
            destination = Path(directory) / "asset.zip"; updater.download_asset(37, destination)
            self.assertEqual(destination.read_bytes(), binary)

    def test_binary_download_failure_is_reported_without_decoding_binary_asset(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(updater.subprocess, "run", return_value=completed(code=1, stderr=b"HTTP 403\xff")), self.assertRaisesRegex(updater.UpdateError, "HTTP 403"):
            updater.download_asset(37, Path(directory) / "asset.zip")

    def test_asset_digest_size_and_uploaded_state_must_match_reviewed_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); contents = self.release_outputs(root); name = next(iter(contents)); data = contents[name]
            good = {"id": 37, "name": name, "state": "uploaded", "size": len(data), "digest": "sha256:" + hashlib.sha256(data).hexdigest()}
            with patch.object(updater, "download_asset") as download:
                updater.verify_asset(root, good, name); download.assert_not_called()
            for change in ({"state": "new"}, {"size": len(data) + 1}, {"digest": "sha256:" + "0" * 64}):
                with self.subTest(change=change), self.assertRaises(updater.UpdateError): updater.verify_asset(root, good | change, name)

    def test_asset_without_api_digest_is_downloaded_and_compared_by_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); contents = self.release_outputs(root); name = next(iter(contents)); data = contents[name]
            asset = {"id": 37, "state": "uploaded", "size": len(data)}
            with patch.object(updater, "download_asset", side_effect=lambda identifier, path: path.write_bytes(data)) as download:
                updater.verify_asset(root, asset, name); self.assertEqual(download.call_args.args[0], 37)
            with patch.object(updater, "download_asset", side_effect=lambda identifier, path: path.write_bytes(b"x" * len(data))), self.assertRaisesRegex(updater.UpdateError, "Abweichende Release-Datei"):
                updater.verify_asset(root, asset, name)

    def test_invalid_github_ids_and_release_tag_mismatch_fail(self):
        for identifier in (True, False, 0, -1, "37", None):
            with self.subTest(identifier=identifier), self.assertRaises(updater.UpdateError): updater.positive_id(identifier, "asset")
        with self.assertRaisesRegex(updater.UpdateError, "anderen Tag"): updater.validate_release({"id": 37, "tag_name": "v999.0.0"})
        with self.assertRaisesRegex(updater.UpdateError, "Release-ID"): updater.validate_release({"id": 37, "tag_name": updater.TAG}, 38)

    def test_target_tag_resolves_annotated_tags_but_rejects_wrong_object_types(self):
        with patch.object(updater, "api", side_effect=[{"object": {"type": "tag", "sha": "annotated"}}, {"object": {"type": "commit", "sha": "reviewed"}}]):
            self.assertEqual(updater.target_commit(), "reviewed")
        with patch.object(updater, "api", return_value={"object": {"type": "tree", "sha": "other"}}), self.assertRaisesRegex(updater.UpdateError, "Ungültiger Ziel-Tag"):
            updater.target_commit()

    def test_mismatched_remote_local_tags_and_prereleases_stop_before_upload(self):
        release = {"id": 37, "tag_name": updater.TAG, "draft": True}
        cases = [("other", "reviewed", release, True), ("reviewed", "other", release, True),
                 ("reviewed", "reviewed", release, False), ("reviewed", "reviewed", release | {"prerelease": True}, True),
                 (None, "reviewed", release, True)]
        for remote, local, current, exact in cases:
            with self.subTest(remote=remote, local=local, exact=exact), patch.object(updater, "target_commit", return_value=remote), patch.object(updater, "command", return_value=completed(stdout=local)), patch.object(updater, "find_release", return_value=current), patch.object(updater, "is_payload_commit", return_value=exact), self.assertRaises(updater.UpdateError):
                updater.check_target(ROOT, "reviewed", {})

    def test_interrupted_draft_publication_reuses_paginated_release_id_without_duplicate(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); contents = self.release_outputs(root); identifier = 501
            draft = {"id": identifier, "tag_name": updater.TAG, "draft": True, "prerelease": False, "html_url": "https://github.com/example/release"}
            assets = [{"id": index + 1, "name": name, "state": "uploaded", "size": len(data)} for index, (name, data) in enumerate(contents.items())]
            calls = []
            def api(endpoint, *, missing=False, data=None):
                calls.append((endpoint, data))
                if "/tags/" in endpoint: return None
                if "releases?" in endpoint:
                    return [{"id": index + 1, "tag_name": "vold-" + str(index)} for index in range(100)] if endpoint.endswith("page=1") else [draft]
                if endpoint.endswith("/assets?per_page=100&page=1"): return assets
                if endpoint.endswith("/releases/" + str(identifier)):
                    if data is not None: draft.update(data)
                    return dict(draft)
                raise AssertionError("Unexpected API endpoint or duplicate creation: " + endpoint)
            def download(asset_id, path):
                asset = next(asset for asset in assets if asset["id"] == asset_id)
                path.write_bytes(contents[asset["name"]])
            with patch.object(updater, "api", side_effect=api), patch.object(updater, "target_commit", return_value="reviewed"), patch.object(updater, "assert_identity"), patch.object(updater, "assert_remotes"), patch.object(updater, "upload_asset") as upload, patch.object(updater, "download_asset", side_effect=download), redirect_stdout(io.StringIO()):
                release = updater.publish_release(root, "reviewed", {"id": 1, "login": "Baeka89"})
            self.assertEqual(release["id"], identifier); self.assertFalse(release["draft"]); upload.assert_not_called()
            self.assertFalse(any(endpoint.endswith("/releases") and data is not None for endpoint, data in calls))
            patches = [(endpoint, data) for endpoint, data in calls if data is not None]
            self.assertEqual(patches, [("repos/" + updater.REPO + "/releases/501", {"draft": False, "prerelease": False, "make_latest": "true"})])

    def test_existing_mismatched_asset_aborts_without_upload_or_publication(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); contents = self.release_outputs(root); name = next(iter(contents))
            draft = {"id": 37, "tag_name": updater.TAG, "draft": True}
            assets = {name: {"id": 5, "name": name, "state": "uploaded", "size": len(contents[name]), "digest": "sha256:" + "0" * 64}}
            with patch.object(updater, "target_commit", return_value="reviewed"), patch.object(updater, "find_release", return_value=draft), patch.object(updater, "release_assets", return_value=assets), patch.object(updater, "assert_identity"), patch.object(updater, "assert_remotes"), patch.object(updater, "upload_asset") as upload, patch.object(updater, "api") as api, redirect_stdout(io.StringIO()), self.assertRaisesRegex(updater.UpdateError, "Abweichende Release-Datei"):
                updater.publish_release(root, "reviewed", {"id": 1})
            upload.assert_not_called(); api.assert_not_called()

    def test_previous_checksums_are_preserved_once_and_collision_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); output = root / "dist"; output.mkdir(); checksums = output / "SHA256SUMS.txt"; old = b"previous checksum\n"; checksums.write_bytes(old)
            updater.preserve_release_outputs(root); updater.preserve_release_outputs(root)
            backups = list(output.glob("SHA256SUMS-before-*.txt")); self.assertEqual(len(backups), 1); self.assertEqual(backups[0].read_bytes(), old); self.assertEqual(checksums.read_bytes(), old)
            backups[0].write_bytes(b"unrelated backup")
            with self.assertRaisesRegex(updater.UpdateError, "Prüfsummensicherung"): updater.preserve_release_outputs(root)
            self.assertEqual(backups[0].read_bytes(), b"unrelated backup"); self.assertEqual(checksums.read_bytes(), old)

    def test_previous_output_symlinks_never_modify_their_targets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); outside = root / "outside.txt"; outside.write_bytes(b"keep"); output = root / "dist"; output.mkdir()
            (output / "SHA256SUMS.txt").symlink_to(outside)
            with self.assertRaisesRegex(updater.UpdateError, "Prüfsummendatei"): updater.preserve_release_outputs(root)
            self.assertEqual(outside.read_bytes(), b"keep")

    def test_existing_target_archive_requires_exact_reviewed_component_content(self):
        payload = fixture_files(); expected = {name: data for name, data in payload.items() if name.startswith("custom_components/card_library/")}
        with tempfile.TemporaryDirectory() as directory, embedded(payload):
            root = Path(directory); output = root / "dist"; output.mkdir(); archive = output / ("library-card-" + updater.TAG + ".zip")
            good = bundle_bytes(list(expected.items())); archive.write_bytes(good); updater.preserve_release_outputs(root); self.assertEqual(archive.read_bytes(), good)
            for contents in ([(name, b"wrong") for name in expected], list(expected.items()) + [("extra.txt", b"foreign")], [("wrong/path", b"foreign")]):
                bad = bundle_bytes(contents); archive.write_bytes(bad)
                with self.assertRaisesRegex(updater.UpdateError, "Abweichendes vorhandenes Zielarchiv"): updater.preserve_release_outputs(root)
                self.assertEqual(archive.read_bytes(), bad)
            archive.write_bytes(b"not a zip")
            with self.assertRaisesRegex(updater.UpdateError, "Beschädigtes vorhandenes Zielarchiv"): updater.preserve_release_outputs(root)
            self.assertEqual(archive.read_bytes(), b"not a zip")

    def test_generated_updater_contains_verified_sources_and_matching_checksum(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "source"; root.mkdir(); payload = fixture_files()
            for name, data in payload.items():
                target = root / name; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(data)
            (root / "scripts").mkdir(); (root / "scripts/update_publication.py").write_bytes((ROOT / "scripts/update_publication.py").read_bytes())
            for name in (".env", ".env.private", ".storage/private", "dist/old.zip", ".publication/marker", ".venv/private"):
                target = root / name; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(b"private")
            destination = Path(directory) / "Complete updater.py"
            metadata = generator.build(root, destination)
            built = load_module("generated_offline_updater", destination)
            contents = built.files()
            self.assertEqual(contents | payload, contents); self.assertEqual(len(contents), len(payload) + 1)
            self.assertEqual(metadata["sha256"], hashlib.sha256(destination.read_bytes()).hexdigest()); self.assertEqual(metadata["bytes"], destination.stat().st_size)
            self.assertEqual(built.VERSION, updater.VERSION); self.assertEqual(built.BASE, updater.BASE)
            with self.assertRaises(FileExistsError): generator.build(root, destination)


if __name__ == "__main__":
    unittest.main()


class RemoteVersionTest(unittest.TestCase):
    def test_all_published_numeric_versions_are_checked_without_reusing_historical_local_versions(self):
        previous=[{'tag_name':'v0.5.2','draft':False},{'tag_name':'v0.5.1','draft':False},{'tag_name':'v9.0.0','draft':True}]
        with patch.object(updater,'api',return_value=previous):updater.validate_remote_versions()
        with patch.object(updater,'api',return_value=[{'tag_name':'v2.0.0','draft':False}]),self.assertRaisesRegex(updater.UpdateError,'Weitere Veröffentlichung'):updater.validate_remote_versions()
    def test_divergent_release_notes_cannot_be_published_from_an_existing_draft(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'RELEASE-NOTES.md').write_text('Reviewed',encoding='utf-8')
            draft={'id':3,'tag_name':updater.TAG,'draft':True,'body':'Changed elsewhere'}
            with patch.object(updater,'assert_identity'),patch.object(updater,'assert_remotes'),patch.object(updater,'target_commit',return_value='reviewed'),patch.object(updater,'find_release',return_value=draft),patch.object(updater,'upload_asset') as upload,self.assertRaisesRegex(updater.UpdateError,'Release-Text'):
                updater.publish_release(root,'reviewed',{'id':1})
            upload.assert_not_called()
