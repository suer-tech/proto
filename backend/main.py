import json
import os
import uuid
import asyncio
import logging
import subprocess
from typing import Dict, Optional
from datetime import datetime
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import aiofiles
from models import ProtocolTypeInfo, ProtocolResponse, ProtocolStatus, Participant
from services.assemblyai_service import AssemblyAIService
from services.llm_client import LLMClient
# AudioProcessor imported lazily when needed (to avoid import errors if faster_whisper is not installed)
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()


def get_audio_duration_from_file(file_path: str) -> Optional[int]:
    """
    Get audio duration from file using multiple methods (most reliable first)
    Returns duration in milliseconds, or None if failed
    """
    # Method 1: ffprobe (most reliable, works with all formats)
    try:
        result = subprocess.run(
            ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file_path],
            capture_output=True,
            text=True,
            timeout=10
        )
        if result.returncode == 0 and result.stdout.strip():
            duration_sec = float(result.stdout.strip())
            if duration_sec > 0:
                duration_ms = int(duration_sec * 1000)
                logger.info(f"Got duration from ffprobe: {duration_ms} ms ({duration_sec:.2f} seconds)")
                return duration_ms
    except FileNotFoundError:
        logger.warning("ffprobe not found, trying other methods...")
    except Exception as e:
        logger.warning(f"ffprobe failed: {str(e)}")
    
    # Method 2: librosa (reliable for most formats)
    try:
        import librosa
        duration_sec = librosa.get_duration(path=file_path)
        if duration_sec and duration_sec > 0:
            duration_ms = int(duration_sec * 1000)
            logger.info(f"Got duration from librosa: {duration_ms} ms ({duration_sec:.2f} seconds)")
            return duration_ms
    except ImportError:
        logger.warning("librosa not installed, trying other methods...")
    except Exception as e:
        logger.warning(f"librosa failed: {str(e)}")
    
    # Method 3: mutagen (lightweight, works with MP3, M4A)
    try:
        from mutagen import File as MutagenFile
        audio_file = MutagenFile(file_path)
        if audio_file is not None and hasattr(audio_file, 'info') and hasattr(audio_file.info, 'length'):
            duration_sec = audio_file.info.length
            if duration_sec and duration_sec > 0:
                duration_ms = int(duration_sec * 1000)
                logger.info(f"Got duration from mutagen: {duration_ms} ms ({duration_sec:.2f} seconds)")
                return duration_ms
    except ImportError:
        logger.warning("mutagen not installed, trying other methods...")
    except Exception as e:
        logger.warning(f"mutagen failed: {str(e)}")
    
    # Method 4: pydub (requires ffmpeg but can work)
    try:
        from pydub import AudioSegment
        audio = AudioSegment.from_file(file_path)
        duration_ms = len(audio)
        if duration_ms > 0:
            logger.info(f"Got duration from pydub: {duration_ms} ms")
            return duration_ms
    except ImportError:
        logger.warning("pydub not installed")
    except Exception as e:
        logger.warning(f"pydub failed: {str(e)}")
    
    logger.error(f"Could not determine duration from file: {file_path}")
    return None


# Initialize FastAPI app
app = FastAPI(
    title="Protocol Maker API",
    description="Backend API for Protocol Maker application",
    version="1.0.0"
)

# Add CORS middleware
# Get CORS origins from environment or use defaults
default_origins = "http://localhost:5173,http://localhost:3000,http://176.98.234.178:3000,http://176.98.234.178,https://ai.teamidea.ru"
cors_origins_env = os.getenv("CORS_ORIGINS", default_origins)
cors_origins = [origin.strip() for origin in cors_origins_env.split(",")]

logger.info(f"CORS origins configured: {cors_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH", "HEAD"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,
)

# Добавляем явный обработчик OPTIONS для отладки
@app.options("/{full_path:path}")
async def options_handler(full_path: str):
    """Handle OPTIONS requests for CORS preflight"""
    return {"message": "OK"}

# Load protocol types from JSON file
def load_protocol_types() -> Dict[str, ProtocolTypeInfo]:
    """Load protocol types from JSON file"""
    try:
        with open("data/protocol_types.json", "r", encoding="utf-8") as f:
            data = json.load(f)
        return {k: ProtocolTypeInfo(**v) for k, v in data.items()}
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="Protocol types configuration not found")
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Invalid protocol types configuration")

# Global variable to store protocol types
protocol_types = load_protocol_types()

# Protocol storage file path
PROTOCOLS_STORAGE_FILE = "data/protocols.json"

def save_protocol_to_storage(protocol_id: str, protocol_response: ProtocolResponse):
    """Save protocol to JSON storage file"""
    os.makedirs("data", exist_ok=True)
    
    # Load existing protocols
    protocols = {}
    if os.path.exists(PROTOCOLS_STORAGE_FILE):
        try:
            with open(PROTOCOLS_STORAGE_FILE, "r", encoding="utf-8") as f:
                protocols = json.load(f)
        except (json.JSONDecodeError, IOError):
            protocols = {}
    
    # Add new protocol
    # protocol_response.protocol is already a dict (not a Pydantic model)
    protocol_data = {
        "id": protocol_response.id,
        "status": protocol_response.status.value if isinstance(protocol_response.status, ProtocolStatus) else protocol_response.status,
        "protocol": protocol_response.protocol if protocol_response.protocol else None,
        "error": protocol_response.error,
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat()
    }
    
    protocols[protocol_id] = protocol_data
    
    # Save back to file
    with open(PROTOCOLS_STORAGE_FILE, "w", encoding="utf-8") as f:
        json.dump(protocols, f, ensure_ascii=False, indent=2)
    
    logger.info(f"Protocol {protocol_id} saved to storage")

