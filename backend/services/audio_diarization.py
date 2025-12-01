"""
Audio diarization service using pyannote.audio
This module provides speaker diarization functionality to identify and separate speakers in audio files
"""

import asyncio
import os
import logging
from typing import Dict, List, Tuple, Optional

# Apply torchaudio compatibility patch
import sys
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
import torchaudio_patch

# Import pyannote.audio
from pyannote.audio import Pipeline
from pyannote.core import Segment
import torch

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AudioDiarization:
    """Audio diarization service using pyannote.audio"""
    
    def __init__(self, 
                 model_name: str = "pyannote/speaker-diarization-3.1",
                 device: str = "cpu",
                 use_auth_token: Optional[str] = None):
        """
        Initialize the diarization service
        
        Args:
            model_name: Name of the diarization model
            device: Device to run on (cpu, cuda)
            use_auth_token: Hugging Face authentication token (optional)
        """
        self.model_name = "pyannote/speaker-diarization"
        self.device = device
        self.use_auth_token = use_auth_token
        self.pipeline = None
        
    def _load_pipeline(self):
        """Load the diarization pipeline if not already loaded"""
        if self.pipeline is None:
            try:
                logger.info(f"Loading diarization pipeline: {self.model_name}")
                
                # Load the pipeline
                if self.use_auth_token:
                    self.pipeline = Pipeline.from_pretrained(
                        self.model_name,
                        use_auth_token=self.use_auth_token
                    )
                else:
                    self.pipeline = Pipeline.from_pretrained(self.model_name)
                
                # Move to device
                if self.device == "cuda" and torch.cuda.is_available():
                    self.pipeline = self.pipeline.to(torch.device("cuda"))
                    logger.info("Pipeline loaded on CUDA")
                else:
                    logger.info("Pipeline loaded on CPU")
                    
                logger.info("Diarization pipeline loaded successfully")
                
            except Exception as e:
                logger.error(f"Error loading diarization pipeline: {str(e)}")
                raise Exception(f"Failed to load diarization pipeline: {str(e)}")
    
    def _format_speaker_segments(self, diarization_result) -> List[Dict]:
        """
        Format diarization result into a structured format
        
        Args:
            diarization_result: Result from pyannote diarization or mock result
            
        Returns:
            List of speaker segments with timestamps and speaker IDs
        """
        segments = []
        
        # Format pyannote result
        for turn, _, speaker in diarization_result.itertracks(yield_label=True):
            segment = {
                "speaker": speaker,
                "start": round(turn.start, 2),
                "end": round(turn.end, 2),
                "duration": round(turn.end - turn.start, 2)
            }
            segments.append(segment)
        
        return segments
    
    def _get_speaker_statistics(self, segments: List[Dict]) -> Dict:
        """
        Calculate speaker statistics
        
        Args:
            segments: List of speaker segments
            
        Returns:
            Dictionary with speaker statistics
        """
        if not segments:
            return {}
        
        # Count unique speakers
        speakers = set(segment["speaker"] for segment in segments)
        speaker_count = len(speakers)
        
        # Calculate total speaking time per speaker
        speaker_times = {}
        for segment in segments:
            speaker = segment["speaker"]
            duration = segment["duration"]
            speaker_times[speaker] = speaker_times.get(speaker, 0) + duration
        
        # Calculate total duration
        total_duration = sum(segment["duration"] for segment in segments)
        
        # Find most active speaker
        most_active_speaker = max(speaker_times.items(), key=lambda x: x[1]) if speaker_times else None
        
        return {
            "speaker_count": speaker_count,
            "speakers": list(speakers),
            "speaker_times": speaker_times,
            "total_duration": round(total_duration, 2),
            "most_active_speaker": most_active_speaker[0] if most_active_speaker else None,
            "most_active_speaker_time": round(most_active_speaker[1], 2) if most_active_speaker else 0
        }
    
    async def diarize_audio(self, 
                           audio_file_path: str,
                           min_speakers: Optional[int] = None,
                           max_speakers: Optional[int] = None) -> Dict:
        """
        Perform speaker diarization on audio file
        
        Args:
            audio_file_path: Path to the audio file
            min_speakers: Minimum number of speakers (optional)
            max_speakers: Maximum number of speakers (optional)
            
        Returns:
            Dictionary containing diarization results
        """
        try:
            logger.info(f"Starting diarization of: {audio_file_path}")
            
            # Check if audio file exists
            if not os.path.exists(audio_file_path):
                raise FileNotFoundError(f"Audio file not found: {audio_file_path}")
            
            # Load pipeline
            self._load_pipeline()
            
            # Prepare diarization parameters
            diarization_params = {}
            if min_speakers is not None:
                diarization_params["min_speakers"] = min_speakers
            if max_speakers is not None:
                diarization_params["max_speakers"] = max_speakers
            
            # Perform diarization
            logger.info("Running diarization...")
            diarization_result = self.pipeline(audio_file_path, **diarization_params)
            
            # Format results
            segments = self._format_speaker_segments(diarization_result)
            statistics = self._get_speaker_statistics(segments)
            
            # Create result
            result = {
                "success": True,
                "audio_file": audio_file_path,
                "segments": segments,
                "statistics": statistics,
                "total_segments": len(segments)
            }
            
            logger.info(f"Diarization completed. Found {statistics.get('speaker_count', 0)} speakers")
            logger.info(f"Total segments: {len(segments)}")
            
            return result
            
        except Exception as e:
            logger.error(f"Error during diarization: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "audio_file": audio_file_path
            }
    
    async def diarize_with_transcription(self, 
                                       audio_file_path: str,
                                       transcription_segments: List[Dict],
                                       min_speakers: Optional[int] = None,
                                       max_speakers: Optional[int] = None) -> Dict:
        """
        Perform diarization and align with transcription segments
        
        Args:
            audio_file_path: Path to the audio file
            transcription_segments: List of transcription segments with timestamps
            min_speakers: Minimum number of speakers (optional)
            max_speakers: Maximum number of speakers (optional)
            
        Returns:
            Dictionary containing aligned diarization and transcription results
        """
        try:
            # Perform diarization
            diarization_result = await self.diarize_audio(
                audio_file_path, min_speakers, max_speakers
            )
            
            if not diarization_result["success"]:
                return diarization_result
            
            # Align transcription with diarization
            aligned_segments = self._align_transcription_with_diarization(
                transcription_segments, 
                diarization_result["segments"]
            )
            
            # Update result with aligned segments
            diarization_result["aligned_segments"] = aligned_segments
            
            return diarization_result
            
        except Exception as e:
            logger.error(f"Error during diarization with transcription: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "audio_file": audio_file_path
            }
    
    def _align_transcription_with_diarization(self, 
                                            transcription_segments: List[Dict],
                                            diarization_segments: List[Dict]) -> List[Dict]:
        """
        Align transcription segments with diarization segments
        
        Args:
            transcription_segments: List of transcription segments
            diarization_segments: List of diarization segments
            
        Returns:
            List of aligned segments with both text and speaker information
        """
        aligned_segments = []
        
        for trans_segment in transcription_segments:
            trans_start = trans_segment.get("start", 0)
            trans_end = trans_segment.get("end", 0)
            text = trans_segment.get("text", "")
            
            # Find overlapping diarization segments
            overlapping_speakers = []
            for diar_segment in diarization_segments:
                diar_start = diar_segment["start"]
                diar_end = diar_segment["end"]
                speaker = diar_segment["speaker"]
                
                # Check for overlap
                if (trans_start < diar_end and trans_end > diar_start):
                    overlap_start = max(trans_start, diar_start)
                    overlap_end = min(trans_end, diar_end)
                    overlap_duration = overlap_end - overlap_start
                    
                    overlapping_speakers.append({
                        "speaker": speaker,
                        "overlap_duration": overlap_duration,
                        "overlap_start": overlap_start,
                        "overlap_end": overlap_end
                    })
            
            # Determine the most likely speaker (longest overlap)
            if overlapping_speakers:
                most_likely_speaker = max(overlapping_speakers, key=lambda x: x["overlap_duration"])
                speaker = most_likely_speaker["speaker"]
            else:
                speaker = "UNKNOWN"
            
            # Create aligned segment
            aligned_segment = {
                "start": trans_start,
                "end": trans_end,
                "duration": trans_end - trans_start,
                "text": text,
                "speaker": speaker,
                "speaker_confidence": most_likely_speaker["overlap_duration"] / (trans_end - trans_start) if overlapping_speakers else 0
            }
            
            aligned_segments.append(aligned_segment)
        
        return aligned_segments
    
    def save_diarization_result(self, 
                               result: Dict, 
                               output_file: str) -> str:
        """
        Save diarization result to a text file
        
        Args:
            result: Diarization result dictionary
            output_file: Path to output file
            
        Returns:
            Path to saved file
        """
        try:
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write("ДИАРИЗАЦИЯ АУДИО\n")
                f.write("=" * 50 + "\n\n")
                
                if result["success"]:
                    stats = result["statistics"]
                    f.write(f"Файл: {result['audio_file']}\n")
                    f.write(f"Количество спикеров: {stats.get('speaker_count', 0)}\n")
                    f.write(f"Спикеры: {', '.join(stats.get('speakers', []))}\n")
                    f.write(f"Общая длительность: {stats.get('total_duration', 0)}с\n")
                    f.write(f"Самый активный спикер: {stats.get('most_active_speaker', 'N/A')} ({stats.get('most_active_speaker_time', 0)}с)\n\n")
                    
                    f.write("СЕГМЕНТЫ ПО СПИКЕРАМ:\n")
                    f.write("-" * 30 + "\n")
                    
                    for i, segment in enumerate(result["segments"], 1):
                        start_time = f"{int(segment['start'] // 60):02d}:{int(segment['start'] % 60):02d}"
                        end_time = f"{int(segment['end'] // 60):02d}:{int(segment['end'] % 60):02d}"
                        f.write(f"{i:3d}. [{start_time} - {end_time}] {segment['speaker']} ({segment['duration']:.1f}с)\n")
                    
                    # Add aligned segments if available
                    if "aligned_segments" in result:
                        f.write("\n\nТРАНСКРИПЦИЯ С ДИАРИЗАЦИЕЙ:\n")
                        f.write("-" * 30 + "\n")
                        
                        for i, segment in enumerate(result["aligned_segments"], 1):
                            start_time = f"{int(segment['start'] // 60):02d}:{int(segment['start'] % 60):02d}"
                            end_time = f"{int(segment['end'] // 60):02d}:{int(segment['end'] % 60):02d}"
                            f.write(f"{i:3d}. [{start_time} - {end_time}] {segment['speaker']}: {segment['text']}\n")
                else:
                    f.write(f"Ошибка: {result['error']}\n")
            
            logger.info(f"Diarization result saved to: {output_file}")
            return output_file
            
        except Exception as e:
            logger.error(f"Error saving diarization result: {str(e)}")
            raise Exception(f"Failed to save diarization result: {str(e)}")
    
    @staticmethod
    async def diarize_audio_static(audio_file_path: str, **kwargs) -> Dict:
        """
        Static method for backward compatibility
        
        Args:
            audio_file_path: Path to the audio file
            **kwargs: Additional arguments for diarization
            
        Returns:
            Diarization result dictionary
        """
        diarizer = AudioDiarization()
        return await diarizer.diarize_audio(audio_file_path, **kwargs)
