#!/usr/bin/env python3
"""
Demo script showing the new clean transcript format
This demonstrates how the clean transcript will look with existing data
"""

def create_demo_clean_transcript():
    """Create a demo clean transcript using existing data"""
    
    # Simulate aligned segments based on our previous test results
    aligned_segments = [
        {"start": 7, "end": 8, "speaker": "SPEAKER_00", "text": "Привет."},
        {"start": 8, "end": 17, "speaker": "SPEAKER_00", "text": "Что у нас сегодня на повеске скажи, пожалуйста, что у нас там по поводу нашего собрания?"},
        {"start": 17, "end": 35, "speaker": "SPEAKER_01", "text": "Привет."},
        {"start": 35, "end": 37, "speaker": "SPEAKER_02", "text": "Что у нас сегодня на повеске?"},
        {"start": 37, "end": 40, "speaker": "SPEAKER_02", "text": "Скажи, пожалуйста, что у нас там по поводу?"},
        {"start": 40, "end": 49, "speaker": "SPEAKER_02", "text": "Привет."},
        {"start": 49, "end": 52, "speaker": "SPEAKER_03", "text": "Сегодня будут работать над вот этой фразой."},
        {"start": 52, "end": 57, "speaker": "SPEAKER_03", "text": "Слушай внимательно, она важна, чтобы начать разговор и уточнить план действий."},
        {"start": 57, "end": 59, "speaker": "SPEAKER_03", "text": "Повторяй за мной."},
        {"start": 59, "end": 60, "speaker": "SPEAKER_03", "text": "Привет."},
        {"start": 60, "end": 62, "speaker": "SPEAKER_03", "text": "Что у нас сегодня на повеске?"},
        {"start": 62, "end": 65, "speaker": "SPEAKER_03", "text": "Скажи, пожалуйста, что у нас там по поводу?"}
    ]
    
    # Create clean transcript in the required format
    transcript_lines = []
    
    for i, segment in enumerate(aligned_segments, 1):
        start_time = segment["start"]
        end_time = segment["end"]
        speaker = segment["speaker"]
        text = segment["text"]
        
        # Format time as MM:SS
        start_formatted = f"{int(start_time // 60):02d}:{int(start_time % 60):02d}"
        end_formatted = f"{int(end_time // 60):02d}:{int(end_time % 60):02d}"
        
        transcript_lines.append(
            f"{i:2d}. [{start_formatted} - {end_formatted}] {speaker}: {text}"
        )
    
    clean_transcript = "\n".join(transcript_lines)
    
    return clean_transcript, aligned_segments

def main():
    print("DEMO: Clean Transcript Format")
    print("=" * 50)
    
    # Generate demo clean transcript
    clean_transcript, segments = create_demo_clean_transcript()
    
    print("This is how the clean transcript will look:")
    print("-" * 50)
    print(clean_transcript)
    print("-" * 50)
    
    # Save to file
    output_file = "demo_clean_transcript.txt"
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(clean_transcript)
    
    print(f"\nDemo clean transcript saved to: {output_file}")
    print(f"Total segments: {len(segments)}")
    print(f"Characters: {len(clean_transcript)}")
    
    # Show speaker statistics
    speakers = set(seg["speaker"] for seg in segments)
    print(f"Speakers: {', '.join(sorted(speakers))}")
    
    print(f"\n✅ Demo completed successfully!")
    print(f"\nThis format will be:")
    print(f"1. Generated automatically from audio files")
    print(f"2. Saved to text files")
    print(f"3. Sent to LLM for protocol generation")
    print(f"4. Used in the API response")

if __name__ == "__main__":
    main()