def load_protocols_from_storage() -> Dict:
    """Load all protocols from JSON storage file"""
    if not os.path.exists(PROTOCOLS_STORAGE_FILE):
        return {}
    
    try:
        with open(PROTOCOLS_STORAGE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        logger.error(f"Error loading protocols from storage: {str(e)}")
        return {}

def delete_protocol_from_storage(protocol_id: str) -> bool:
    """Delete protocol from storage"""
    if not os.path.exists(PROTOCOLS_STORAGE_FILE):
        return False
    
    try:
        protocols = load_protocols_from_storage()
        if protocol_id in protocols:
            del protocols[protocol_id]
            with open(PROTOCOLS_STORAGE_FILE, "w", encoding="utf-8") as f:
                json.dump(protocols, f, ensure_ascii=False, indent=2)
            logger.info(f"Protocol {protocol_id} deleted from storage")
            return True
        return False
    except Exception as e:
        logger.error(f"Error deleting protocol from storage: {str(e)}")
        return False

# Initialize services (lazy initialization to avoid errors on import)
assemblyai_service = None
llm_client = None

def get_assemblyai_service():
    """Get or create AssemblyAI service instance"""
    global assemblyai_service
    if assemblyai_service is None:
        assemblyai_service = AssemblyAIService()
    return assemblyai_service

def get_llm_client():
    """Get or create LLM client instance"""
    global llm_client
    if llm_client is None:
        llm_client = LLMClient()
    return llm_client

@app.get("/")
async def root():
    """Root endpoint"""
    return {"message": "Protocol Maker API", "version": "1.0.0"}

@app.get("/api/protocol-types")
async def get_protocol_types():
    """Get all available protocol types"""
    return list(protocol_types.values())

@app.get("/api/protocol-types/{protocol_id}")
async def get_protocol_type(protocol_id: str):
    """Get specific protocol type by ID"""
    if protocol_id not in protocol_types:
        raise HTTPException(status_code=404, detail="Protocol type not found")
    return protocol_types[protocol_id]

@app.post("/api/protocols/submit")
async def submit_protocol(
    protocolType: str = Form(...),
    participants: str = Form(...),
    audioFile: UploadFile = File(...),
    useCommandLine: bool = Form(False),
    saveTranscript: bool = Form(True),
    speakerMapping: Optional[str] = Form(None)
):
    """
    Submit protocol for processing
    
    Args:
        protocolType: Protocol type ID (e.g., "standard-meeting")
        participants: JSON string containing list of participants
        audioFile: Audio file (MP3, WAV, M4A)
        useCommandLine: Whether to use faster-whisper command line interface
        saveTranscript: Whether to save transcript to a text file
    
    Returns:
        ProtocolResponse with processing status
    """
    response = None  # Initialize response variable
    try:
        # Validate protocol type (strip whitespace)
        protocolType = protocolType.strip() if protocolType else protocolType
        if protocolType not in protocol_types:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid protocol type: '{protocolType}'. Available types: {list(protocol_types.keys())}"
            )
        
        # Parse participants
        try:
            participants_data = json.loads(participants)
            participants_list = [Participant(**p) for p in participants_data]
        except (json.JSONDecodeError, ValueError) as e:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid participants format: {str(e)}"
            )
        
        # Validate audio file
        if not audioFile.filename:
            raise HTTPException(status_code=400, detail="No audio file provided")
        
        # Check file type
        allowed_types = ["audio/mpeg", "audio/wav", "audio/mp4", "audio/x-m4a"]
        if audioFile.content_type not in allowed_types:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type: {audioFile.content_type}. Allowed: {allowed_types}"
            )
        
        # Generate unique protocol ID
        protocol_id = str(uuid.uuid4())
        
        # Get protocol type info
        protocol_type_info = protocol_types[protocolType]
        
        # Create uploads directory if it doesn't exist
        os.makedirs("uploads", exist_ok=True)
        
        # Save audio file
        file_path = f"uploads/{protocol_id}_{audioFile.filename}"
        file_size = 0
        async with aiofiles.open(file_path, 'wb') as f:
            content = await audioFile.read()
            file_size = len(content)
            await f.write(content)
        
        # Get audio duration from file FIRST (before sending to AssemblyAI)
        logger.info(f"Getting audio duration from file: {file_path}")
        audio_duration_ms = get_audio_duration_from_file(file_path)
        if audio_duration_ms:
            logger.info(f"Audio duration determined: {audio_duration_ms} ms ({audio_duration_ms/1000:.2f} seconds)")
        else:
            logger.warning("Could not determine audio duration from file, will try from API response")
        
        # Process the audio file and generate protocol
        try:
            # Step 1: Transcribe audio file using AssemblyAI
            print(f"Transcribing audio file: {file_path}")
            print(f"Save transcript: {saveTranscript}")
            
            # Transcribe using AssemblyAI
            # Run transcription in thread pool since AssemblyAI SDK is synchronous
            # Pass audio_duration_ms directly to transcribe_file so it uses it in transcript
            service = get_assemblyai_service()
            loop = asyncio.get_event_loop()
            
            # Store audio_duration_ms for lambda closure
            duration_to_pass = audio_duration_ms if audio_duration_ms and audio_duration_ms > 0 else None
            logger.info(f"Passing duration to transcribe_file: {duration_to_pass} ms ({duration_to_pass/1000:.2f} seconds)" if duration_to_pass else "No duration to pass")
            
            transcription_result = await loop.run_in_executor(
                None,
                lambda path=file_path, duration=duration_to_pass: service.transcribe_file(
                    path,
                    enable_speaker_labels=True,
                    audio_duration_ms=duration
                )
            )
            
            if not transcription_result["success"]:
                raise Exception(f"Transcription failed: {transcription_result.get('error', 'Unknown error')}")
            
            # Get transcript text
            transcript_text = transcription_result["formatted_text"] or transcription_result["text"]
            if not transcript_text:
                raise Exception("No transcript generated")
            
            # Use duration from file if we got it, otherwise try from API response
            duration_ms = audio_duration_ms if audio_duration_ms else 0
            
            # If we still don't have duration, try to get from transcription result
            if not duration_ms or duration_ms == 0:
                logger.info("Trying to get duration from transcription_result...")
                duration_ms = transcription_result.get("duration", 0)
                logger.info(f"Duration from transcription_result: {duration_ms} ms")
            
            # If still 0, try from utterances
            if not duration_ms or duration_ms == 0:
                logger.info("Trying to calculate from utterances...")
                utterances = transcription_result.get("utterances", [])
                if utterances:
                    last_utterance = utterances[-1]
                    last_end_time = last_utterance.get('end', 0)
                    logger.info(f"Last utterance end time: {last_end_time} ms")
                    if last_end_time > 0:
                        duration_ms = last_end_time
                        logger.info(f"Calculated duration from last utterance: {duration_ms} ms")
            
            # Update formatted_text in transcript with correct duration
            # Replace duration line in formatted transcript if it exists
            if duration_ms and duration_ms > 0:
                # Format duration for replacement
                total_seconds = duration_ms // 1000
                hours = total_seconds // 3600
                minutes = (total_seconds % 3600) // 60
                seconds = total_seconds % 60
                
                if hours > 0:
                    duration_str = f"{hours} ч {minutes} мин" if minutes > 0 else f"{hours} ч"
                elif minutes > 0:
                    duration_str = f"{minutes} мин {seconds} сек" if seconds > 0 else f"{minutes} мин"
                else:
                    duration_str = f"{seconds} сек"
                
                # Update formatted_text in transcription_result if it exists
                if transcription_result.get("formatted_text"):
                    import re
                    formatted_text = transcription_result["formatted_text"]
                    
                    # Pattern to match "Длительность: ..." line (including "0 сек", "Неизвестно", etc.)
                    # Try multiple patterns to ensure we catch it
                    patterns = [
                        r'Длительность:\s*[^\n]*',  # Standard pattern
                        r'Длительность:\s*\d+\s*сек',  # Pattern with "0 сек"
                        r'Длительность:\s*Неизвестно',  # Pattern with "Неизвестно"
                        r'Длительность:\s*\d{2}:\d{2}',  # Pattern with MM:SS format
                    ]
                    
                    for pattern in patterns:
                        if re.search(pattern, formatted_text):
                            formatted_text = re.sub(pattern, f"Длительность: {duration_str}", formatted_text)
                            logger.info(f"Updated duration in formatted transcript using pattern '{pattern}' to: {duration_str}")
                            break
                    else:
                        # If no pattern matched, try to insert/replace manually
                        lines = formatted_text.split('\n')
                        for i, line in enumerate(lines):
                            if 'Длительность:' in line:
                                lines[i] = f"Длительность: {duration_str}"
                                formatted_text = '\n'.join(lines)
                                logger.info(f"Updated duration in formatted transcript manually to: {duration_str}")
                                break
                    
                    transcription_result["formatted_text"] = formatted_text
                    transcript_text = formatted_text  # Update transcript_text for consistency
                    logger.info(f"Final formatted_text contains duration: {'Длительность:' in formatted_text}")
                    
                    # Verify the replacement worked
                    if 'Длительность: 0 сек' in formatted_text or 'Длительность: Неизвестно' in formatted_text:
                        logger.error(f"Duration replacement FAILED! Still contains '0 сек' or 'Неизвестно'")
                        logger.error(f"Duration_ms value: {duration_ms}, duration_str: {duration_str}")
                    else:
                        logger.info(f"Duration replacement SUCCESS: '{duration_str}' is in formatted_text")
            
            # Format duration to readable format
            def format_duration(milliseconds: int) -> str:
                """Format duration from milliseconds to readable string"""
                if not milliseconds or milliseconds == 0:
                    return "Неизвестно"
                
                # Handle values less than 1 second
                if milliseconds < 1000:
                    return f"{milliseconds} мс"
                
                total_seconds = milliseconds // 1000
                hours = total_seconds // 3600
                minutes = (total_seconds % 3600) // 60
                seconds = total_seconds % 60
                
                if hours > 0:
                    return f"{hours} ч {minutes} мин" if minutes > 0 else f"{hours} ч"
                elif minutes > 0:
                    return f"{minutes} мин" if seconds < 30 else f"{minutes} мин {seconds} сек"
                else:
                    return f"{seconds} сек"
            
            formatted_duration = format_duration(duration_ms)
            logger.info(f"Final duration: {formatted_duration} ({duration_ms} ms)")
            print(f"Transcript generated ({len(transcript_text)} characters)")
            print(f"Audio duration: {formatted_duration} ({duration_ms} ms)")
            
            # CRITICAL: Replace duration in transcript using formatted_duration (same as card)
            # Replace "Длительность: 0 сек" or "Длительность: Неизвестно" with correct value
            if formatted_duration != "Неизвестно" and duration_ms > 0:
                # Get current transcript
                current_transcript = transcription_result.get("formatted_text") or transcript_text
                
                # Simple line-by-line replacement - most reliable
                lines = current_transcript.split('\n')
                replaced = False
                for i, line in enumerate(lines):
                    if 'Длительность:' in line:
                        old_line = line
                        lines[i] = f"Длительность: {formatted_duration}"
                        replaced = True
                        logger.info(f"✓ Replaced '{old_line.strip()}' with 'Длительность: {formatted_duration}'")
                        break
                
                if replaced:
                    updated_transcript = '\n'.join(lines)
                    transcription_result["formatted_text"] = updated_transcript
                    transcript_text = updated_transcript
                    logger.info(f"✓ Transcript updated with card duration: '{formatted_duration}'")
                else:
                    logger.warning(f"⚠ Could not find 'Длительность:' line in transcript to replace")
            
            # Ensure transcript_text uses the updated formatted_text with correct duration
            if transcription_result.get("formatted_text"):
                transcript_text = transcription_result["formatted_text"]
            
            # Save transcript to file if requested
            transcript_file_path = None
            if saveTranscript:
                transcript_file_name = f"{protocol_id}_transcript.txt"
                transcript_file_path = f"uploads/{transcript_file_name}"
                service = get_assemblyai_service()
                # Save the updated transcript with correct duration
                await loop.run_in_executor(
                    None,
                    service.save_transcript,
                    transcript_text,
                    transcript_file_path
                )
                print(f"Transcript saved to: {transcript_file_path}")
                
                # Verify duration is in saved file
                if duration_ms and duration_ms > 0:
                    try:
                        with open(transcript_file_path, 'r', encoding='utf-8') as f:
                            saved_content = f.read()
                            if 'Длительность: 0 сек' in saved_content or 'Длительность: Неизвестно' in saved_content:
                                logger.warning(f"Duration still incorrect in saved file! Content preview: {saved_content[:200]}")
                    except Exception as e:
                        logger.warning(f"Could not verify saved transcript: {str(e)}")
            
            # Add participant information to transcript
            if participants_data:
                participant_names = [p.get('name', 'Unknown') if isinstance(p, dict) else p.name for p in participants_data]
                participant_section = f"\nУчастники: {', '.join(participant_names)}\n"
                if "СТЕНОГРАММА ВСТРЕЧИ" in transcript_text:
                    transcript_text = transcript_text.replace("СТЕНОГРАММА ВСТРЕЧИ", f"СТЕНОГРАММА ВСТРЕЧИ{participant_section}")
                else:
                    transcript_text = f"СТЕНОГРАММА ВСТРЕЧИ{participant_section}\n{transcript_text}"
            
            # FINAL: Ensure duration is correct in transcript_text after all modifications
            if formatted_duration != "Неизвестно" and duration_ms > 0:
                # Replace duration one more time to be absolutely sure
                lines = transcript_text.split('\n')
                for i, line in enumerate(lines):
                    if 'Длительность:' in line and formatted_duration not in line:
                        lines[i] = f"Длительность: {formatted_duration}"
                        transcript_text = '\n'.join(lines)
                        logger.info(f"✓ FINAL replacement: 'Длительность: {formatted_duration}' in transcript")
                        break

            # Step 1.5: Map diarized speakers to real participant names (if mapping provided or inferrable)
            try:
                # Build participant id->name map and name set
                participant_id_to_name = {}
                participant_names = []
                for p in participants_data:
                    if isinstance(p, dict):
                        pid = p.get('id') or p.get('email') or p.get('name')
                        pname = p.get('name') or 'Участник'
                    else:
                        pid = getattr(p, 'id', None) or getattr(p, 'email', None) or getattr(p, 'name', None)
                        pname = getattr(p, 'name', 'Участник')
                    if pid:
                        participant_id_to_name[str(pid)] = pname
                        participant_names.append(pname)

                # Parse incoming mapping if provided
                explicit_mapping = None
                if speakerMapping:
                    try:
                        explicit_mapping = json.loads(speakerMapping)
                    except Exception as e:
                        logger.warning(f"Invalid speakerMapping JSON ignored: {str(e)}")

                # Extract speaker labels from transcript (e.g., 'Спикер A', 'Speaker B', 'SPEAKER_01')
                import re as _re
                label_patterns = [
                    r"Спикер\s*[A-ZА-Я]",
                    r"Speaker\s*[A-Z]",
                    r"SPEAKER_\d{2}",
                ]
                found_labels = set()
                for pat in label_patterns:
                    for m in _re.findall(pat, transcript_text):
                        found_labels.add(m.strip())
                ordered_labels = list(found_labels)

                # Build final mapping: label -> participant name
                # IMPORTANT: Only apply mapping if explicit speakerMapping is provided
                # Automatic mapping is disabled - mapping should happen on frontend after transcription
                label_to_name: Dict[str, str] = {}
                if explicit_mapping and isinstance(explicit_mapping, dict):
                    # Mapping may be label->participantId or label->participantName
                    for lbl, val in explicit_mapping.items():
                        name_val = participant_id_to_name.get(str(val), None)
                        label_to_name[str(lbl)] = name_val or str(val)
                # REMOVED: Automatic mapping by order - this should be done on frontend
                # elif ordered_labels and participant_names:
                #     # Heuristic: map in order of appearance to participants order
                #     for idx, lbl in enumerate(ordered_labels):
                #         if idx < len(participant_names):
                #             label_to_name[lbl] = participant_names[idx]

                # Apply mapping to transcript ONLY if explicit mapping was provided
                if label_to_name:
                    def _escape_re(s: str) -> str:
                        return _re.escape(s)
                    for lbl, pname in label_to_name.items():
                        # Replace variants: "Label:", "Label -", standalone occurrences
                        patterns = [
                            _re.compile(rf"(^|\n)\s*{_escape_re(lbl)}\s*:\\s*"),
                            _re.compile(rf"(^|\n)\s*{_escape_re(lbl)}\s*-\\s*"),
                        ]
                        for rp in patterns:
                            transcript_text = rp.sub(lambda m: f"{m.group(1)}{pname}: ", transcript_text)
                        # Fallback: raw label occurrences (less specific)
                        transcript_text = _re.sub(rf"{_escape_re(lbl)}", pname, transcript_text)
                    logger.info(f"Applied speaker mapping to transcript: {len(label_to_name)} labels replaced")
            except Exception as map_err:
                logger.warning(f"Speaker mapping step failed: {str(map_err)}")
            
            # Remove any duration line from transcript if it exists
            import re
            final_transcript = re.sub(r'Длительность:\s*[^\n]*\n?', '', transcript_text)
            logger.info(f"Final transcript after cleanup: length={len(final_transcript)}")
            
            # Extract diarization data from utterances
            logger.info("=== Starting diarization data extraction ===")
            utterances = transcription_result.get("utterances", [])
            logger.info(f"Utterances from transcription_result: {len(utterances) if utterances else 0}")
            
            diarization_data = None
            try:
                if utterances:
                    logger.info(f"Processing {len(utterances)} utterances")
                    logger.info(f"First utterance example: {utterances[0] if utterances else 'None'}")
                    
                    # Extract unique speakers
                    speakers = set()
                    for u in utterances:
                        speaker = u.get('speaker', 'Unknown')
                        if speaker:
                            speakers.add(str(speaker))
                    logger.info(f"Found unique speakers: {list(speakers)}")
                    
                    diarization_data = {
                        "utterances": utterances,
                        "segments": utterances,  # For compatibility
                        "speaker_count": len(speakers),
                        "duration_ms": duration_ms
                    }
                    logger.info(f"Diarization data created: speaker_count={diarization_data['speaker_count']}, duration_ms={duration_ms}")
                else:
                    logger.warning("No utterances found in transcription_result")
            except Exception as diarization_error:
                logger.error(f"Error creating diarization_data: {str(diarization_error)}", exc_info=True)
                diarization_data = None
            
            # Return only transcription result (without LLM generation)
            # LLM generation will be done in /api/protocols/submit_llm after speaker mapping
            logger.info(f"Transcription completed. Transcript length: {len(final_transcript)}, duration: {formatted_duration} ({duration_ms} ms)")
            
            try:
                response = {
                    "success": True,
                    "transcript": final_transcript,
                    "diarization": diarization_data,
                    "duration": formatted_duration,
                    "duration_ms": duration_ms,
                    "protocol_id": protocol_id,
                    "transcript_file": transcript_file_path
                }
                # Убеждаемся, что поле error отсутствует в успешном ответе
                if "error" in response:
                    del response["error"]
                logger.info(f"Response created successfully. Keys: {list(response.keys())}")
                logger.info(f"Response.success: {response.get('success')}")
                logger.info(f"Response.transcript length: {len(response.get('transcript', ''))}")
                logger.info(f"Response.diarization: {response.get('diarization') is not None}")
                if response.get('diarization'):
                    logger.info(f"Response.diarization keys: {list(response.get('diarization', {}).keys())}")
            except Exception as response_error:
                logger.error(f"Error creating response dict: {str(response_error)}", exc_info=True)
                raise
            
        except Exception as processing_error:
            print(f"Error processing protocol {protocol_id}: {str(processing_error)}")
            logger.error(f"Transcription failed: {str(processing_error)}", exc_info=True)
            logger.error(f"Error type: {type(processing_error).__name__}")
            logger.error(f"Error details: {repr(processing_error)}")
            
            # Return error response
            try:
                response = {
                    "success": False,
                    "error": f"Transcription failed: {str(processing_error)}",
                    "transcript": "",
                    "diarization": None,
                    "duration": "Неизвестно",
                    "duration_ms": 0
                }
                logger.info(f"Error response created: {response}")
                return response
            except Exception as response_error:
                logger.error(f"Failed to create error response: {str(response_error)}", exc_info=True)
                raise
        
        # Log the submission (for debugging)
        print(f"Transcription completed:")
        print(f"  ID: {protocol_id}")
        print(f"  Type: {protocol_type_info.name} ({protocolType})")
        print(f"  Participants: {len(participants_list)}")
        print(f"  Audio file: {audioFile.filename} ({file_size} bytes)")
        print(f"  Saved to: {file_path}")
        
        # Final logging before return
        logger.info("=== Final response before return ===")
        if response is None:
            logger.error("CRITICAL: response is None! Creating error response")
            response = {
                "success": False,
                "error": "Internal error: response was not created",
                "transcript": "",
                "diarization": None,
                "duration": "Неизвестно",
                "duration_ms": 0
            }
        logger.info(f"Response type: {type(response)}")
        logger.info(f"Response keys: {list(response.keys()) if isinstance(response, dict) else 'not a dict'}")
        logger.info(f"Response.success: {response.get('success') if isinstance(response, dict) else 'N/A'}")
        if isinstance(response, dict) and response.get('success'):
            logger.info(f"Response.transcript length: {len(response.get('transcript', ''))}")
            logger.info(f"Response.diarization present: {response.get('diarization') is not None}")
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"=== CRITICAL ERROR in submit_protocol ===")
        logger.error(f"Error type: {type(e).__name__}")
        logger.error(f"Error message: {str(e)}")
        logger.error(f"Error details: {repr(e)}", exc_info=True)
        
        # Return error response in TranscriptionResult format
        error_response = {
            "success": False,
            "error": f"Ошибка обработки: {str(e)}",
            "transcript": "",
            "diarization": None,
            "duration": "Неизвестно",
            "duration_ms": 0
        }
        logger.info(f"Error response created: {error_response}")
        return error_response



