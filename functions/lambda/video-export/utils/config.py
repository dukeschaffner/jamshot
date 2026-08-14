"""Configuration module for video export functionality"""
import os
from pathlib import Path

import psycopg2.pool

VIDEO_EXPORT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _load_shared_dev_env():
    """Load env/.env.dev (+ overlays). No-op in Lambda."""
    if os.getenv('AWS_LAMBDA_FUNCTION_NAME'):
        return

    repo_root = Path(VIDEO_EXPORT_DIR).resolve()
    load_py = None
    for parent in [repo_root, *repo_root.parents]:
        candidate = parent / 'packages' / 'dev-env' / 'load.py'
        if candidate.is_file():
            load_py = candidate
            break

    extra = os.getenv('DOTENV_PATH')
    extra_path = None
    if extra:
        extra_path = extra if os.path.isabs(extra) else os.path.join(VIDEO_EXPORT_DIR, extra)

    if load_py is None:
        from dotenv import load_dotenv
        env_path = extra_path or os.path.join(VIDEO_EXPORT_DIR, '.env')
        if os.path.isfile(env_path):
            load_dotenv(env_path, override=bool(extra))
        else:
            print(f"⚠️  Env file not found: {env_path}")
        return

    import importlib.util
    spec = importlib.util.spec_from_file_location('jamshot_dev_env', load_py)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.load_dev_env(required=True, extra_path=extra_path)


_load_shared_dev_env()

# Database configuration from environment variables
DB_HOST = os.getenv('DB_HOST', 'localhost')
DB_USER = os.getenv('DB_USER', 'postgres')
DB_PASSWORD = os.getenv('DB_PASSWORD', '')
DB_NAME = os.getenv('DB_NAME', 'jamshot')
DB_PORT = int(os.getenv('DB_PORT', '5432'))
DB_CONNECTION_STRING = os.getenv('DB_CONNECTION_STRING')

R2_PUBLIC_URL = os.getenv('R2_PUBLIC_URL', 'https://pub-0b5b4b5c33744ae8907300ffc31c99c9.r2.dev')

# Frame generation settings (vertical/portrait orientation)
FRAME_WIDTH = 1080
FRAME_HEIGHT = 1920
TRACK_HEIGHT = 120
WAVEFORM_HEIGHT = 60
PROFILE_PIC_SIZE = 50
PADDING = 20
WAVEFORM_COLOR = (147, 233, 190)  # Seafoam (#93E9BE)
MUTED_WAVEFORM_COLOR = (153, 153, 153)  # Grey progress for muted stems
ACCENT_COLOR = (233, 169, 161)  # Rustic pink (#E9A9A1)
BACKGROUND_COLOR = (18, 18, 18)  # Dark background
TEXT_COLOR = (255, 255, 255)
SECONDARY_TEXT_COLOR = (153, 153, 153)

# Video generation settings
VIDEO_FPS = 30
VIDEO_CODEC = 'libx264'
VIDEO_BITRATE = '5000k'
VIDEO_DURATION_LIMIT = 90.0  # Maximum video duration in seconds

# Database connection pool
db_pool = None


def is_lambda_environment():
    """Check if running in AWS Lambda environment"""
    return bool(os.getenv('AWS_LAMBDA_FUNCTION_NAME'))


def get_temp_dir():
    """Get temporary directory path - use /tmp in Lambda, system temp otherwise"""
    if is_lambda_environment():
        return '/tmp'
    # Use system temp directory (tempfile.gettempdir() handles cross-platform)
    import tempfile
    return tempfile.gettempdir()


def get_db_connection():
    """Get a database connection from the pool"""
    global db_pool
    
    if db_pool is None:
        if DB_CONNECTION_STRING:
            db_pool = psycopg2.pool.SimpleConnectionPool(1, 5, DB_CONNECTION_STRING)
        else:
            db_pool = psycopg2.pool.SimpleConnectionPool(
                1, 5,
                host=DB_HOST,
                user=DB_USER,
                password=DB_PASSWORD,
                database=DB_NAME,
                port=DB_PORT
            )
    
    return db_pool.getconn()

