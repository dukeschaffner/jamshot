#!/usr/bin/env python3
"""
Script to copy the shared folder into mobile, ui, and api/lambda folders, overwriting existing ones.
Generates destination-specific index.js files based on API_EXPORTS and UI_EXPORTS lists defined in each shared file.
For Lambda (CommonJS), transforms files to use CommonJS exports and generates CommonJS index.js.
"""

import os
import shutil
import sys
import re
import ast
from pathlib import Path


def remove_empty_directories(dest_dir):
    """
    Remove empty directories from destination directory.
    Returns the number of directories removed.
    """
    dirs_removed = 0

    # Walk through directories in reverse order (deepest first)
    for dir_path in sorted(dest_dir.rglob('*'), key=lambda x: len(x.parts), reverse=True):
        if dir_path.is_dir() and not any(dir_path.iterdir()):
            dir_path.rmdir()
            dirs_removed += 1
            print(f"  📁 Removed empty directory {dir_path.relative_to(dest_dir)}")

    return dirs_removed


def remove_files_without_exports(dest_dir, platform):
    """
    Remove files from destination directory that have no exports for the given platform.
    Returns the number of files removed.
    """
    files_removed = 0

    for js_file in dest_dir.rglob('*.js'):
        if js_file.name == 'index.js' and js_file.parent == dest_dir:
            continue  # Don't remove the main index.js

        try:
            # Parse the exports for this file
            file_exports = parse_export_lists(js_file)

            # Check if this file has any exports for the target platform
            platform_exports = file_exports.get(platform, [])

            if not platform_exports:
                # No exports for this platform, remove the file
                js_file.unlink()
                files_removed += 1
                print(f"  📄 Removed {js_file.relative_to(dest_dir)} (no {platform} exports)")

        except Exception as e:
            print(f"  ⚠️  Warning: Could not check exports for {js_file}: {e}")

    return files_removed