@app.post("/api/protocols/submit_llm")
async def submit_llm(
    protocolType: str = Form(...),
    participants: str = Form(...),
    transcript: str = Form(...),
    duration: Optional[str] = Form(None),
    duration_ms: Optional[int] = Form(None)
):
    """
    Generate protocol using LLM with already prepared transcript (after speaker mapping).
    This endpoint is called after speaker mapping step.
    It performs:
    - Generate protocol using LLM with transcript
    - Create successful response with all metadata
    """
    logger.info(f"=== submit_llm endpoint called ===")
    logger.info(f"Protocol type: {protocolType}")
    logger.info(f"Participants length: {len(participants) if participants else 0}")
    logger.info(f"Transcript length: {len(transcript) if transcript else 0}")
    logger.info(f"Duration: {duration}, Duration_ms: {duration_ms}")
    try:
        # Validate protocol type (strip whitespace)
        protocolType = protocolType.strip() if protocolType else protocolType
        if protocolType not in protocol_types:
            raise HTTPException(status_code=400, detail=f"Invalid protocol type: '{protocolType}'. Available types: {list(protocol_types.keys())}")

        try:
            participants_data = json.loads(participants)
        except (json.JSONDecodeError, ValueError) as e:
            raise HTTPException(status_code=400, detail=f"Invalid participants format: {str(e)}")

        if not transcript or len(transcript.strip()) == 0:
            raise HTTPException(status_code=400, detail="Transcript is required")

        protocol_id = str(uuid.uuid4())
        protocol_type_info = protocol_types[protocolType]

        # Step 2: Generate protocol using LLM with transcript
        logger.info(f"Generating protocol from transcript for ID: {protocol_id}")
        llm = get_llm_client()
        protocol_content = await llm.generate_protocol(
            transcript=transcript,
            participants=participants_data,
            assistant_id=protocol_type_info.assistant_id,
            thread_ref=f"protocol-{protocol_id}"
        )

        # Step 3: Create successful response with all metadata
        # Format duration
        formatted_duration = duration if duration else "Неизвестно"
        duration_ms_value = duration_ms if duration_ms else 0
        
        # Remove any duration line from transcript if it exists
        import re
        final_transcript = re.sub(r'Длительность:\s*[^\n]*\n?', '', transcript)
        
        logger.info(f"Creating response with duration: {formatted_duration} ({duration_ms_value} ms)")

        response = ProtocolResponse(
            id=protocol_id,
            status=ProtocolStatus.COMPLETED,
            protocol={
                "content": protocol_content,
                "summary": "Протокол сгенерирован автоматически на основе транскрипции",
                "decisions": ["Обработано автоматически"],
                "transcript": final_transcript,
                "participants": participants_data,
                "protocol_type": protocol_type_info.name,
                "duration": formatted_duration,
                "duration_ms": duration_ms_value,
                "created_at": datetime.now().isoformat()
            },
            error=None
        )

        # Save protocol to storage
        try:
            save_protocol_to_storage(protocol_id, response)
        except Exception as save_error:
            logger.warning(f"Failed to save protocol to storage: {str(save_error)}")

        logger.info(f"Protocol generated successfully for ID: {protocol_id}")
        logger.info(f"Returning response: id={response.id}, status={response.status.value}, has_protocol={response.protocol is not None}")
        return JSONResponse(content=response.model_dump(), status_code=200)

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_traceback = traceback.format_exc()
        logger.error(f"Error generating from transcript: {str(e)}")
        logger.error(f"Full traceback:\n{error_traceback}")
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")

