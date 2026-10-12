"""Build the installable integration ZIP without local data or caches."""
from pathlib import Path
import hashlib
import json
import zipfile


def build(root: Path) -> Path:
    component = root / "custom_components/card_library"
    version = json.loads((component / "manifest.json").read_text(encoding="utf-8"))["version"]
    output = root / "dist"
    output.mkdir(exist_ok=True)
    archive = output / f"library-card-v{version}.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
        for path in sorted(component.rglob("*")):
            if path.is_file() and "__pycache__" not in path.parts and path.suffix not in {".pyc", ".pyo"}:
                if path.is_symlink():
                    raise ValueError(f"Symlink is not allowed in the release: {path}")
                info = zipfile.ZipInfo(path.relative_to(root).as_posix(), date_time=(1980, 1, 1, 0, 0, 0))
                info.create_system = 3
                info.external_attr = 0o100644 << 16
                bundle.writestr(info, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    with zipfile.ZipFile(archive) as bundle:
        if bundle.testzip():
            raise ValueError("Release ZIP failed its integrity check")
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    (output / "SHA256SUMS.txt").write_text(f"{digest}  {archive.name}\n")
    return archive


if __name__ == "__main__":
    print(build(Path(__file__).resolve().parents[1]))
