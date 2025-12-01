# Protocol Maker Backend

This is the FastAPI backend for the Protocol Maker application.

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Run the server:
```bash
python main.py
```

The server will start on `http://localhost:3001`

## API Endpoints

### Protocol Types
- `GET /api/protocol-types` - Get all available protocol types
- `GET /api/protocol-types/{protocol_id}` - Get specific protocol type

### Protocol Processing
- `POST /api/protocols/submit` - Submit protocol for processing
- `GET /api/protocols/{protocol_id}/status` - Get processing status
- `GET /api/protocols` - Get list of protocols
- `DELETE /api/protocols/{protocol_id}` - Delete protocol
- `GET /api/protocols/{protocol_id}/download` - Download processed protocol

## Protocol Types

The system supports 6 protocol types:
1. `standard-meeting` - Протокол совещания
2. `board-meeting` - Протокол заседания совета директоров  
3. `general-assembly` - Протокол общего собрания
4. `technical-meeting` - Протокол технического совещания
5. `audit-meeting` - Протокол аудиторского совещания
6. `hr-meeting` - Протокол HR совещания

Each protocol type has an associated `external_service_id` that will be used for external API calls.

## File Structure

```
backend/
├── main.py                 # FastAPI application
├── models.py              # Pydantic models
├── requirements.txt       # Python dependencies
├── data/
│   └── protocol_types.json # Protocol type configurations
└── uploads/               # Directory for uploaded audio files
```

## Development

The backend is configured to accept CORS requests from the frontend running on `http://localhost:5173` or `http://localhost:3000`.