@app.get("/api/protocols/{protocol_id}/status")
async def get_protocol_status(protocol_id: str):
    """Get protocol processing status"""
    # TODO: Implement actual status checking logic
    # For now, return a mock response
    return ProtocolResponse(
        id=protocol_id,
        status=ProtocolStatus.PROCESSING,
        protocol=None,
        error=None
    )

@app.get("/api/protocols")
async def get_protocols():
    """Get list of all protocols"""
    try:
        protocols = load_protocols_from_storage()
        # Convert dict to list, sorted by created_at (newest first)
        protocols_list = []
        for protocol_id, protocol_data in protocols.items():
            # Only include completed protocols
            if protocol_data.get("status") == "completed" and protocol_data.get("protocol"):
                # Извлекаем meeting_title из content (который является JSON строкой)
                meeting_title = None
                protocol_content = protocol_data.get("protocol", {}).get("content", "")
                if protocol_content:
                    try:
                        # Пробуем распарсить content как JSON
                        content_json = json.loads(protocol_content)
                        if isinstance(content_json, dict) and "metadata" in content_json:
                            meeting_title = content_json.get("metadata", {}).get("meeting_title")
                    except (json.JSONDecodeError, TypeError):
                        # Если content не JSON, пробуем найти meeting_title другим способом
                        pass
                
                protocols_list.append({
                    "id": protocol_id,
                    "protocol_type": protocol_data.get("protocol", {}).get("protocol_type", "Неизвестно"),
                    "duration": protocol_data.get("protocol", {}).get("duration", "Неизвестно"),
                    "summary": protocol_data.get("protocol", {}).get("summary", ""),
                    "created_at": protocol_data.get("created_at", protocol_data.get("protocol", {}).get("created_at", "")),
                    "participants": protocol_data.get("protocol", {}).get("participants", []),
                    "meeting_title": meeting_title
                })
        
        # Sort by created_at descending (newest first)
        protocols_list.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        return protocols_list
    except Exception as e:
        logger.error(f"Error getting protocols: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error loading protocols: {str(e)}")

