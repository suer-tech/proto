"""
AssemblyAI transcription service using direct HTTP API
"""
import os
import requests
import time
from typing import Dict, Optional
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _get_duration_from_file_mutagen(file_path: str) -> int:
    """Get audio duration using mutagen library (lightweight, no ffmpeg needed)"""
    try:
        from mutagen import File as MutagenFile
        audio_file = MutagenFile(file_path)
        if audio_file is not None:
            duration_sec = audio_file.info.length if hasattr(audio_file, 'info') and hasattr(audio_file.info, 'length') else 0
            if duration_sec and duration_sec > 0:
                return int(duration_sec * 1000)  # Convert to milliseconds
    except ImportError:
        pass
    except Exception as e:
        logger.warning(f"mutagen failed to get duration: {str(e)}")
    return 0


def _get_duration_from_file_pydub(file_path: str) -> int:
    """Get audio duration using pydub library"""
    try:
        from pydub import AudioSegment
        audio = AudioSegment.from_file(file_path)
        return len(audio)  # pydub returns duration in milliseconds
    except ImportError:
        pass
    except Exception as e:
        logger.warning(f"pydub failed to get duration: {str(e)}")
    return 0


class AssemblyAIService:
    """Service for transcribing audio using AssemblyAI HTTP API"""
    
    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize AssemblyAI service
        
        Args:
            api_key: AssemblyAI API key (defaults to env variable ASSEMBLYAI_API_KEY)
        """
        self.api_key = api_key or os.getenv("ASSEMBLYAI_API_KEY", "24527f87c104468492a57baa67fecc50")
        self.base_url = "https://api.assemblyai.com"
        self.headers = {
            "authorization": self.api_key
        }
        logger.info("AssemblyAI service initialized with HTTP API")
    
    def _upload_file(self, audio_file_path: str) -> str:
        """
        Upload local audio file to AssemblyAI and get upload URL
        
        Args:
            audio_file_path: Path to local audio file
            
        Returns:
            Upload URL from AssemblyAI
        """
        try:
            logger.info(f"Uploading file to AssemblyAI: {audio_file_path}")
            
            with open(audio_file_path, "rb") as f:
                response = requests.post(
                    self.base_url + "/v2/upload",
                    headers=self.headers,
                    data=f
                )
                response.raise_for_status()
                
                upload_result = response.json()
                logger.info(f"Upload response from AssemblyAI: {upload_result}")
                upload_url = upload_result["upload_url"]
                logger.info(f"File uploaded successfully, upload URL: {upload_url}")
                return upload_url
            
        except Exception as e:
            logger.error(f"Error uploading file: {str(e)}")
            raise Exception(f"Failed to upload file to AssemblyAI: {str(e)}")
    
    def _submit_transcription(self, audio_url: str, enable_speaker_labels: bool = True) -> str:
        """
        Submit transcription job to AssemblyAI
        
        Args:
            audio_url: URL of audio file (uploaded URL or external URL)
            enable_speaker_labels: Enable speaker diarization (speaker separation)
            
        Returns:
            Transcript ID
        """
        try:
            data = {
                "audio_url": audio_url,
                "speech_model": "universal",
                "speaker_labels": enable_speaker_labels,
                "language_detection": True
            }
            
            url = self.base_url + "/v2/transcript"
            response = requests.post(url, json=data, headers=self.headers)
            response.raise_for_status()
            
            submit_result = response.json()
            logger.info(f"Submit transcription response: {submit_result}")
            transcript_id = submit_result['id']
            logger.info(f"Transcription submitted with speaker_labels={enable_speaker_labels}, transcript ID: {transcript_id}")
            return transcript_id
            
        except Exception as e:
            logger.error(f"Error submitting transcription: {str(e)}")
            raise Exception(f"Failed to submit transcription: {str(e)}")
    
    def _poll_transcription(self, transcript_id: str, max_wait_time: int = 300) -> Dict:
        """
        Poll AssemblyAI API until transcription is complete
        
        Args:
            transcript_id: ID of transcription job
            max_wait_time: Maximum time to wait in seconds (default 5 minutes)
            
        Returns:
            Transcription result dictionary
        """
        polling_endpoint = self.base_url + "/v2/transcript/" + transcript_id
        start_time = time.time()
        
        logger.info(f"Polling transcription status for ID: {transcript_id}")
        
        while True:
            # Check timeout
            elapsed_time = time.time() - start_time
            if elapsed_time > max_wait_time:
                raise Exception(f"Transcription timeout after {max_wait_time} seconds")
            
            try:
                response = requests.get(polling_endpoint, headers=self.headers)
                response.raise_for_status()
                transcription_result = response.json()
                
                status = transcription_result['status']
                logger.info(f"Polling response - Status: {status}, Full response: {transcription_result}")
                
                if status == 'completed':
                    logger.info(f"Transcription completed successfully")
                    logger.info(f"Polling response - Status: {status}, Full response: {transcription_result}")
                    logger.info(f"Transcript text (first 200 chars): {transcription_result.get('text', '')[:200]}...")
                    return transcription_result
                elif status == 'error':
                    error_msg = transcription_result.get('error', 'Unknown error')
                    logger.error(f"Transcription error: {error_msg}, Full response: {transcription_result}")
                    raise RuntimeError(f"Transcription failed: {error_msg}")
                else:
                    # Status is 'queued' or 'processing', wait and retry
                    logger.info(f"Transcription status: {status}, waiting 3 seconds before next poll...")
                    time.sleep(3)
                    
            except requests.RequestException as e:
                logger.error(f"Error polling transcription: {str(e)}")
                raise Exception(f"Failed to poll transcription status: {str(e)}")
    
    def transcribe_file(self, audio_file_path: str, config: Optional[Dict] = None, enable_speaker_labels: bool = True, audio_duration_ms: Optional[int] = None) -> Dict:
        """
        Transcribe audio file using AssemblyAI HTTP API
        
        Args:
            audio_file_path: Path to local audio file or URL
            config: Optional configuration dict (currently not used, kept for compatibility)
            enable_speaker_labels: Enable speaker diarization (speaker separation)
            
        Returns:
            Dictionary with transcript text and metadata
        """
        # Store audio_file_path for later use if needed for duration calculation
        self._current_audio_file_path = audio_file_path
        
        try:
            logger.info(f"Starting transcription of: {audio_file_path} (speaker_labels={enable_speaker_labels})")
            
            # Check if it's a URL or local file
            if audio_file_path.startswith("http://") or audio_file_path.startswith("https://"):
                audio_url = audio_file_path
                logger.info("Using provided URL, skipping upload")
            else:
                # Upload local file
                audio_url = self._upload_file(audio_file_path)
            
            # Submit transcription
            transcript_id = self._submit_transcription(audio_url, enable_speaker_labels=enable_speaker_labels)
            
            # Poll for completion
            transcription_result = self._poll_transcription(transcript_id)
            
            # Extract transcript text
            transcript_text = transcription_result.get('text', '')
            
            # Log all duration-related fields for debugging
            logger.info(f"=== DEBUG: Duration fields in API response ===")
            logger.info(f"audio_duration: {transcription_result.get('audio_duration')}")
            logger.info(f"audio_duration_ms: {transcription_result.get('audio_duration_ms')}")
            logger.info(f"duration: {transcription_result.get('duration')}")
            logger.info(f"All keys in response: {list(transcription_result.keys())}")
            
            # ALWAYS use duration from parameter (same value as in protocol card)
            # This ensures transcript duration matches the card duration exactly
            if audio_duration_ms is not None and audio_duration_ms > 0:
                final_duration_ms = audio_duration_ms
                logger.info(f"✓ RECEIVED duration parameter (same as card): {final_duration_ms} ms ({final_duration_ms/1000:.2f} seconds)")
            else:
                final_duration_ms = 0
                logger.error(f"✗ NO duration parameter received! audio_duration_ms={audio_duration_ms}")
            
            # Update transcription_result with calculated duration for _format_transcript
            # This ensures _format_transcript uses the correct duration
            transcription_result['audio_duration'] = final_duration_ms
            transcription_result['duration'] = final_duration_ms  # Also set 'duration' key for consistency
            
            # Format transcript with metadata
            # Pass final_duration_ms explicitly to _format_transcript to override any API values
            logger.info(f"Calling _format_transcript with explicit_duration_ms={final_duration_ms}")
            formatted_transcript = self._format_transcript(transcript_text, transcription_result, explicit_duration_ms=final_duration_ms)
            logger.info(f"Formatted transcript length: {len(formatted_transcript)}, contains 'Длительность:': {'Длительность:' in formatted_transcript}")
            
            logger.info(f"Transcription completed. Generated {len(transcript_text)} characters")
            
            # Get utterances if speaker labels enabled
            utterances = transcription_result.get('utterances', [])
            if utterances:
                logger.info(f"Found {len(utterances)} utterances from {len(set(u.get('speaker', 'Unknown') for u in utterances))} speakers")
            
            return {
                "success": True,
                "text": transcript_text,
                "formatted_text": formatted_transcript,
                "status": transcription_result.get('status', 'completed'),
                "language": transcription_result.get('language_code'),
                "duration": audio_duration_ms,  # in milliseconds
                "words": transcription_result.get('words', []),
                "sentences": transcription_result.get('sentences', []),
                "utterances": utterances,  # Speaker diarization data
                "transcript_id": transcript_id
            }
            
        except Exception as e:
            logger.error(f"Error during transcription: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "text": "",
                "formatted_text": ""
            }
    
    def _format_transcript(self, text: str, transcription_result: Dict, explicit_duration_ms: Optional[int] = None) -> str:
        """
        Format transcript with metadata and timestamps
        
        Args:
            text: Raw transcript text
            transcription_result: Transcription result dictionary from API
            explicit_duration_ms: Explicit duration in milliseconds (from card) - ALWAYS used if provided
            
        Returns:
            Formatted transcript string
        """
        lines = []
        lines.append("СТЕНОГРАММА ВСТРЕЧИ")
        
        # Add metadata
        current_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        lines.append(f"Дата обработки: {current_date}")
        
        language_code = transcription_result.get('language_code')
        if language_code:
            lines.append(f"Язык: {language_code}")
        
        # Duration is NOT included in transcript - it's shown only in the protocol card
        # No duration line added here
        
        lines.append("")
        
        # Add transcript text with speaker labels if available (utterances)
        utterances = transcription_result.get('utterances', [])
        if utterances:
            logger.info(f"Formatting transcript with {len(utterances)} speaker utterances")
            for utterance in utterances:
                speaker = utterance.get('speaker', 'Unknown')
                utterance_text = utterance.get('text', '').strip()
                start_time = utterance.get('start', 0) / 1000  # Convert ms to seconds
                end_time = utterance.get('end', 0) / 1000
                
                if utterance_text:
                    start_formatted = f"{int(start_time // 60):02d}:{int(start_time % 60):02d}"
                    end_formatted = f"{int(end_time // 60):02d}:{int(end_time % 60):02d}"
                    
                    lines.append(f"[{start_formatted} - {end_formatted}] Спикер {speaker}: {utterance_text}")
        else:
            # Fallback to sentences with timestamps
            sentences = transcription_result.get('sentences', [])
            if sentences:
                logger.info(f"Formatting transcript with {len(sentences)} sentences")
                for sentence in sentences:
                    start_time = sentence.get('start', 0) / 1000  # Convert ms to seconds
                    end_time = sentence.get('end', 0) / 1000
                    sentence_text = sentence.get('text', '').strip()
                    
                    if sentence_text:
                        start_formatted = f"{int(start_time // 60):02d}:{int(start_time % 60):02d}"
                        end_formatted = f"{int(end_time // 60):02d}:{int(end_time % 60):02d}"
                        
                        lines.append(f"[{start_formatted} - {end_formatted}] {sentence_text}")
            else:
                # Fallback to plain text if no timestamps
                lines.append(text)
        
        return "\n".join(lines)
    
    def save_transcript(self, transcript_text: str, output_path: str) -> str:
        """
        Save transcript to file
        
        Args:
            transcript_text: Transcript text to save
            output_path: Path where to save the transcript
            
        Returns:
            Path to saved file
        """
        try:
            os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else ".", exist_ok=True)
            
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(transcript_text)
            
            logger.info(f"Transcript saved to: {output_path}")
            return output_path
        except Exception as e:
            logger.error(f"Error saving transcript: {str(e)}")
            raise Exception(f"Failed to save transcript: {str(e)}")
