"""Configuration module for video export functionality"""
import os
import psycopg2.pool
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

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
WAVEFORM_COLOR = (255, 76, 0)  # SoundCloud orange
BACKGROUND_COLOR = (18, 18, 18)  # Dark background
TEXT_COLOR = (255, 255, 255)
SECONDARY_TEXT_COLOR = (153, 153, 153)

# Video generation settings
VIDEO_FPS = 30
VIDEO_CODEC = 'libx264'
VIDEO_BITRATE = '5000k'

# Database connection pool
db_pool = None


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

