#!/usr/bin/env python3
"""
Script to copy the shared folder into mobile, ui, and api/lambda folders, overwriting existing ones.
For Lambda (CommonJS), transforms validation.js to use CommonJS exports.
"""

import os
import shutil
import sys
import re
from pathlib import Path


def transform_validation_for_commonjs(content):
    """
    Transform validation.js content from ES6 exports to CommonJS exports for Lambda.
    """
    # Change export const to const
    content = re.sub(r'export const ', 'const ', content)

    # Remove any trailing export block if it exists
    content = re.sub(r'export \{\s*[^}]+\s*\};?\s*$', '', content, flags=re.MULTILINE | re.DOTALL)

    # Add CommonJS exports at the end
    commonjs_exports = """
module.exports = {
  validateEmail,
  validateUsername,
  validatePassword,
  validateTrackTitle,
  validateCommentContent,
  validateBPM,
  validateTimeSignature,
  validateAudioDuration,
  validateAudioFileSize,
  validateName,
  validateBio,
  validateDateOfBirth,
  validateForm
};
"""

    # Remove any existing module.exports
    content = re.sub(r'module\.exports\s*=\s*\{[^}]*\};\s*$', '', content, flags=re.MULTILINE | re.DOTALL)

    return content.rstrip() + commonjs_exports


def copy_shared_folder():
    """
    Copy the shared folder to mobile, ui, and api/lambda directories, overwriting existing ones.
    """
    # Get the project root directory (parent of functions directory)
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    
    # Define paths
    shared_source = project_root / "shared"
    mobile_dest = project_root / "mobile" / "shared"
    ui_dest = project_root / "ui" / "shared"
    api_dest = project_root / "api" / "lambda" / "shared"
    
    # Check if shared folder exists
    if not shared_source.exists():
        print(f"❌ Error: Shared folder not found at {shared_source}")
        sys.exit(1)
    
    print(f"📁 Source shared folder: {shared_source}")
    print(f"📱 Mobile destination: {mobile_dest}")
    print(f"🖥️  UI destination: {ui_dest}")
    print(f"🖥️  API destination: {api_dest}")
    print()
    
    # Copy to mobile
    try:
        if mobile_dest.exists():
            print(f"🗑️  Removing existing shared folder in mobile...")
            shutil.rmtree(mobile_dest)
        
        print(f"📋 Copying shared folder to mobile...")
        shutil.copytree(shared_source, mobile_dest)
        print(f"✅ Successfully copied shared folder to mobile")
    except Exception as e:
        print(f"❌ Error copying to mobile: {e}")
        return False
    
    # Copy to ui
    try:
        if ui_dest.exists():
            print(f"🗑️  Removing existing shared folder in ui...")
            shutil.rmtree(ui_dest)
        
        print(f"📋 Copying shared folder to ui...")
        shutil.copytree(shared_source, ui_dest)
        print(f"✅ Successfully copied shared folder to ui")
    except Exception as e:
        print(f"❌ Error copying to ui: {e}")
        return False

    # Copy to api (with CommonJS transformation for Lambda)
    try:
        if api_dest.exists():
            print(f"🗑️  Removing existing shared folder in api...")
            shutil.rmtree(api_dest)

        print(f"📋 Copying shared folder to api...")
        shutil.copytree(shared_source, api_dest)

        # Transform validation.js for CommonJS (Lambda)
        validation_file = api_dest / "utils" / "validation.js"
        if validation_file.exists():
            print(f"🔄 Transforming validation.js to CommonJS for Lambda...")
            with open(validation_file, 'r', encoding='utf-8') as f:
                content = f.read()

            transformed_content = transform_validation_for_commonjs(content)

            with open(validation_file, 'w', encoding='utf-8') as f:
                f.write(transformed_content)

            print(f"✅ Transformed validation.js to CommonJS format")

        print(f"✅ Successfully copied shared folder to api")
    except Exception as e:
        print(f"❌ Error copying to api: {e}")
        return False

    print()
    print("🎉 All done! Shared folder has been copied to mobile, ui, and api/lambda directories.")
    return True


if __name__ == "__main__":
    print("🚀 Starting shared folder copy process...")
    print()
    
    success = copy_shared_folder()
    
    if not success:
        print()
        print("❌ Copy process failed!")
        sys.exit(1)
