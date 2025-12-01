#!/usr/bin/env python3
"""Fix symlink issues by copying files instead"""

import os
import shutil
from pathlib import Path

def fix_symlinks():
    """Copy all files instead of creating symlinks"""
    
    base_source = Path.home() / ".cache/huggingface/hub/models--speechbrain--spkrec-ecapa-voxceleb/snapshots/0f99f2d0ebe89ac095bcc5903c4dd8f72b367286"
    base_dest = Path.home() / ".cache/torch/pyannote/speechbrain"
    
    # Create destination directory if it doesn't exist
    base_dest.mkdir(parents=True, exist_ok=True)
    
    if not base_source.exists():
        print(f"❌ Source directory not found: {base_source}")
        return
    
    # Copy all files from source to destination
    for source_file in base_source.iterdir():
        if source_file.is_file():
            dest_file = base_dest / source_file.name
            print(f"Copying {source_file} to {dest_file}")
            shutil.copy2(source_file, dest_file)
            print("✅ File copied successfully")
    
    print(f"✅ All files copied from {base_source} to {base_dest}")

if __name__ == "__main__":
    fix_symlinks()
