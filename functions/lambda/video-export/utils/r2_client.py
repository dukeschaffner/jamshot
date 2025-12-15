"""
R2 (S3-compatible) client utility for downloading and uploading files
"""
import os
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
import tempfile
import requests

class R2Client:
    """Client for interacting with Cloudflare R2 storage"""
    
    def __init__(self):
        self.s3_client = boto3.client(
            's3',
            endpoint_url=os.getenv('R2_ENDPOINT'),
            aws_access_key_id=os.getenv('R2_ACCESS_KEY_ID'),
            aws_secret_access_key=os.getenv('R2_SECRET_ACCESS_KEY'),
            config=Config(signature_version='s3v4', region_name='auto')
        )
        self.bucket = os.getenv('R2_BUCKET')
        self.public_url = os.getenv('R2_PUBLIC_URL')
    
    def download_file(self, r2_key, local_path):
        """
        Download a file from R2 to local path
        
        Args:
            r2_key: R2 object key (e.g., 'tracks/123-audio.mp3')
            local_path: Local file path to save to
        """
        try:
            self.s3_client.download_file(self.bucket, r2_key, local_path)
            return local_path
        except ClientError as e:
            raise Exception(f"Failed to download {r2_key} from R2: {str(e)}")
    
    def download_to_temp(self, r2_key, suffix=''):
        """
        Download a file from R2 to a temporary file
        
        Args:
            r2_key: R2 object key
            suffix: File suffix (e.g., '.mp3')
        
        Returns:
            Path to temporary file
        """
        # Create temp file
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        temp_path = temp_file.name
        temp_file.close()
        
        # Download to temp file
        self.download_file(r2_key, temp_path)
        return temp_path
    
    def upload_file(self, local_path, r2_key):
        """
        Upload a file to R2
        
        Args:
            local_path: Local file path
            r2_key: R2 object key to upload to
        """
        try:
            self.s3_client.upload_file(local_path, self.bucket, r2_key)
            return f"{self.public_url}/{r2_key}"
        except ClientError as e:
            raise Exception(f"Failed to upload {r2_key} to R2: {str(e)}")
    
    def download_from_url(self, url, local_path):
        """
        Download a file from a public URL (for signed URLs or public R2 URLs)
        
        Args:
            url: Public URL to download from
            local_path: Local file path to save to
        """
        try:
            response = requests.get(url, stream=True)
            response.raise_for_status()
            
            with open(local_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            
            return local_path
        except Exception as e:
            raise Exception(f"Failed to download from URL {url}: {str(e)}")
    
    def download_url_to_temp(self, url, suffix=''):
        """
        Download a file from a URL to a temporary file
        
        Args:
            url: Public URL to download from
            suffix: File suffix (e.g., '.mp3')
        
        Returns:
            Path to temporary file
        """
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        temp_path = temp_file.name
        temp_file.close()
        
        self.download_from_url(url, temp_path)
        return temp_path



