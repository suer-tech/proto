"""
Patch for compatibility with pyannote.audio
This fixes compatibility issues with newer versions of torchaudio and numpy
"""

import torchaudio
import numpy as np

# Check if set_audio_backend exists, if not, create a dummy function
if not hasattr(torchaudio, 'set_audio_backend'):
    def set_audio_backend(backend):
        """Dummy function for compatibility with older pyannote.audio versions"""
        pass
    
    # Add the function to torchaudio module
    torchaudio.set_audio_backend = set_audio_backend
    print("Applied torchaudio set_audio_backend patch")

# Check if get_audio_backend exists, if not, create a dummy function
if not hasattr(torchaudio, 'get_audio_backend'):
    def get_audio_backend():
        """Dummy function for compatibility with older pyannote.audio versions"""
        return "soundfile"
    
    # Add the function to torchaudio module
    torchaudio.get_audio_backend = get_audio_backend
    print("Applied torchaudio get_audio_backend patch")

# Check if list_audio_backends exists, if not, create a dummy function
if not hasattr(torchaudio, 'list_audio_backends'):
    def list_audio_backends():
        """Dummy function for compatibility with older pyannote.audio versions"""
        return ["soundfile", "sox_io"]
    
    # Add the function to torchaudio module
    torchaudio.list_audio_backends = list_audio_backends
    print("Applied torchaudio list_audio_backends patch")

# Fix torchaudio.backend module
import types

if not hasattr(torchaudio, 'backend'):
    # Create a mock backend module
    backend_module = types.ModuleType('torchaudio.backend')
    
    # Add common backend functions
    def get_audio_backend():
        return "soundfile"
    
    def set_audio_backend(backend):
        pass
    
    def list_audio_backends():
        return ["soundfile", "sox_io"]
    
    backend_module.get_audio_backend = get_audio_backend
    backend_module.set_audio_backend = set_audio_backend
    backend_module.list_audio_backends = list_audio_backends
    
    # Add the module to torchaudio
    torchaudio.backend = backend_module
    print("Applied torchaudio.backend module patch")

# Fix NumPy 2.0 compatibility
if not hasattr(np, 'NaN'):
    np.NaN = np.nan
    print("Applied NumPy compatibility patch")
