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


def transform_to_commonjs(content):
    """
    Transform ES6 module content to CommonJS exports for Lambda.
    Dynamically detects exported items and converts them.
    """
    # Change export const/let/var/function to const/let/var/function
    content = re.sub(r'export (const|let|var|function) ', r'\1 ', content)

    # Find all individual export statements (export const/let/var/function)
    individual_exports = re.findall(r'^(?:export\s+)?(const|let|var|function)\s+(\w+)', content, re.MULTILINE)

    # Find export blocks
    export_blocks = re.findall(r'export\s*\{\s*([^}]+)\s*\}', content, re.MULTILINE | re.DOTALL)

    exported_items = []

    # Collect items from individual exports
    for _, var_name in individual_exports:
        exported_items.append(var_name)

    # Collect items from export blocks
    if export_blocks:
        # Get all exported items from the last export block
        exported_items_block = export_blocks[-1]

        # Clean up the items (remove comments, whitespace, etc.)
        for item in exported_items_block.split(','):
            item = item.strip()
            if item and not item.startswith('//'):
                exported_items.append(item)

    if exported_items:
        # Remove duplicate items
        exported_items = list(set(exported_items))

        # Create CommonJS exports
        commonjs_exports = "module.exports = {\n"
        for item in exported_items:
            commonjs_exports += f"  {item},\n"
        commonjs_exports += "};\n"

        # Remove export blocks
        content = re.sub(r'export\s*\{\s*[^}]+\s*\};?\s*$', '', content, flags=re.MULTILINE | re.DOTALL)

        # Remove any existing module.exports
        content = re.sub(r'module\.exports\s*=\s*\{[^}]*\};\s*$', '', content, flags=re.MULTILINE | re.DOTALL)

        return content.rstrip() + "\n\n" + commonjs_exports
    else:
        # No exports found, return unchanged
        return content


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

        # Transform shared utils files for CommonJS (Lambda)
        utils_to_transform = ["validation.js", "subscription.js"]

        for util_file in utils_to_transform:
            file_path = api_dest / "utils" / util_file
            if file_path.exists():
                print(f"🔄 Transforming {util_file} to CommonJS for Lambda...")
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()

                transformed_content = transform_to_commonjs(content)

                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(transformed_content)

                print(f"✅ Transformed {util_file} to CommonJS format")

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
