"""
Audio processing service integration using faster-whisper
"""
import asyncio
import os
import subprocess
import tempfile
from typing import Dict, Any, Optional, List
from faster_whisper import WhisperModel
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AudioProcessor:
    """Audio processing service using faster-whisper"""
    
    def __init__(self, model_size: str = "medium", device: str = "cpu", compute_type: str = "int8"):
        """
        Initialize the audio processor
        
        Args:
            model_size: Whisper model size (tiny, base, small, medium, large-v1, large-v2, large-v3)
            device: Device to run on (cpu, cuda)
            compute_type: Compute type (int8, int8_float16, float16, float32)
        """
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type
        self.model = None
        
    def _load_model(self):
        """Load the Whisper model if not already loaded"""
        if self.model is None:
            logger.info(f"Loading Whisper model: {self.model_size} on {self.device}")
            self.model = WhisperModel(
                self.model_size, 
                device=self.device, 
                compute_type=self.compute_type
            )
            logger.info("Model loaded successfully")
    
    def _transcribe_with_python_api(self, audio_file_path: str) -> str:
        """
        Transcribe audio using faster-whisper Python API
        
        Args:
            audio_file_path: Path to the audio file
            
        Returns:
            Transcribed text
        """
        try:
            self._load_model()
            
            logger.info(f"Starting transcription of: {audio_file_path}")
            
            # Transcribe the audio file
            segments, info = self.model.transcribe(
                audio_file_path,
                beam_size=5,
                language="ru",  # Set to Russian as default, can be auto-detected
                vad_filter=True,  # Enable voice activity detection
                vad_parameters={
                    "threshold": 0.5,
                    "min_speech_duration_ms": 250,
                    "min_silence_duration_ms": 2000
                }
            )
            
            # Convert segments to text with timestamps
            transcript_parts = []
            transcript_parts.append(f"СТЕНОГРАММА ВСТРЕЧИ")
            transcript_parts.append(f"Язык: {info.language} (вероятность: {info.language_probability:.2%})")
            transcript_parts.append(f"Длительность: {info.duration:.2f}с")
            transcript_parts.append("")
            
            for segment in segments:
                start_time = segment.start
                end_time = segment.end
                text = segment.text.strip()
                
                if text:  # Only add non-empty segments
                    # Format time as MM:SS
                    start_formatted = f"{int(start_time // 60):02d}:{int(start_time % 60):02d}"
                    end_formatted = f"{int(end_time // 60):02d}:{int(end_time % 60):02d}"
                    
                    transcript_parts.append(f"[{start_formatted} - {end_formatted}] {text}")
            
            transcript = "\n".join(transcript_parts)
            logger.info(f"Transcription completed. Generated {len(transcript)} characters")
            
            return transcript
            
        except Exception as e:
            logger.error(f"Error during transcription: {str(e)}")
            raise Exception(f"Transcription failed: {str(e)}")
    
    def _transcribe_with_command_line(self, audio_file_path: str) -> str:
        """
        Transcribe audio using faster-whisper command line interface
        
        Args:
            audio_file_path: Path to the audio file
            
        Returns:
            Transcribed text
        """
        try:
            # Create a temporary file for the output
            with tempfile.NamedTemporaryFile(mode='w+', suffix='.txt', delete=False) as temp_file:
                output_file = temp_file.name
            
            # Build the command
            cmd = [
                "python", "-m", "faster_whisper.transcribe",
                "--device", self.device,
                "--model", self.model_size,
                "--output", output_file,
                audio_file_path
            ]
            
            logger.info(f"Running command: {' '.join(cmd)}")
            
            # Run the command
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                check=True
            )
            
            # Read the output file
            with open(output_file, 'r', encoding='utf-8') as f:
                transcript = f.read()
            
            # Clean up temporary file
            os.unlink(output_file)
            
            logger.info(f"Command line transcription completed. Generated {len(transcript)} characters")
            return transcript
            
        except subprocess.CalledProcessError as e:
            logger.error(f"Command failed with return code {e.returncode}")
            logger.error(f"stderr: {e.stderr}")
            raise Exception(f"Command line transcription failed: {e.stderr}")
        except Exception as e:
            logger.error(f"Error during command line transcription: {str(e)}")
            raise Exception(f"Command line transcription failed: {str(e)}")
    
    def _save_transcript_to_file(self, transcript: str, audio_file_path: str) -> str:
        """
        Save transcript to a text file
        
        Args:
            transcript: The transcribed text
            audio_file_path: Original audio file path (used to generate output filename)
            
        Returns:
            Path to the saved transcript file
        """
        try:
            # Generate output filename based on audio file
            base_name = os.path.splitext(os.path.basename(audio_file_path))[0]
            output_dir = os.path.dirname(audio_file_path)
            transcript_file = os.path.join(output_dir, f"{base_name}_transcript.txt")
            
            # Save transcript to file
            with open(transcript_file, 'w', encoding='utf-8') as f:
                f.write(transcript)
            
            logger.info(f"Transcript saved to: {transcript_file}")
            return transcript_file
            
        except Exception as e:
            logger.error(f"Error saving transcript to file: {str(e)}")
            raise Exception(f"Failed to save transcript: {str(e)}")
    
    async def process_audio(
        self,
        audio_file_path: str,
        participants: list,
        prompt: str,
        use_command_line: bool = False,
        save_to_file: bool = True
    ) -> str:
        """
        Process audio file and return transcript
        
        Args:
            audio_file_path: Path to the audio file
            participants: List of meeting participants
            prompt: Processing prompt/instructions
            use_command_line: Whether to use command line interface (as requested by user)
            save_to_file: Whether to save transcript to a text file
            
        Returns:
            Transcript text from the audio
        """
        try:
            logger.info(f"Processing audio file: {audio_file_path}")
            logger.info(f"Participants: {[p.get('name', 'Unknown') for p in participants]}")
            logger.info(f"Prompt: {prompt}")
            
            # Check if audio file exists
            if not os.path.exists(audio_file_path):
                raise FileNotFoundError(f"Audio file not found: {audio_file_path}")
            
            # Transcribe using either Python API or command line
            if use_command_line:
                logger.info("Using command line transcription (as requested)")
                transcript = self._transcribe_with_command_line(audio_file_path)
            else:
                logger.info("Using Python API transcription")
                transcript = self._transcribe_with_python_api(audio_file_path)
            
            # Add participant information to transcript
            if participants:
                participant_names = [p.get('name', 'Unknown') for p in participants]
                participant_section = f"\nУчастники: {', '.join(participant_names)}\n"
                transcript = transcript.replace("СТЕНОГРАММА ВСТРЕЧИ", f"СТЕНОГРАММА ВСТРЕЧИ{participant_section}")
            
            # Save transcript to file if requested
            if save_to_file:
                transcript_file_path = self._save_transcript_to_file(transcript, audio_file_path)
                logger.info(f"Transcript saved to: {transcript_file_path}")
            
            logger.info("Audio processing completed successfully")
            return transcript
            
        except Exception as e:
            logger.error(f"Error processing audio: {str(e)}")
            raise Exception(f"Audio processing failed: {str(e)}")
    
    async def process_audio_with_diarization(
        self,
        audio_file_path: str,
        participants: list,
        prompt: str,
        use_command_line: bool = False,
        save_to_file: bool = True,
        enable_diarization: bool = False,
        min_speakers: int = None,
        max_speakers: int = None
    ) -> Dict:
        """
        Process audio file with optional diarization
        
        Args:
            audio_file_path: Path to the audio file
            participants: List of meeting participants
            prompt: Processing prompt/instructions
            use_command_line: Whether to use command line interface
            save_to_file: Whether to save transcript to a text file
            enable_diarization: Whether to perform speaker diarization
            min_speakers: Minimum number of speakers for diarization
            max_speakers: Maximum number of speakers for diarization
            
        Returns:
            Dictionary containing transcript and optional diarization results
        """
        try:
            logger.info(f"Processing audio file with diarization: {audio_file_path}")
            logger.info(f"Enable diarization: {enable_diarization}")
            
            # First, get the transcript
            transcript = await self.process_audio(
                audio_file_path=audio_file_path,
                participants=participants,
                prompt=prompt,
                use_command_line=use_command_line,
                save_to_file=save_to_file
            )
            
            result = {
                "transcript": transcript,
                "diarization": None,
                "aligned_transcript": None
            }
            
            # If diarization is enabled, perform it
            if enable_diarization:
                try:
                    from services.audio_diarization import AudioDiarization
                    
                    # Get Hugging Face token from environment
                    hf_token = os.getenv('HUGGINGFACE_HUB_TOKEN')
                    
                    # Initialize diarization service
                    diarizer = AudioDiarization(
                        device=self.device,
                        use_auth_token=hf_token
                    )
                    
                    # Perform diarization
                    logger.info("Starting diarization...")
                    diarization_result = await diarizer.diarize_audio(
                        audio_file_path=audio_file_path,
                        min_speakers=min_speakers,
                        max_speakers=max_speakers
                    )
                    
                    if diarization_result["success"]:
                        result["diarization"] = diarization_result
                        
                        # Parse transcript segments for alignment
                        transcript_segments = self._parse_transcript_segments(transcript)
                        
                        # Align transcription with diarization
                        aligned_segments = diarizer._align_transcription_with_diarization(
                            transcript_segments,
                            diarization_result["segments"]
                        )
                        
                        result["aligned_transcript"] = aligned_segments
                        
                        logger.info(f"Diarization completed successfully. Found {diarization_result['statistics']['speaker_count']} speakers")
                    else:
                        logger.warning(f"Diarization failed: {diarization_result.get('error', 'Unknown error')}")
                        
                except Exception as e:
                    logger.error(f"Error during diarization: {str(e)}")
                    # Continue without diarization if it fails
                    result["diarization_error"] = str(e)
            
            return result
            
        except Exception as e:
            logger.error(f"Error processing audio with diarization: {str(e)}")
            raise Exception(f"Audio processing with diarization failed: {str(e)}")
    
    def _parse_transcript_segments(self, transcript: str) -> List[Dict]:
        """
        Parse transcript text into segments with timestamps
        
        Args:
            transcript: Transcript text with timestamps
            
        Returns:
            List of transcript segments with start/end times and text
        """
        segments = []
        lines = transcript.split('\n')
        
        for line in lines:
            line = line.strip()
            # Look for lines with timestamp format [MM:SS - MM:SS]
            if '[' in line and ']' in line and ' - ' in line:
                try:
                    # Extract timestamp part
                    start_bracket = line.find('[')
                    end_bracket = line.find(']')
                    timestamp_part = line[start_bracket + 1:end_bracket]
                    
                    # Extract text part
                    text_part = line[end_bracket + 1:].strip()
                    
                    # Parse timestamps
                    start_time_str, end_time_str = timestamp_part.split(' - ')
                    start_minutes, start_seconds = map(int, start_time_str.split(':'))
                    end_minutes, end_seconds = map(int, end_time_str.split(':'))
                    
                    start_time = start_minutes * 60 + start_seconds
                    end_time = end_minutes * 60 + end_seconds
                    
                    segments.append({
                        "start": start_time,
                        "end": end_time,
                        "text": text_part
                    })
                    
                except Exception as e:
                    logger.warning(f"Failed to parse transcript line: {line}. Error: {str(e)}")
                    continue
        
        return segments
    
    def _create_clean_transcript(self, aligned_segments: List[Dict]) -> str:
        """
        Create clean transcript with timestamps and speakers in the required format
        
        Args:
            aligned_segments: List of aligned segments with speaker and text information
            
        Returns:
            Clean transcript string in the required format
        """
        if not aligned_segments:
            return ""
        
        transcript_lines = []
        
        for i, segment in enumerate(aligned_segments, 1):
            start_time = segment.get("start", 0)
            end_time = segment.get("end", 0)
            speaker = segment.get("speaker", "UNKNOWN")
            text = segment.get("text", "").strip()
            
            if text:  # Only add non-empty segments
                # Format time as MM:SS
                start_formatted = f"{int(start_time // 60):02d}:{int(start_time % 60):02d}"
                end_formatted = f"{int(end_time // 60):02d}:{int(end_time % 60):02d}"
                
                transcript_lines.append(
                    f"{i:2d}. [{start_formatted} - {end_formatted}] {speaker}: {text}"
                )
        
        return "\n".join(transcript_lines)
    
    def _save_clean_transcript(self, clean_transcript: str, audio_file_path: str) -> str:
        """
        Save clean transcript to a text file
        
        Args:
            clean_transcript: Clean transcript text
            audio_file_path: Original audio file path (used to generate output filename)
            
        Returns:
            Path to the saved clean transcript file
        """
        try:
            # Generate output filename based on audio file
            base_name = os.path.splitext(os.path.basename(audio_file_path))[0]
            output_dir = os.path.dirname(audio_file_path)
            clean_transcript_file = os.path.join(output_dir, f"{base_name}_clean_transcript.txt")
            
            # Save clean transcript to file
            with open(clean_transcript_file, 'w', encoding='utf-8') as f:
                f.write(clean_transcript)
            
            logger.info(f"Clean transcript saved to: {clean_transcript_file}")
            return clean_transcript_file
            
        except Exception as e:
            logger.error(f"Error saving clean transcript to file: {str(e)}")
            raise Exception(f"Failed to save clean transcript: {str(e)}")

    async def process_audio_for_protocol(
        self,
        audio_file_path: str,
        participants: list,
        prompt: str,
        use_command_line: bool = False,
        save_to_file: bool = True,
        min_speakers: int = None,
        max_speakers: int = None
    ) -> Dict:
        """
        Process audio file for protocol generation with clean transcript output
        
        Args:
            audio_file_path: Path to the audio file
            participants: List of meeting participants
            prompt: Processing prompt/instructions
            use_command_line: Whether to use command line interface
            save_to_file: Whether to save transcript to a text file
            min_speakers: Minimum number of speakers for diarization
            max_speakers: Maximum number of speakers for diarization
            
        Returns:
            Dictionary containing clean transcript and metadata
        """
        try:
            logger.info(f"Processing audio file for protocol: {audio_file_path}")
            logger.info(f"Participants: {[p.get('name', 'Unknown') for p in participants]}")
            logger.info(f"Prompt: {prompt}")
            
            # Check if audio file exists
            if not os.path.exists(audio_file_path):
                raise FileNotFoundError(f"Audio file not found: {audio_file_path}")
            
            # Process audio with diarization
            result = await self.process_audio_with_diarization(
                audio_file_path=audio_file_path,
                participants=participants,
                prompt=prompt,
                use_command_line=use_command_line,
                save_to_file=False,  # We'll save the clean version
                enable_diarization=True,
                min_speakers=min_speakers,
                max_speakers=max_speakers
            )
            
            # Extract aligned transcript
            aligned_transcript = result.get("aligned_transcript", [])
            
            if not aligned_transcript:
                logger.warning("No aligned transcript available, falling back to regular transcript")
                # Fallback to regular transcript if diarization failed
                transcript = result.get("transcript", "")
                # Create a simple aligned transcript from regular transcript
                transcript_segments = self._parse_transcript_segments(transcript)
                aligned_transcript = [
                    {
                        "start": seg.get("start", 0),
                        "end": seg.get("end", 0),
                        "text": seg.get("text", ""),
                        "speaker": "UNKNOWN"
                    }
                    for seg in transcript_segments
                ]
            
            # Create clean transcript
            clean_transcript = self._create_clean_transcript(aligned_transcript)
            
            # Save clean transcript if requested
            clean_transcript_file = None
            if save_to_file and clean_transcript:
                clean_transcript_file = self._save_clean_transcript(clean_transcript, audio_file_path)
            
            # Prepare result
            protocol_result = {
                "success": True,
                "clean_transcript": clean_transcript,
                "clean_transcript_file": clean_transcript_file,
                "original_transcript": result.get("transcript", ""),
                "diarization": result.get("diarization"),
                "aligned_segments": aligned_transcript,
                "participants": participants,
                "audio_file": audio_file_path
            }
            
            logger.info("Audio processing for protocol completed successfully")
            return protocol_result
            
        except Exception as e:
            logger.error(f"Error processing audio for protocol: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "clean_transcript": "",
                "clean_transcript_file": None,
                "audio_file": audio_file_path
            }

    @staticmethod
    async def process_audio_static(
        audio_file_path: str,
        participants: list,
        prompt: str,
        use_command_line: bool = False,
        save_to_file: bool = True
    ) -> str:
        """
        Static method for backward compatibility
        
        Args:
            audio_file_path: Path to the audio file
            participants: List of meeting participants
            prompt: Processing prompt/instructions
            use_command_line: Whether to use command line interface
            save_to_file: Whether to save transcript to a text file
            
        Returns:
            Transcript text from the audio
        """
        processor = AudioProcessor()
        return await processor.process_audio(
            audio_file_path=audio_file_path,
            participants=participants,
            prompt=prompt,
            use_command_line=use_command_line,
            save_to_file=save_to_file
        )
