#!/usr/bin/env python3
"""Check access to pyannote models"""

import os
from huggingface_hub import HfApi

def check_model_access():
    """Check if we have access to required pyannote models"""
    api = HfApi()
    
    models_to_check = [
        'pyannote/segmentation',
        'pyannote/speaker-diarization',
        'pyannote/speaker-diarization-2.1'
    ]
    
    print("Checking access to pyannote models...")
    print("=" * 50)
    
    for model in models_to_check:
        try:
            info = api.model_info(model)
            print(f"✅ Access granted to {model}")
            print(f"   - Model ID: {info.modelId}")
            print(f"   - Private: {info.private}")
        except Exception as e:
            print(f"❌ No access to {model}: {str(e)}")
        print()

if __name__ == "__main__":
    check_model_access()
