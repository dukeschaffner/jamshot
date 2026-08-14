"""Load shared local env files. Mirrors @sterio/dev-env. Not used in Lambda."""
from __future__ import annotations

import os
from pathlib import Path

_PACKAGE_DIR = Path(__file__).resolve().parent
REPO_ROOT = _PACKAGE_DIR.parent.parent
ENV_DIR = REPO_ROOT / "env"

_SKIP_KEYS = (
    "AWS_LAMBDA_FUNCTION_NAME",
    "CI",
    "VERCEL",
    "AWS_APP_ID",
    "SKIP_DEV_ENV",
)


def _parse_env_file(path: Path) -> dict[str, str]:
    vars_: dict[str, str] = {}
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not key:
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
            value = value[1:-1]
        else:
            hash_at = value.find(" #")
            if hash_at != -1:
                value = value[:hash_at].rstrip()
        vars_[key] = value
    return vars_


def load_dev_env(*, required: bool = True, extra_path: str | None = None) -> dict:
    if any(os.getenv(key) for key in _SKIP_KEYS):
        return {"skipped": True, "files": [], "vars": {}}

    base_path = ENV_DIR / ".env.dev"
    if not base_path.is_file():
        message = (
            f"Local env file not found at {base_path}. "
            "Copy env/.env.dev.example to env/.env.dev and fill in values."
        )
        if required:
            raise FileNotFoundError(message)
        return {"skipped": True, "files": [], "vars": {}}

    profile = os.getenv("JAMSHOT_ENV") or "dev"
    extra = extra_path or os.getenv("JAMSHOT_ENV_FILE") or os.getenv("DOTENV_PATH")
    extra_resolved = None
    if extra:
        extra_path_obj = Path(extra)
        extra_resolved = extra_path_obj if extra_path_obj.is_absolute() else Path.cwd() / extra_path_obj

    stack = [base_path]
    if profile != "dev":
        stack.append(ENV_DIR / f".env.{profile}")
    stack.append(ENV_DIR / ".env.local")
    if extra_resolved is not None:
        stack.append(extra_resolved)

    files: list[Path] = []
    vars_: dict[str, str] = {}
    for path in stack:
        if not path.is_file():
            if required and profile != "dev" and path == ENV_DIR / f".env.{profile}":
                raise FileNotFoundError(
                    f"JAMSHOT_ENV={profile} but {path} does not exist. "
                    "Create it with the keys you want to override."
                )
            if required and extra_resolved is not None and path == extra_resolved:
                raise FileNotFoundError(f"JAMSHOT_ENV_FILE/DOTENV_PATH not found: {path}")
            continue
        vars_.update(_parse_env_file(path))
        files.append(path)

    os.environ.update(vars_)
    return {"skipped": False, "files": files, "vars": vars_, "profile": profile}
