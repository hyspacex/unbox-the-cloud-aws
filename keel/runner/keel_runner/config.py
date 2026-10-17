import os
from pathlib import Path

KEEL_ROOT = Path(__file__).resolve().parents[2]


def _load_env() -> None:
    for name in (".env", ".env.example"):
        path = KEEL_ROOT / name
        if not path.exists():
            continue
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


_load_env()


def get(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


def data_dir() -> Path:
    path = (KEEL_ROOT / get("KEEL_DATA_DIR", ".data")).resolve()
    path.mkdir(parents=True, exist_ok=True)
    return path


def packs_dir() -> Path:
    return (KEEL_ROOT / get("KEEL_PACKS_DIR", "packs")).resolve()


RULES_FILE_NAME = "keel-rules.md"
METADATA_SCOPE = "enterprise"
METADATA_TEMPLATE = "keelChecks"
TEXT_EXTENSIONS = (".md", ".markdown", ".txt", ".csv", ".json", ".yaml", ".yml", ".vtt")