def parse_export_lists(file_path):
    """
    Parse API_EXPORTS and UI_EXPORTS arrays from a JavaScript file.
    Returns a dict with 'api' and 'ui' keys containing lists of exports.
    Now handles both string literals and variable references.
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Extract the export lists using regex
        api_match = re.search(r'const\s+API_EXPORTS\s*=\s*\[([^\]]*)\]', content, re.DOTALL)
        ui_match = re.search(r'const\s+UI_EXPORTS\s*=\s*\[([^\]]*)\]', content, re.DOTALL)

        api_exports = []
        ui_exports = []

        def extract_names(array_content):
            """Extract variable/function names from array content"""
            # Remove comments
            array_content = re.sub(r'//.*?$', '', array_content, flags=re.MULTILINE)
            # Extract identifiers (variable names)
            names = re.findall(r'\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b', array_content)
            # Filter out JavaScript keywords and common words
            keywords = {'const', 'let', 'var', 'function', 'class', 'export', 'import', 'from', 'API', 'UI', 'utilities', 'constants', 'and'}
            return [name for name in names if name not in keywords and len(name) > 1]

        if api_match:
            array_content = api_match.group(1)
            api_exports = extract_names(array_content)

        if ui_match:
            array_content = ui_match.group(1)
            ui_exports = extract_names(array_content)

        return {
            'api': api_exports,
            'ui': ui_exports
        }
    except Exception as e:
        print(f"Warning: Could not parse export lists from {file_path}: {e}")
        return {'api': [], 'ui': []}


def generate_index_file(shared_dir, export_lists, is_commonjs=False):
    """
    Generate an index.js file that exports only the items specified in export_lists.
    Parses the main shared/index.js to understand import structure.
    """
    lines = []

    if is_commonjs:
        lines.append("// Auto-generated CommonJS exports for API/Lambda")
        lines.append("")
    else:
        lines.append("// Auto-generated ES6 exports for UI")
        lines.append("")

    # Read the main shared/index.js to understand the import structure
    main_index = shared_dir / "index.js"
    try:
        with open(main_index, 'r', encoding='utf-8') as f:
            main_content = f.read()
    except:
        print(f"Warning: Could not read main index.js")
        return ""

    # Parse import statements to understand where each export comes from
    import_map = {}

    # Look for import statements like: import { createApiClient, createApiMethods } from './api/index.js';
    import_matches = re.findall(r"import\s*\{\s*([^}]+)\s*\}\s*from\s*['\"]([^'\"]+)['\"]", main_content)

    for imports_str, source_path in import_matches:
        # Clean up the source path - remove './' prefix
        source_path = source_path.replace('./', '')

        # Parse the imports
        import_items = [item.strip() for item in imports_str.split(',') if item.strip()]

        for import_item in import_items:
            if import_item in export_lists:
                import_map[import_item] = source_path

    # Group exports by source file
    export_map = {}
    for export_item in export_lists:
        source_file = import_map.get(export_item)
        if source_file:
            if source_file not in export_map:
                export_map[source_file] = []
            export_map[source_file].append(export_item)

    # Generate imports and exports
    all_exports = []
    for source_file, exports in export_map.items():
        if is_commonjs:
            lines.append(f"const {{ {', '.join(exports)} }} = require('./{source_file}');")
        else:
            # source_file already includes .js from the import statement
            lines.append(f"import {{ {', '.join(exports)} }} from './{source_file}';")
        all_exports.extend(exports)

    lines.append("")

    if is_commonjs:
        # CommonJS exports
        if all_exports:
            lines.append("module.exports = {")
            for export_item in all_exports:
                lines.append(f"  {export_item},")
            lines.append("};")
        else:
            lines.append("module.exports = {};")
    else:
        # ES6 exports
        for export_item in all_exports:
            lines.append(f"export {{ {export_item} }};")

    return '\n'.join(lines)


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
    Generates destination-specific index.js files based on API_EXPORTS and UI_EXPORTS lists.
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

    # Parse export lists from the main shared/index.js file
    main_index = shared_source / "index.js"
    export_lists = parse_export_lists(main_index)
    print(f"📋 Parsed export lists - API: {len(export_lists['api'])}, UI: {len(export_lists['ui'])}")

    # Copy to mobile and generate index.js
    try:
        if mobile_dest.exists():
            print(f"🗑️  Removing existing shared folder in mobile...")
            shutil.rmtree(mobile_dest)

        print(f"📋 Copying shared folder to mobile...")
        shutil.copytree(shared_source, mobile_dest)

        # Remove files that have no UI exports
        print(f"🧹 Removing files with no UI exports...")
        files_removed = remove_files_without_exports(mobile_dest, 'ui')
        print(f"🗑️  Removed {files_removed} files with no UI exports")

        # Remove empty directories
        dirs_removed = remove_empty_directories(mobile_dest)
        if dirs_removed > 0:
            print(f"🗑️  Removed {dirs_removed} empty directories")

        # Transform remaining JS files for ES6 exports (Mobile) - add export statements based on UI_EXPORTS
        print(f"🔄 Transforming remaining JS files to ES6 for Mobile...")
        for js_file in mobile_dest.rglob('*.js'):
            if js_file.name == 'index.js' and js_file.parent == mobile_dest:
                continue  # Skip the main index.js we'll generate

            try:
                with open(js_file, 'r', encoding='utf-8') as f:
                    content = f.read()

                # Parse UI_EXPORTS from this file
                ui_exports = parse_export_lists(js_file)['ui']

                if ui_exports:
                    # Add ES6 export statements for the UI exports
                    content += f"\n\n// Auto-generated ES6 exports\nexport {{\n"
                    for export_item in ui_exports:
                        content += f"  {export_item},\n"
                    content += "};\n"

                    with open(js_file, 'w', encoding='utf-8') as f:
                        f.write(content)

                    print(f"✅ Added ES6 exports to {js_file.relative_to(mobile_dest)}")

            except Exception as e:
                print(f"⚠️  Warning: Could not transform {js_file}: {e}")

        # Generate mobile-specific index.js
        print(f"🔄 Generating mobile index.js...")
        index_content = generate_index_file(mobile_dest, export_lists['ui'], is_commonjs=False)
        with open(mobile_dest / "index.js", 'w', encoding='utf-8') as f:
            f.write(index_content)
        print(f"✅ Generated mobile index.js with {len(export_lists['ui'])} exports")

        print(f"✅ Successfully processed shared folder for mobile")
    except Exception as e:
        print(f"❌ Error processing mobile: {e}")
        return False

    # Copy to ui and generate index.js
    try:
        if ui_dest.exists():
            print(f"🗑️  Removing existing shared folder in ui...")
            shutil.rmtree(ui_dest)

        print(f"📋 Copying shared folder to ui...")
        shutil.copytree(shared_source, ui_dest)

        # Remove files that have no UI exports
        print(f"🧹 Removing files with no UI exports...")
        files_removed = remove_files_without_exports(ui_dest, 'ui')
        print(f"🗑️  Removed {files_removed} files with no UI exports")

        # Remove empty directories
        dirs_removed = remove_empty_directories(ui_dest)
        if dirs_removed > 0:
            print(f"🗑️  Removed {dirs_removed} empty directories")

        # Transform remaining JS files for ES6 exports (UI) - add export statements based on UI_EXPORTS
        print(f"🔄 Transforming remaining JS files to ES6 for UI...")
        for js_file in ui_dest.rglob('*.js'):
            if js_file.name == 'index.js' and js_file.parent == ui_dest:
                continue  # Skip the main index.js we'll generate

            try:
                with open(js_file, 'r', encoding='utf-8') as f:
                    content = f.read()

                # Parse UI_EXPORTS from this file
                ui_exports = parse_export_lists(js_file)['ui']

                if ui_exports:
                    # Add ES6 export statements for the UI exports
                    content += f"\n\n// Auto-generated ES6 exports\nexport {{\n"
                    for export_item in ui_exports:
                        content += f"  {export_item},\n"
                    content += "};\n"

                    with open(js_file, 'w', encoding='utf-8') as f:
                        f.write(content)

                    print(f"✅ Added ES6 exports to {js_file.relative_to(ui_dest)}")

            except Exception as e:
                print(f"⚠️  Warning: Could not transform {js_file}: {e}")

        # Generate ui-specific index.js
        print(f"🔄 Generating ui index.js...")
        index_content = generate_index_file(ui_dest, export_lists['ui'], is_commonjs=False)
        with open(ui_dest / "index.js", 'w', encoding='utf-8') as f:
            f.write(index_content)
        print(f"✅ Generated ui index.js with {len(export_lists['ui'])} exports")

        print(f"✅ Successfully processed shared folder for ui")
    except Exception as e:
        print(f"❌ Error processing ui: {e}")
        return False

    # Copy to api and generate index.js (with CommonJS transformation)
    try:
        if api_dest.exists():
            print(f"🗑️  Removing existing shared folder in api...")
            shutil.rmtree(api_dest)

        print(f"📋 Copying shared folder to api...")
        shutil.copytree(shared_source, api_dest)

        # Remove files that have no API exports
        print(f"🧹 Removing files with no API exports...")
        files_removed = remove_files_without_exports(api_dest, 'api')
        print(f"🗑️  Removed {files_removed} files with no API exports")

        # Remove empty directories
        print(f"🧹 Removing empty directories...")
        dirs_removed = remove_empty_directories(api_dest)
        print(f"🗑️  Removed {dirs_removed} empty directories")

        # Transform remaining JS files for CommonJS (Lambda) - add module.exports based on API_EXPORTS
        print(f"🔄 Transforming remaining JS files to CommonJS for Lambda...")
        for js_file in api_dest.rglob('*.js'):
            if js_file.name == 'index.js' and js_file.parent == api_dest:
                continue  # Skip the main index.js we'll generate

            try:
                with open(js_file, 'r', encoding='utf-8') as f:
                    content = f.read()

                # Parse API_EXPORTS from this file
                api_exports = parse_export_lists(js_file)['api']

                if api_exports:
                    # Add module.exports for the API exports
                    content += f"\n\nmodule.exports = {{\n"
                    for export_item in api_exports:
                        content += f"  {export_item},\n"
                    content += "};\n"

                    with open(js_file, 'w', encoding='utf-8') as f:
                        f.write(content)

                    print(f"✅ Added CommonJS exports to {js_file.relative_to(api_dest)}")

            except Exception as e:
                print(f"⚠️  Warning: Could not transform {js_file}: {e}")

        # Generate api-specific index.js
        print(f"🔄 Generating api index.js...")
        index_content = generate_index_file(api_dest, export_lists['api'], is_commonjs=True)
        with open(api_dest / "index.js", 'w', encoding='utf-8') as f:
            f.write(index_content)
        print(f"✅ Generated api index.js with {len(export_lists['api'])} exports")

        print(f"✅ Successfully processed shared folder for api")
    except Exception as e:
        print(f"❌ Error processing api: {e}")
        return False

    print()
    print("🎉 All done! Shared folder has been copied and configured for mobile, ui, and api/lambda directories.")
    return True


if __name__ == "__main__":
    print("🚀 Starting shared folder copy process...")
    print()
    
    success = copy_shared_folder()
    
    if not success:
        print()
        print("❌ Copy process failed!")
        sys.exit(1)
