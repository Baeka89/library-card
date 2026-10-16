"""Local prerequisites; remote HACS checks remain mandatory before submission."""
from pathlib import Path
import argparse
import json
import re
import struct
import zlib

import yaml

VERSION = "1.0.0"


def valid_png(data: bytes, expected: int) -> bool:
    """Check the actual PNG stream, including CRCs and bounded pixel data."""
    if len(data) > 5 * 1024 * 1024 or data[:8] != b"\x89PNG\r\n\x1a\n":
        return False
    offset = 8
    header = None
    palette = False
    pixels = bytearray()
    pixels_finished = False
    ended = False
    while offset < len(data):
        if len(data) - offset < 12:
            return False
        size = struct.unpack_from(">I", data, offset)[0]
        kind = data[offset + 4:offset + 8]
        end = offset + 12 + size
        if end > len(data) or not re.fullmatch(rb"[A-Za-z]{4}", kind):
            return False
        body = data[offset + 8:end - 4]
        crc = struct.unpack_from(">I", data, end - 4)[0]
        if zlib.crc32(kind + body) & 0xFFFFFFFF != crc:
            return False
        if header is None and kind != b"IHDR":
            return False
        if kind == b"IHDR":
            if header is not None or size != 13:
                return False
            header = struct.unpack(">IIBBBBB", body)
            width, height, depth, colour, compression, filtering, interlace = header
            depths = {0: {1, 2, 4, 8, 16}, 2: {8, 16}, 3: {1, 2, 4, 8}, 4: {8, 16}, 6: {8, 16}}
            if (width, height) != (expected, expected) or depth not in depths.get(colour, set()) or compression or filtering or interlace not in (0, 1):
                return False
        elif kind == b"PLTE":
            if palette or pixels or not size or size % 3 or size > 768 or header[3] in (0, 4):
                return False
            if header[3] == 3 and size // 3 > 2 ** header[2]:
                return False
            palette = True
        elif kind == b"IDAT":
            if pixels_finished or (header[3] == 3 and not palette):
                return False
            pixels.extend(body)
        elif kind == b"IEND":
            if size or not pixels or end != len(data):
                return False
            ended = True
            break
        else:
            if kind[0] & 32 == 0:
                return False  # Unknown critical chunks cannot be decoded safely.
            if pixels:
                pixels_finished = True
        offset = end
    if not ended or header is None:
        return False
    width, height, depth, colour, _, _, interlace = header
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[colour]
    passes = ((0, 0, 1, 1),) if not interlace else (
        (0, 0, 8, 8), (4, 0, 8, 8), (0, 4, 4, 8), (2, 0, 4, 4),
        (0, 2, 2, 4), (1, 0, 2, 2), (0, 1, 1, 2),
    )
    rows = []
    for x, y, dx, dy in passes:
        columns = max(0, (width - x + dx - 1) // dx)
        count = max(0, (height - y + dy - 1) // dy)
        if columns and count:
            rows.extend([1 + (columns * channels * depth + 7) // 8] * count)
    expected_bytes = sum(rows)
    try:
        decoder = zlib.decompressobj()
        raw = decoder.decompress(pixels, expected_bytes + 1)
    except zlib.error:
        return False
    if len(raw) != expected_bytes or not decoder.eof or decoder.unused_data or decoder.unconsumed_tail:
        return False
    offset = 0
    for size in rows:
        if raw[offset] > 4:
            return False
        offset += size
    return True


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
            if not valid_png(data, expected):
                problems.append(f"Invalid PNG image or dimensions for {filename}")
    modules = list((component / "frontend").glob("*.js"))
    expected_modules = {"card-library.js", "library-core.js", "library-ha-ui.js", "library-manager-tools.js", "library-popup.js", "library-tools.js", "library-ui.js", "library-workflows.js", "library-yaml-export.js", "library-editor-scope.js", "library-bubble-preload.js", "library-preloaded-popups.js"}
    if {path.name for path in modules} != expected_modules:
        problems.append("All twelve frontend modules must be included")
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
