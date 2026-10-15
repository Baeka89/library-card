"""Build the installable integration ZIP without local data or caches."""
from pathlib import Path
import hashlib
import json
import os
import re
import tempfile
import zipfile


def build(root: Path) -> Path:
    component = root / "custom_components/card_library"
    if component.is_symlink() or component.parent.is_symlink():
        raise ValueError("The integration directory must not be a symlink")
    version = json.loads((component / "manifest.json").read_text(encoding="utf-8"))["version"]
    if not isinstance(version, str) or not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", version):
        raise ValueError("A stable numeric release version is required")
    paths = []
    for path in sorted(component.rglob("*")):
        relative = path.relative_to(component)
        if any(part in {"__pycache__", ".storage", ".git", ".venv", "node_modules"} or part == ".env" or part.startswith(".env.") for part in relative.parts) or path.name in {"secrets.yaml", ".DS_Store", "Thumbs.db"} or path.name.startswith("home-assistant.log") or path.suffix in {".pyc", ".pyo"}:
            continue
        if path.is_symlink():
            raise ValueError(f"Symlink is not allowed in the release: {path}")
        if path.is_file():
            paths.append(path)
    output = root / "dist"
    if output.is_symlink():
        raise ValueError("The release output directory must not be a symlink")
    output.mkdir(exist_ok=True)
    archive = output / f"library-card-v{version}.zip"
    checksums = output / "SHA256SUMS.txt"
    if archive.is_symlink() or checksums.is_symlink():
        raise ValueError("Release output files must not be symlinks")
    temporary = []
    try:
        with tempfile.NamedTemporaryFile(dir=output, suffix=".zip", delete=False) as handle:
            staged_archive = Path(handle.name)
        temporary.append(staged_archive)
        with zipfile.ZipFile(staged_archive, "w", zipfile.ZIP_DEFLATED) as bundle:
            for path in paths:
                info = zipfile.ZipInfo(path.relative_to(root).as_posix(), date_time=(1980, 1, 1, 0, 0, 0))
                info.create_system = 3
                info.external_attr = 0o100644 << 16
                bundle.writestr(info, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
        with zipfile.ZipFile(staged_archive) as bundle:
            if bundle.testzip():
                raise ValueError("Release ZIP failed its integrity check")
        digest = hashlib.sha256(staged_archive.read_bytes()).hexdigest()
        with tempfile.NamedTemporaryFile(dir=output, mode="w", encoding="utf-8", delete=False) as handle:
            staged_checksums = Path(handle.name)
            temporary.append(staged_checksums)
            handle.write(f"{digest}  {archive.name}\n")
        os.replace(staged_archive, archive)
        os.replace(staged_checksums, checksums)
    finally:
        for path in temporary:
            path.unlink(missing_ok=True)
    return archive


if __name__ == "__main__":
    print(build(Path(__file__).resolve().parents[1]))
