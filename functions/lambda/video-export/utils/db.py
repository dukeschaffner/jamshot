"""
Database connection utility for video export lambda
"""
import os
import psycopg2
from psycopg2 import pool
from contextlib import contextmanager

# Create connection pool
_connection_pool = None

def get_connection_pool():
    """Get or create database connection pool"""
    global _connection_pool
    
    if _connection_pool is None:
        _connection_pool = psycopg2.pool.ThreadedConnectionPool(
            minconn=1,
            maxconn=5,
            host=os.getenv('DB_HOST'),
            port=os.getenv('DB_PORT', '5432'),
            database=os.getenv('DB_NAME'),
            user=os.getenv('DB_USER'),
            password=os.getenv('DB_PASSWORD'),
            sslmode='require' if os.getenv('DB_SSL') == 'true' else 'prefer'
        )
    
    return _connection_pool

@contextmanager
def get_db_connection():
    """Context manager for database connections"""
    pool = get_connection_pool()
    conn = pool.getconn()
    try:
        yield conn
    finally:
        pool.putconn(conn)

def close_pool():
    """Close the connection pool"""
    global _connection_pool
    if _connection_pool:
        _connection_pool.closeall()
        _connection_pool = None

