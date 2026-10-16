"""Publication tests run locally with fake GitHub calls; they never publish."""
from pathlib import Path
import importlib.util
import hashlib
import json
from subprocess import CompletedProcess
import os
import tempfile
import struct
import unittest
import zlib
import zipfile
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("library_card_publisher", ROOT / "publish.py")
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)
spec = importlib.util.spec_from_file_location("release_builder", ROOT / "scripts/build_release.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
spec = importlib.util.spec_from_file_location("release_preflight", ROOT / "scripts/check_release.py")
preflight = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preflight)


def result(command, stdout="", code=0, stderr=""):
    return CompletedProcess(command, code, stdout, stderr)


class PublicationTest(unittest.TestCase):
    def release_root(self, directory):
        root = Path(directory)
        component = root / "custom_components/card_library"
        component.mkdir(parents=True)
        (component / "manifest.json").write_text(json.dumps({"version": publisher.VERSION}))
        (component / "config.py").write_text("example = 1\n")
        return root, component

    def test_invalid_names_cannot_be_used_as_commands_or_paths(self):
        for name in ("--help", "../other", "owner/repository", "name;echo x", "name with spaces"):
            with self.subTest(name=name), self.assertRaises(publisher.PublicationError):
                publisher.valid_name(name)

    def test_staging_does_not_overwrite_unrelated_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); source = root / "source"; target = root / "Projects/Existing"
            source.mkdir(); (source / "hello.py").write_text("original")
            target.mkdir(parents=True); (target / "important.txt").write_text("keep")
            with self.assertRaises(publisher.PublicationError):
                publisher.stage_project(source, target)
            self.assertEqual((target / "important.txt").read_text(), "keep")

    def test_restart_preserves_local_edits_and_paths_with_spaces(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); source = root / "Source Files"; target = root / "My Projects/library-card"
            source.mkdir(); (source / "hello.py").write_text("original")
            publisher.stage_project(source, target); (target / "hello.py").write_text("local edit")
            publisher.stage_project(source, target)
            self.assertEqual((target / "hello.py").read_text(), "local edit")

    def test_foreign_publication_marker_does_not_authorize_staging(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source"
            target = Path(directory) / "target"
            source.mkdir()
            (source / "hello.py").write_text("original")
            (target / ".publication").mkdir(parents=True)
            (target / ".publication/project.json").write_text('{"project":"another-project"}')
            with self.assertRaisesRegex(publisher.PublicationError, "Library Card"):
                publisher.stage_project(source, target)
            self.assertFalse((target / "hello.py").exists())

    def test_staging_excludes_home_assistant_data_and_environment_secrets(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source"
            target = Path(directory) / "target"
            source.mkdir()
            for name in (".env", ".env.production", "secrets.yaml", "home-assistant.log.1", ".DS_Store", "README.md"):
                (source / name).write_text("contents")
            (source / ".storage").mkdir()
            (source / ".storage/config").write_text("private")
            publisher.stage_project(source, target)
            self.assertEqual({p.name for p in target.iterdir()}, {"README.md", ".publication"})

    def test_release_archive_is_identical_after_file_timestamp_changes(self):
        spec=importlib.util.spec_from_file_location('release_builder',ROOT/'scripts/build_release.py');builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);component=root/'custom_components/card_library';component.mkdir(parents=True)
            manifest=component/'manifest.json';manifest.write_text('{"version":"1.0.0"}');(component/'config.py').write_text('example = 1\n')
            first=builder.build(root).read_bytes();os.utime(manifest,(2000000000,2000000000));second=builder.build(root).read_bytes()
            self.assertEqual(first,second)

    def test_failed_release_read_preserves_existing_zip_and_checksums(self):
        with tempfile.TemporaryDirectory() as directory:
            root, component = self.release_root(directory)
            archive = builder.build(root)
            checksums = root / "dist/SHA256SUMS.txt"
            old_archive, old_checksums = archive.read_bytes(), checksums.read_bytes()
            original_read = Path.read_bytes
            def read(path):
                if path == component / "config.py":
                    raise OSError("Interrupted source read")
                return original_read(path)
            with patch.object(Path, "read_bytes", read), self.assertRaises(OSError):
                builder.build(root)
            self.assertEqual(archive.read_bytes(), old_archive)
            self.assertEqual(checksums.read_bytes(), old_checksums)
            self.assertEqual({p.name for p in (root / "dist").iterdir()}, {archive.name, checksums.name})

    def test_release_rejects_directory_symlinks(self):
        with tempfile.TemporaryDirectory() as directory:
            root, component = self.release_root(directory)
            outside = root / "outside"
            outside.mkdir()
            (outside / "private.py").write_text("private")
            (component / "linked").symlink_to(outside, target_is_directory=True)
            with self.assertRaisesRegex(ValueError, "Symlink"):
                builder.build(root)
            self.assertFalse((root / "dist").exists())

    def test_release_rejects_symlink_output_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            root, _ = self.release_root(directory)
            outside = root / "outside"
            outside.mkdir()
            (root / "dist").symlink_to(outside, target_is_directory=True)
            with self.assertRaisesRegex(ValueError, "symlink"):
                builder.build(root)
            self.assertEqual(list(outside.iterdir()), [])

    def test_release_version_cannot_escape_output_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            root, component = self.release_root(directory)
            for version in ("../../outside", "1.0.0/../../other", "", None):
                (component / "manifest.json").write_text(json.dumps({"version": version}))
                with self.subTest(version=version), self.assertRaisesRegex(ValueError, "version"):
                    builder.build(root)
            self.assertFalse((root / "dist").exists())

    def test_installable_zip_excludes_local_files_and_keeps_runtime_sources(self):
        with tempfile.TemporaryDirectory() as directory:
            root, component = self.release_root(directory)
            for name in (".env", ".env.production", "secrets.yaml", "home-assistant.log", ".DS_Store", "cached.pyc"):
                (component / name).write_text("private")
            (component / ".storage").mkdir()
            (component / ".storage/data").write_text("private")
            with zipfile.ZipFile(builder.build(root)) as bundle:
                self.assertEqual(set(bundle.namelist()), {"custom_components/card_library/manifest.json", "custom_components/card_library/config.py"})

    def test_approved_brand_assets_are_complete_decodable_png_streams(self):
        for name, size in (("icon.png", 256), ("icon@2x.png", 512)):
            data = (ROOT / "custom_components/card_library/brand" / name).read_bytes()
            with self.subTest(name=name):
                self.assertTrue(preflight.valid_png(data, size))
                self.assertFalse(preflight.valid_png(data, size // 2))
                self.assertFalse(preflight.valid_png(data[:-1], size))
                self.assertFalse(preflight.valid_png(data + b"extra", size))
                damaged = bytearray(data)
                damaged[len(damaged) // 2] ^= 1
                self.assertFalse(preflight.valid_png(bytes(damaged), size))

    def test_short_png_headers_are_rejected_without_crashing(self):
        data = (ROOT / "custom_components/card_library/brand/icon.png").read_bytes()
        for count in range(40):
            with self.subTest(count=count):
                self.assertFalse(preflight.valid_png(data[:count], 256))

    def test_png_pixels_and_filter_bytes_are_validated(self):
        def chunk(kind, body):
            return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)
        header = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0))
        for raw, accepted in ((b"\0\0\0\0\0", True), (b"\5\0\0\0\0", False), (b"\0", False), (b"\0" * 100000, False)):
            data = header + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")
            with self.subTest(length=len(raw), accepted=accepted):
                self.assertEqual(preflight.valid_png(data, 1), accepted)

    def test_account_switch_is_detected_before_further_remote_writes(self):
        class Fake:
            def api(self,endpoint):return {'id':999,'login':'another-user'}
        with self.assertRaises(publisher.PublicationError):publisher.assert_identity(Fake(),{'id':123,'login':'owner'})

    def test_local_dependency_install_and_git_commands_never_use_a_shell(self):
        with patch.object(publisher.subprocess, "run", return_value=result([], "ok")) as run:
            publisher.Runner().run(["git", "add", "file with spaces.py"], ROOT)
            self.assertEqual(run.call_args.args[0], ["git", "add", "file with spaces.py"])
            self.assertNotIn("shell", run.call_args.kwargs)
            self.assertEqual(run.call_args.kwargs['env']['PYTHONUTF8'],'1')
            self.assertEqual(run.call_args.kwargs['env']['GH_HOST'],'github.com')

    def test_failed_workflow_stops_before_release(self):
        class Fake:
            def run(self, command, **kwargs):
                return result(command, json.dumps([{"databaseId": 1, "headSha": "abc", "status": "completed", "conclusion": "failure", "url": "https://github.com/run/1"}]))
        with self.assertRaises(publisher.PublicationError):
            publisher.wait_workflow(Fake(), "owner/library-card", "hacs.yml", "abc", 1)

    def test_success_with_skipped_jobs_is_not_accepted(self):
        class Fake:
            def run(self, command, **kwargs):
                return result(command, json.dumps([{"databaseId": 1, "headSha": "abc", "status": "completed", "conclusion": "success", "url": "https://github.com/run/1"}]))
            def api(self, endpoint):
                return {"jobs": [{"conclusion": "skipped"}]}
        with self.assertRaises(publisher.PublicationError):
            publisher.wait_workflow(Fake(), "owner/library-card", "hacs.yml", "abc", 1)

    def test_workflow_checks_every_job_page(self):
        class Fake:
            def run(self, command, **kwargs):
                return result(command, json.dumps([{"databaseId": 1, "headSha": "abc", "status": "completed", "conclusion": "success", "url": "run"}]))
            def api(self, endpoint):
                if "page=2" in endpoint:
                    return {"jobs": [{"conclusion": "skipped"}]}
                return {"total_count": 101, "jobs": [{"conclusion": "success"}] * 100}
        with self.assertRaisesRegex(publisher.PublicationError, "übersprungen"):
            publisher.wait_workflow(Fake(), "owner/library-card", "hacs.yml", "abc", 1)

    def test_workflow_incomplete_job_pages_stop_release(self):
        class Fake:
            def run(self, command, **kwargs):
                return result(command, json.dumps([{"databaseId": 1, "headSha": "abc", "status": "completed", "conclusion": "success", "url": "run"}]))
            def api(self, endpoint):
                return {"total_count": 101, "jobs": [] if "page=2" in endpoint else [{"conclusion": "success"}] * 100}
        with self.assertRaisesRegex(publisher.PublicationError, "vollständig"):
            publisher.wait_workflow(Fake(), "owner/library-card", "hacs.yml", "abc", 1)

    def test_workflow_accepts_complete_successful_job_pages(self):
        class Fake:
            def run(self, command, **kwargs):
                return result(command, json.dumps([{"databaseId": 1, "headSha": "abc", "status": "completed", "conclusion": "success", "url": "run"}]))
            def api(self, endpoint):
                return {"total_count": 101, "jobs": [{"conclusion": "success"}] * (1 if "page=2" in endpoint else 100)}
        self.assertEqual(publisher.wait_workflow(Fake(), "owner/library-card", "hacs.yml", "abc", 1)["headSha"], "abc")

    def test_successful_workflow_must_match_the_exact_commit(self):
        class Fake:
            def run(self, command, **kwargs):
                return result(command, json.dumps([{"databaseId": 1, "headSha": "other", "status": "completed", "conclusion": "success", "url": "https://github.com/run/1"}]))
        with self.assertRaises(publisher.PublicationError):
            publisher.wait_workflow(Fake(), "owner/library-card", "hacs.yml", "abc", 1)

    def test_failed_gh_auth_is_not_treated_as_missing_repository(self):
        class Fake:
            def run(self, command, *args, **kwargs):
                return result(command, code=1, stderr="HTTP 401 authentication failed")
        with self.assertRaises(publisher.PublicationError):
            publisher.ensure_repository(Fake(), ROOT, "owner/library-card", {"login": "owner", "id": 1})

    def test_separate_wrong_push_remote_stops_before_github_changes(self):
        class Fake:
            def run(self, command, cwd=None, allow_failure=False):
                if command[:2] != ["git", "rev-parse"] and command[:2] != ["git", "branch"] and command[:2] != ["git", "remote"]:
                    raise AssertionError("GitHub must not be contacted")
                if command[:2] == ["git", "rev-parse"]:
                    return result(command, str(cwd))
                if command[:2] == ["git", "branch"]:
                    return result(command, "main")
                return result(command, "https://github.com/another/project.git" if "--push" in command else "https://github.com/owner/library-card.git")
            def api(self, *args, **kwargs):
                raise AssertionError("GitHub must not be changed")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".git").mkdir()
            with self.assertRaisesRegex(publisher.PublicationError, "origin"):
                publisher.ensure_repository(Fake(), root, "owner/library-card", {"login": "owner", "id": 1})

    def test_foreign_repository_branches_are_not_adopted_even_with_stale_zero_size(self):
        class Fake:
            def run(self,command,*args,**kwargs):
                if command[:2]==['git','ls-remote']:return result(command,'abcdef\trefs/heads/main\n')
                if str(command[-1]).endswith('manifest.json'):return result(command,code=1,stderr='HTTP 404 Not Found')
                return result(command,json.dumps({'private':False,'archived':False,'size':0}))
            def api(self,*args,**kwargs):raise AssertionError('Remote metadata must not be changed')
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'.publication').mkdir();(root/'.publication/project.json').write_text('{}')
            with self.assertRaisesRegex(publisher.PublicationError,'Branches'):
                publisher.ensure_repository(Fake(),root,'owner/library-card',{'login':'owner','id':1})

    def test_catalogue_addition_is_sorted_and_only_adds_one_entry(self):
        original = '[\n  "A/one",\n  "b/two",\n  "Z/last"\n]\n'
        changed = publisher.add_sorted_repository(original, "Owner/library-card")
        self.assertEqual(json.loads(changed), ["A/one", "b/two", "Owner/library-card", "Z/last"])
        self.assertEqual(set(json.loads(changed)) - set(json.loads(original)), {"Owner/library-card"})

    def test_case_insensitive_existing_catalogue_entry_is_not_duplicated(self):
        original = '["Owner/library-card"]'
        self.assertEqual(publisher.add_sorted_repository(original, "owner/library-card"), original)

    def test_upstream_format_changes_are_not_silently_rewritten(self):
        for original in ('{"repos": []}', '["z/last", "a/first"]'):
            with self.assertRaises(publisher.PublicationError):
                publisher.add_sorted_repository(original, "owner/library-card")

    def test_changed_upstream_attestations_require_review(self):
        with self.assertRaises(publisher.PublicationError):
            publisher.fill_hacs_template("- [ ] New condition\n", {"html_url": "release"}, {})

    def test_verified_submission_fills_every_attestation_and_evidence_link(self):
        template='''## Checklist
- [ ] Read publishing guidelines
- [ ] Added HACS action
- [ ] Added hassfest action
- [ ] Actions passing without disabled checks
- [ ] Link to action run provided
- [ ] Release created after actions completed successfully
Link to current release: <>
Link to successful HACS action: <>
Link to successful hassfest action: <>
'''
        body=publisher.fill_hacs_template(template,{"html_url":"https://github.com/owner/repo/releases/tag/v1.0.0"},{"hacs":{"url":"https://github.com/run/hacs"},"hassfest":{"url":"https://github.com/run/hassfest"}})
        self.assertEqual(body.count('[x]'),6);self.assertNotIn('[ ]',body);self.assertNotIn('<>',body);self.assertIn('<https://github.com/run/hacs>',body)

    def test_release_created_before_checks_cannot_be_submitted(self):
        class Fake:
            def run(self, command, **kwargs):
                assets=[{"name":"library-card-v1.0.0.zip","state":"uploaded","size":3,"digest":"sha256:"+hashlib.sha256(b"zip").hexdigest()},{"name":"SHA256SUMS.txt","state":"uploaded","size":3,"digest":"sha256:"+hashlib.sha256(b"sum").hexdigest()}]
                return result(command,json.dumps({"html_url":"release","published_at":"2026-10-12T10:00:00Z","assets":assets}))
            def api(self, endpoint):
                if '/git/ref/' in endpoint:return {"object":{"type":"commit","sha":"abc"}}
                return {"updated_at":"2026-10-12T11:00:00Z"}
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'dist').mkdir();(root/'dist/library-card-v1.0.0.zip').write_bytes(b'zip');(root/'dist/SHA256SUMS.txt').write_text('sum')
            with self.assertRaisesRegex(publisher.PublicationError,'älter'):
                publisher.release_repository(Fake(),root,'owner/library-card','abc',{"hacs":{"databaseId":1}})

    def test_release_without_api_digest_must_match_downloaded_bytes(self):
        class Fake:
            def run(self, command, **kwargs):
                if command[:3] == ["gh", "release", "download"]:
                    name = command[command.index("--pattern") + 1]
                    destination = Path(command[command.index("--dir") + 1]) / name
                    destination.write_bytes(b"bad")
                    return result(command)
                assets = [{"name": "library-card-v1.0.0.zip", "state": "uploaded", "size": 3}, {"name": "SHA256SUMS.txt", "state": "uploaded", "size": 3}]
                return result(command, json.dumps({"published_at": "2026-10-12T10:00:00Z", "assets": assets}))
            def api(self, endpoint):
                return {"object": {"type": "commit", "sha": "abc"}}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "dist").mkdir()
            (root / "dist/library-card-v1.0.0.zip").write_bytes(b"zip")
            (root / "dist/SHA256SUMS.txt").write_bytes(b"sum")
            with self.assertRaisesRegex(publisher.PublicationError, "lokal geprüften"):
                publisher.release_repository(Fake(), root, "owner/library-card", "abc", {})

    def test_release_without_api_digest_accepts_identical_downloads(self):
        class Fake:
            def run(self, command, **kwargs):
                if command[:3] == ["gh", "release", "download"]:
                    name = command[command.index("--pattern") + 1]
                    destination = Path(command[command.index("--dir") + 1]) / name
                    destination.write_bytes(b"zip" if name.endswith(".zip") else b"sum")
                    return result(command)
                assets = [{"name": "library-card-v1.0.0.zip", "state": "uploaded", "size": 3}, {"name": "SHA256SUMS.txt", "state": "uploaded", "size": 3}]
                return result(command, json.dumps({"html_url": "release", "published_at": "2026-10-12T10:00:00Z", "assets": assets}))
            def api(self, endpoint):
                return {"object": {"type": "commit", "sha": "abc"}}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "dist").mkdir()
            (root / "dist/library-card-v1.0.0.zip").write_bytes(b"zip")
            (root / "dist/SHA256SUMS.txt").write_bytes(b"sum")
            self.assertEqual(publisher.release_repository(Fake(), root, "owner/library-card", "abc", {})["html_url"], "release")

    def test_existing_release_for_another_commit_is_never_overwritten(self):
        class Fake:
            def run(self, command, **kwargs):return result(command,json.dumps({"published_at":"2026-10-12T10:00:00Z"}))
            def api(self, endpoint):return {"object":{"type":"commit","sha":"wrong"}}
        with self.assertRaisesRegex(publisher.PublicationError,'geprüften Commit'):
            publisher.release_repository(Fake(),ROOT,'owner/library-card','abc',{})

    def test_no_submission_without_the_owners_documentation_acknowledgement(self):
        with self.assertRaises(publisher.PublicationError):
            publisher.main(["--publish", "--submit-hacs", "--dry-run"])

    def test_dry_run_has_no_local_or_remote_side_effects(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "Not Created"
            with patch.object(publisher, "stage_project") as stage, patch.object(publisher.Runner, "api") as api:
                self.assertEqual(publisher.main(["--dry-run", "--project-dir", str(target)]), 0)
            stage.assert_not_called(); api.assert_not_called(); self.assertFalse(target.exists())

    def test_complete_publication_orders_checks_before_release_and_submission(self):
        class Fake:
            def run(self, command, **kwargs):
                return result(command)
            def api(self, endpoint):
                return {"login": "owner", "id": 123}
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/".publication").mkdir();order=[]
            with patch.object(publisher.shutil,"which",return_value="installed"), patch.object(publisher,"stage_project",return_value=root), patch.object(publisher,"configure"), patch.object(publisher,"run_local_checks",side_effect=lambda *_:order.append("local")), patch.object(publisher,"ensure_repository",return_value="abc"), patch.object(publisher,"wait_workflow",side_effect=lambda _,__,filename,*args:order.append(filename) or {"url":filename}), patch.object(publisher,"release_repository",side_effect=lambda *_:order.append("release") or {"html_url":"release-url"}), patch.object(publisher,"submit_hacs",side_effect=lambda *_:order.append("submission") or "pr-url"):
                publisher.main(["--publish","--submit-hacs","--ack-publishing-docs"],Fake())
            self.assertEqual(order,["local","hacs.yml","hassfest.yml","tests.yml","release","submission"])

    def test_hacs_failure_in_full_flow_creates_neither_release_nor_request(self):
        class Fake:
            def run(self, command, **kwargs):
                return result(command)
            def api(self, endpoint):
                return {"login":"owner","id":123}
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(publisher.shutil,"which",return_value="installed"),patch.object(publisher,"stage_project",return_value=Path(directory)),patch.object(publisher,"configure"),patch.object(publisher,"run_local_checks"),patch.object(publisher,"ensure_repository",return_value="abc"),patch.object(publisher,"wait_workflow",side_effect=publisher.PublicationError("failed")),patch.object(publisher,"release_repository") as release,patch.object(publisher,"submit_hacs") as submit:
                with self.assertRaises(publisher.PublicationError):publisher.main(["--publish","--submit-hacs","--ack-publishing-docs"],Fake())
            release.assert_not_called();submit.assert_not_called()


if __name__ == "__main__":
    unittest.main()