@app.delete("/api/protocols/{protocol_id}")
async def delete_protocol(protocol_id: str):
    """Delete a protocol"""
    try:
        success = delete_protocol_from_storage(protocol_id)
        if success:
            return {"message": f"Protocol {protocol_id} deleted", "success": True}
        else:
            raise HTTPException(status_code=404, detail=f"Protocol {protocol_id} not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting protocol: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error deleting protocol: {str(e)}")

@app.get("/api/protocols/{protocol_id}")
async def get_protocol(protocol_id: str):
    """Get a specific protocol by ID"""
    try:
        protocols = load_protocols_from_storage()
        if protocol_id not in protocols:
            raise HTTPException(status_code=404, detail=f"Protocol {protocol_id} not found")
        
        protocol_data = protocols[protocol_id]
        return protocol_data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting protocol: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error loading protocol: {str(e)}")

@app.post("/api/transcribe")
async def transcribe_audio(
    audioFile: UploadFile = File(...),
    useCommandLine: bool = Form(False),
    modelSize: str = Form("medium"),
    device: str = Form("cpu"),
    language: str = Form("ru"),
    enableDiarization: bool = Form(False),
    minSpeakers: int = Form(None),
    maxSpeakers: int = Form(None)
):
    """
    Transcribe audio file using faster-whisper with optional diarization
    
    Args:
        audioFile: Audio file (MP3, WAV, M4A)
        useCommandLine: Whether to use command line interface
        modelSize: Whisper model size (tiny, base, small, medium, large-v1, large-v2, large-v3)
        device: Device to run on (cpu, cuda)
        language: Language code (ru, en, etc.) or "auto" for detection
        enableDiarization: Whether to perform speaker diarization
        minSpeakers: Minimum number of speakers for diarization
        maxSpeakers: Maximum number of speakers for diarization
    
    Returns:
        Transcription result with text, metadata, and optional diarization
    """
    try:
        # Validate audio file
        if not audioFile.filename:
            raise HTTPException(status_code=400, detail="No audio file provided")
        
        # Check file type
        allowed_types = ["audio/mpeg", "audio/wav", "audio/mp4", "audio/x-m4a"]
        if audioFile.content_type not in allowed_types:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type: {audioFile.content_type}. Allowed: {allowed_types}"
            )
        
        # Generate unique file ID
        file_id = str(uuid.uuid4())
        
        # Create uploads directory if it doesn't exist
        os.makedirs("uploads", exist_ok=True)
        
        # Save audio file
        file_path = f"uploads/{file_id}_{audioFile.filename}"
        async with aiofiles.open(file_path, 'wb') as f:
            content = await audioFile.read()
            await f.write(content)
        
        # Process the audio with optional diarization
        print(f"Processing audio file: {file_path}")
        print(f"Using command line: {useCommandLine}")
        print(f"Model size: {modelSize}, Device: {device}")
        print(f"Enable diarization: {enableDiarization}")
        
        if enableDiarization:
            # Use AssemblyAI for transcription with speaker diarization (ONLY AssemblyAI, no fallback)
            # Get audio duration from file first
            audio_duration_ms = get_audio_duration_from_file(file_path)
            
            service = get_assemblyai_service()
            loop = asyncio.get_event_loop()
            
            # Store audio_duration_ms for lambda closure
            duration_to_pass = audio_duration_ms if audio_duration_ms and audio_duration_ms > 0 else None
            
            transcription_result = await loop.run_in_executor(
                None,
                lambda path=file_path, duration=duration_to_pass: service.transcribe_file(
                    path,
                    enable_speaker_labels=True,
                    audio_duration_ms=duration
                )
            )
            
            if not transcription_result["success"]:
                error_msg = transcription_result.get('error', 'Unknown error')
                logger.error(f"AssemblyAI transcription failed: {error_msg}")
                raise HTTPException(status_code=500, detail=f"Transcription failed: {error_msg}")
            
            # Get transcript text
            transcript = transcription_result["formatted_text"] or transcription_result["text"]
            if not transcript:
                raise HTTPException(status_code=500, detail="No transcript generated")
            
            # Get duration from transcription result or file
            duration_ms = audio_duration_ms if audio_duration_ms else transcription_result.get("duration", 0)
            
            # Extract diarization data from utterances
            utterances = transcription_result.get("utterances", [])
            diarization = None
            if utterances:
                # Format diarization data for frontend
                diarization = {
                    "utterances": utterances,
                    "segments": utterances,  # For compatibility
                    "speaker_count": len(set(u.get('speaker', 'Unknown') for u in utterances)),
                    "duration_ms": duration_ms  # Include duration in diarization data
                }
            
            aligned_transcript = None
        else:
            # Initialize audio processor only when needed (no diarization)
            # Import AudioProcessor here to avoid import errors if faster_whisper is not installed
            try:
                from services.audio_processor import AudioProcessor
            except ImportError as e:
                raise HTTPException(
                    status_code=500,
                    detail=f"AudioProcessor not available (faster_whisper not installed): {str(e)}"
                )
            processor = AudioProcessor(model_size=modelSize, device=device)
            transcript = await processor.process_audio(
                audio_file_path=file_path,
                participants=[],  # No participants for simple transcription
                prompt="Transcribe audio file",
                use_command_line=useCommandLine,
                save_to_file=True
            )
            diarization = None
            aligned_transcript = None
        
        # Clean up audio file
        try:
            os.remove(file_path)
        except:
            pass  # Ignore cleanup errors
        
        # Format duration for response
        formatted_duration = "Неизвестно"
        duration_ms_value = 0
        if enableDiarization and diarization and diarization.get("duration_ms"):
            duration_ms_value = diarization.get("duration_ms", 0)
            if duration_ms_value > 0:
                minutes = duration_ms_value // 60000
                seconds = (duration_ms_value % 60000) // 1000
                if minutes > 0:
                    formatted_duration = f"{minutes} мин {seconds} сек"
                else:
                    formatted_duration = f"{seconds} сек"
        
        response = {
            "success": True,
            "transcript": transcript,
            "file_id": file_id,
            "model_size": modelSize,
            "device": device,
            "use_command_line": useCommandLine,
            "diarization_enabled": enableDiarization,
            "duration": formatted_duration,
            "duration_ms": duration_ms_value
        }
        
        # Add diarization results if enabled
        if enableDiarization and diarization:
            response["diarization"] = diarization
            if aligned_transcript:
                response["aligned_transcript"] = aligned_transcript
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error transcribing audio: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

