import json
import os
import sys
import zipfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DIST_DIR = REPO_ROOT / "dist"

# Core runtime directories and files required by the extension
EXTENSION_DIRS = ["popup", "icons", "utils", "background"]
ROOT_FILES = ["manifest.json", "background.js"]
EXCLUDE_FILE_PATTERNS = (".test.js", ".spec.js", ".pyc", ".swp", ".map")


def is_packageable_file(path: Path) -> bool:
    """Filter out non-runtime, hidden, and test files."""
    if not path.is_file():
        return False
    # Exclude hidden files or any path containing hidden directory segments (.git, .cache, etc.)
    if any(part.startswith(".") for part in path.parts):
        return False
    # Exclude tests, sourcemaps, and cache artifacts
    name = path.name.lower()
    if name.endswith(EXCLUDE_FILE_PATTERNS) or "__pycache__" in path.parts:
        return False
    return True


def validate_manifest(manifest: dict, pkg: dict) -> None:
    """Ensure versions align and declared manifest assets exist on disk."""
    m_ver = manifest.get("version")
    p_ver = pkg.get("version")
    if p_ver and m_ver != p_ver:
        raise ValueError(f"Version mismatch: manifest.json ({m_ver}) vs package.json ({p_ver})")

    # Validate all referenced icons exist
    for size, rel_path in manifest.get("icons", {}).items():
        icon_path = REPO_ROOT / rel_path
        if not icon_path.is_file():
            raise FileNotFoundError(f"Manifest icon {size}px missing: {rel_path}")

    # Validate background service worker and popup HTML
    sw = manifest.get("background", {}).get("service_worker")
    if sw and not (REPO_ROOT / sw).is_file():
        raise FileNotFoundError(f"Service worker missing: {sw}")

    popup = manifest.get("action", {}).get("default_popup")
    if popup and not (REPO_ROOT / popup).is_file():
        raise FileNotFoundError(f"Popup HTML missing: {popup}")


def package_extension() -> None:
    manifest_path = REPO_ROOT / "manifest.json"
    package_json_path = REPO_ROOT / "package.json"

    if not manifest_path.is_file():
        sys.exit(f"Error: manifest.json not found at {manifest_path}")

    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    pkg = {}
    if package_json_path.is_file():
        with open(package_json_path, "r", encoding="utf-8") as f:
            pkg = json.load(f)

    # 1. Pre-flight integrity validation
    try:
        validate_manifest(manifest, pkg)
    except Exception as e:
        sys.exit(f"Pre-flight validation failed: {e}")

    version = manifest.get("version", "1.0.0")
    DIST_DIR.mkdir(exist_ok=True)
    zip_name = f"open-in-app-v{version}.zip"
    output_zip = DIST_DIR / zip_name

    # 2. Collect all files to include with strict validation
    files_to_pack: list[Path] = []

    for f_name in ROOT_FILES:
        fp = REPO_ROOT / f_name
        if not fp.is_file():
            sys.exit(f"Required file missing: {f_name}")
        files_to_pack.append(fp)

    for d_name in EXTENSION_DIRS:
        dp = REPO_ROOT / d_name
        if not dp.is_dir():
            sys.exit(f"Required directory missing: {d_name}")
        for path in sorted(dp.rglob("*")):
            if is_packageable_file(path):
                files_to_pack.append(path)

    # 3. Create ZIP archive strictly in dist/ with clean relative paths
    with zipfile.ZipFile(output_zip, "w", zipfile.ZIP_DEFLATED) as zf:
        for file_path in files_to_pack:
            arcname = file_path.relative_to(REPO_ROOT)
            zf.write(file_path, arcname=arcname)

    size_kb = output_zip.stat().st_size / 1024
    print(f"Successfully packaged {len(files_to_pack)} files into {zip_name} ({size_kb:.1f} KB)")
    print(f"Output: {output_zip}")
    print("Ready for upload to Chrome Web Store Developer Dashboard!")


if __name__ == "__main__":
    package_extension()
