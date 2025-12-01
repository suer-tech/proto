# Audio Transcription with Faster-Whisper

This document describes the audio transcription functionality added to the Protocol Maker backend using faster-whisper.

## Features

- **Real-time audio transcription** using faster-whisper
- **Multiple transcription methods**:
  - Python API (recommended for integration)
  - Command line interface (as requested by user)
  - Direct command execution
- **Automatic text file saving** of transcribed content
- **Support for multiple audio formats**: MP3, WAV, M4A
- **Configurable model sizes**: tiny, base, small, medium, large-v1, large-v2, large-v3
- **Device support**: CPU and CUDA (GPU)
- **Language detection** and support for multiple languages
- **Voice Activity Detection (VAD)** to filter out silence

## Installation

1. Install the required dependencies:
```bash
pip install -r requirements.txt
```

2. The faster-whisper package will be automatically installed with the required dependencies.

## Usage

### 1. Command Line Interface (As Requested)

The user specifically requested support for the command line interface:

```bash
python -m faster_whisper.transcribe --device cpu --model medium Успешные_холодные_звонки_примеры_До_продажи_купившим.m4a
```

This functionality is integrated into the AudioProcessor class and can be used through the API.

### 2. Python API Integration

The AudioProcessor class provides both static and instance methods:

```python
from services.audio_processor import AudioProcessor

# Using instance method
processor = AudioProcessor(model_size="medium", device="cpu")
transcript = await processor.process_audio(
    audio_file_path="audio.wav",
    participants=[{"name": "John Doe"}],
    prompt="Meeting transcription",
    use_command_line=False,  # Use Python API
    save_to_file=True
)

# Using static method (backward compatibility)
transcript = await AudioProcessor.process_audio_static(
    audio_file_path="audio.wav",
    participants=[{"name": "John Doe"}],
    prompt="Meeting transcription",
    use_command_line=True,  # Use command line
    save_to_file=True
)
```

### 3. API Endpoints

#### Transcribe Audio Endpoint

```http
POST /api/transcribe
Content-Type: multipart/form-data

Parameters:
- audioFile: Audio file (required)
- useCommandLine: boolean (default: false)
- modelSize: string (default: "medium")
- device: string (default: "cpu")
- language: string (default: "ru")
```

#### Protocol Submission with Transcription

```http
POST /api/protocols/submit
Content-Type: multipart/form-data

Parameters:
- protocolType: string (required)
- participants: string (JSON, required)
- audioFile: Audio file (required)
- useCommandLine: boolean (default: false)
- saveTranscript: boolean (default: true)
```

### 4. Testing

Use the provided test script to test different transcription methods:

```bash
# Test all methods
python test_transcription.py audio.wav

# Test only Python API
python test_transcription.py audio.wav --method python

# Test only command line
python test_transcription.py audio.wav --method command

# Test direct command line execution
python test_transcription.py audio.wav --method direct

# Use different model and device
python test_transcription.py audio.wav --model large-v3 --device cuda
```

## Configuration

### Model Sizes

- **tiny**: Fastest, least accurate (~39 MB)
- **base**: Good balance (~74 MB)
- **small**: Better accuracy (~244 MB)
- **medium**: Good accuracy (~769 MB) - **Default**
- **large-v1**: High accuracy (~1550 MB)
- **large-v2**: Better accuracy (~1550 MB)
- **large-v3**: Best accuracy (~1550 MB)

### Device Options

- **cpu**: CPU processing (slower but works everywhere)
- **cuda**: GPU processing (faster, requires CUDA-compatible GPU)

### Compute Types

- **int8**: Fastest, least memory usage
- **int8_float16**: Good balance
- **float16**: Better accuracy, more memory
- **float32**: Best accuracy, most memory

## Output Format

The transcription output includes:

```
СТЕНОГРАММА ВСТРЕЧИ

Участники: John Doe, Jane Smith

Язык: ru (вероятность: 95.50%)
Длительность: 120.45с

[00:00 - 00:05] Добро пожаловать на наше совещание.
[00:05 - 00:10] Давайте начнем с обсуждения основных вопросов.
[00:10 - 00:15] У меня есть несколько предложений.
```

## File Management

- Audio files are temporarily stored in the `uploads/` directory
- Transcript files are saved as `{original_filename}_transcript.txt`
- Temporary files are automatically cleaned up after processing

## Error Handling

The system includes comprehensive error handling for:
- Missing audio files
- Unsupported file formats
- Transcription failures
- Command line execution errors
- File I/O errors

## Performance Notes

- **First run**: Model loading may take time (especially for larger models)
- **CPU processing**: Slower but more compatible
- **GPU processing**: Faster but requires CUDA setup
- **Memory usage**: Larger models require more RAM/VRAM
- **File size**: Longer audio files take more time to process

## Troubleshooting

1. **CUDA errors**: Ensure CUDA is properly installed for GPU processing
2. **Memory errors**: Try smaller model sizes or CPU processing
3. **File format errors**: Ensure audio file is in supported format
4. **Command line errors**: Check that faster-whisper is properly installed

## Integration with Frontend

The transcription functionality is fully integrated with the existing FastAPI backend and can be used by the React frontend through the existing API endpoints. The frontend can choose between Python API and command line transcription methods.