@app.post("/api/diarize")
async def diarize_audio(
    audioFile: UploadFile = File(...),
    minSpeakers: int = Form(None),
    maxSpeakers: int = Form(None),
    device: str = Form("cpu")
):
    """
    Perform speaker diarization on audio file
    
    Args:
        audioFile: Audio file (MP3, WAV, M4A)
        minSpeakers: Minimum number of speakers
        maxSpeakers: Maximum number of speakers
        device: Device to run on (cpu, cuda)
    
    Returns:
        Diarization result with speaker segments and statistics
    """
    try:
        # Validate audio file
        if not audioFile.filename:
            raise HTTPException(status_code=400, detail="No audio file provided")
        
        # Check file type
        allowed_types = ["audio/mpeg", "audio/wav", "audio/mp4", "audio/x-m4a"]
        if audioFile.content_type not in allowed_types:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type: {audioFile.content_type}. Allowed: {allowed_types}"
            )
        
        # Generate unique file ID
        file_id = str(uuid.uuid4())
        
        # Create uploads directory if it doesn't exist
        os.makedirs("uploads", exist_ok=True)
        
        # Save audio file
        file_path = f"uploads/{file_id}_{audioFile.filename}"
        async with aiofiles.open(file_path, 'wb') as f:
            content = await audioFile.read()
            await f.write(content)
        
        # Initialize diarization service
        from services.audio_diarization import AudioDiarization
        
        # Get Hugging Face token from environment
        hf_token = os.getenv('HUGGINGFACE_HUB_TOKEN')
        diarizer = AudioDiarization(device=device, use_auth_token=hf_token)
        
        # Perform diarization
        print(f"Diarizing audio file: {file_path}")
        print(f"Min speakers: {minSpeakers}, Max speakers: {maxSpeakers}")
        
        result = await diarizer.diarize_audio(
            audio_file_path=file_path,
            min_speakers=minSpeakers,
            max_speakers=maxSpeakers
        )
        
        # Save result to file
        if result["success"]:
            base_name = os.path.splitext(os.path.basename(audioFile.filename))[0]
            diarization_file = f"uploads/{base_name}_diarization.txt"
            diarizer.save_diarization_result(result, diarization_file)
            result["diarization_file"] = diarization_file
        
        # Clean up audio file
        try:
            os.remove(file_path)
        except:
            pass  # Ignore cleanup errors
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error diarizing audio: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Diarization failed: {str(e)}")

@app.get("/api/protocols/{protocol_id}/download")
async def download_protocol(protocol_id: str):
    """Download processed protocol"""
    # TODO: Implement actual download logic
    raise HTTPException(status_code=501, detail="Download functionality not implemented yet")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3001)
