"""Local prerequisites; remote HACS checks remain mandatory before submission."""
from pathlib import Path
import argparse
import json
import re
import struct

import yaml

VERSION = "0.5.1"


def check(root: Path, configured: bool = True) -> list[str]:
    problems = []
    components = root / "custom_components"
    directories = [p.name for p in components.iterdir() if p.is_dir() and p.name != "__pycache__"]
    if directories != ["card_library"]:
        problems.append("Exactly one integration, custom_components/card_library, is required")
    component = components / "card_library"
    manifest = json.loads((component / "manifest.json").read_text(encoding="utf-8"))
    required = {"domain", "name", "documentation", "issue_tracker", "codeowners", "version"}
    if required - manifest.keys():
        problems.append("The integration manifest is incomplete")
    if manifest.get("domain") != "card_library" or manifest.get("version") != VERSION:
        problems.append("Integration domain/version do not match the public release")
    if json.loads((root / "package.json").read_text(encoding="utf-8")).get("version") != VERSION:
        problems.append("Frontend package version does not match")
    owners = manifest.get("codeowners", [])
    if not owners or any(not re.fullmatch(r"@[A-Za-z0-9][A-Za-z0-9-]{0,38}", value) for value in owners):
        problems.append("At least one valid GitHub codeowner is required")
    if configured and ("GITHUB_OWNER" in json.dumps(manifest) or "@github-owner" in owners):
        problems.append("GitHub identity is not configured; run publish.py first")
    for key in ("documentation", "issue_tracker"):
        if not manifest.get(key, "").startswith("https://github.com/"):
            problems.append(f"{key} must point to the public GitHub repository")
    if manifest.get("config_flow") and not (component / "config_flow.py").is_file():
        problems.append("Config flow is missing")
    hacs = json.loads((root / "hacs.json").read_text(encoding="utf-8"))
    if not hacs.get("name") or hacs.get("content_in_root") or hacs.get("zip_release"):
        problems.append("HACS metadata must use the standard integration layout")
    for required_file in ("LICENSE", "README.md", "RELEASE-NOTES.md", "BUBBLE-POPUPS.md"):
        if not (root / required_file).is_file():
            problems.append(f"Missing {required_file}")
    if "MIT License" not in (root / "LICENSE").read_text(encoding="utf-8"):
        problems.append("The chosen MIT license is missing")
    for filename, expected in (("icon.png", 256), ("icon@2x.png", 512)):
        path = component / "brand" / filename
        if not path.is_file():
            problems.append(f"Missing local brand asset {filename}")
        else:
            data = path.read_bytes()
            if data[:8] != b"\x89PNG\r\n\x1a\n" or struct.unpack(">II", data[16:24]) != (expected, expected):
                problems.append(f"Invalid PNG dimensions for {filename}")
    modules = list((component / "frontend").glob("*.js"))
    if len(modules) != 7:
        problems.append("The seven frontend modules must be included")
    for path in modules:
        for reference in re.findall(r"(?:from\s*|import\s*)['\"](\./[^'\"]+)['\"]", path.read_text(encoding="utf-8")):
            target, _, query = reference.partition("?")
            if not (path.parent / target).is_file() or query != f"v={VERSION}":
                problems.append(f"Invalid module/version reference in {path.name}: {reference}")
    for language in ("en", "de"):
        json.loads((component / "translations" / f"{language}.json").read_text(encoding="utf-8"))
    for filename, action, job in (("hacs.yml", "hacs/action@", "hacs"), ("hassfest.yml", "home-assistant/actions/hassfest@", "hassfest")):
        workflow = yaml.load((root / ".github/workflows" / filename).read_text(encoding="utf-8"), Loader=yaml.BaseLoader)
        item = workflow.get("jobs", {}).get(job, {})
        steps = item.get("steps", [])
        matches = [step for step in steps if step.get("uses", "").startswith(action)]
        if len(matches) != 1 or "if" in item or "if" in matches[0] or "continue-on-error" in item or "continue-on-error" in matches[0]:
            problems.append(f"{filename} must run its mandatory validator without skips")
        elif "ignore" in matches[0].get("with", {}):
            problems.append("HACS validation must not use an ignore key")
        if job == "hacs" and matches and matches[0].get("with", {}).get("category") != "integration":
            problems.append("HACS action category must be integration")
    return problems


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--configured", action="store_true")
    args = parser.parse_args()
    failures = check(Path(__file__).resolve().parents[1], args.configured)
    for failure in failures:
        print("FAIL:", failure)
    if failures:
        raise SystemExit(1)
    print("PASS: local release requirements (remote HACS checks are separate)")
