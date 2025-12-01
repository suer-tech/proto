import json
import os
import uuid
from typing import Dict
from datetime import datetime
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import aiofiles
from models import ProtocolTypeInfo, ProtocolResponse, ProtocolStatus, Participant
from dotenv import load_dotenv

load_dotenv()

# Initialize FastAPI app
app = FastAPI(
    title="Protocol Maker API (Mock)",
    description="Backend API for Protocol Maker application (Mock Version)",
    version="1.0.0-MOCK"
)

# Add CORS middleware
cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load protocol types from JSON file
def load_protocol_types() -> Dict[str, ProtocolTypeInfo]:
    """Load protocol types from JSON file"""
    try:
        with open("data/protocol_types.json", "r", encoding="utf-8") as f:
            data = json.load(f)
        return {k: ProtocolTypeInfo(**v) for k, v in data.items()}
    except FileNotFoundError:
        return {
            "standard-meeting": ProtocolTypeInfo(
                id="standard-meeting",
                name="Протокол совещания",
                description="Стандартный протокол совещания",
                external_service_id="",
                assistant_id=""
            )
        }

# Global variable to store protocol types
protocol_types = load_protocol_types()

@app.get("/")
async def root():
    """Root endpoint"""
    return {"message": "Protocol Maker API (Mock)", "version": "1.0.0-MOCK", "mode": "mock"}

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
    saveTranscript: bool = Form(True)
):
    """
    Submit protocol for processing (MOCK - returns sample data)
    """
    try:
        # Validate protocol type
        if protocolType not in protocol_types:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid protocol type: {protocolType}"
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
        
        # Generate unique protocol ID
        protocol_id = str(uuid.uuid4())
        
        # Get protocol type info
        protocol_type_info = protocol_types[protocolType]
        
        # MOCK DATA - Sample protocol
        current_date = datetime.now().strftime("%Y-%m-%d")
        
        mock_content = f"""
# ПРОТОКОЛ СОВЕЩАНИЯ

**Дата проведения:** {current_date}

**Тип протокола:** {protocol_type_info.name}

**Участники:**
{chr(10).join([f"- {p.name} ({p.role or 'Участник'})" for p in participants_list])}

---

## ПОВЕСТКА ДНЯ

### 1. Обсуждение текущих проектов
Рассмотрены текущие проекты и их статус. Участники предоставили обновления по ключевым инициативам.

### 2. Планирование следующих этапов
Определены следующие этапы развития проекта и сроки их реализации.

### 3. Разное
Обсуждены дополнительные вопросы, возникшие в ходе работы.

---

## ПРИНЯТЫЕ РЕШЕНИЯ

1. Продолжить работу над текущими проектами в установленные сроки
2. Организовать следующее совещание через две недели
3. Распределить дополнительные задачи между участниками

---

## ИТОГИ

Совещание прошло продуктивно. Все участники были проинформированы о текущем статусе проектов. Следующее совещание запланировано на {current_date}.

---

**Подготовлено:** Система Protocol Maker  
**Версия:** Mock Mode
"""

        # Create mock response
        response = ProtocolResponse(
            id=protocol_id,
            status=ProtocolStatus.COMPLETED,
            protocol={
                "content": mock_content,
                "summary": "Совещание прошло продуктивно. Обсуждены текущие проекты и определены следующие этапы.",
                "decisions": [
                    "Продолжить работу над текущими проектами в установленные сроки",
                    "Организовать следующее совещание через две недели",
                    "Распределить дополнительные задачи между участниками"
                ],
                "transcript": "Заглушка транскрипта. В реальной версии здесь будет транскрипция аудио.",
                "participants": participants_data,
                "protocol_type": protocol_type_info.name,
                "created_at": datetime.now().isoformat()
            },
            error=None
        )
        
        print(f"Mock Protocol generated for ID: {protocol_id}")
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error processing protocol submission: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.get("/api/protocols/{protocol_id}/status")
async def get_protocol_status(protocol_id: str):
    """Get protocol processing status"""
    return ProtocolResponse(
        id=protocol_id,
        status=ProtocolStatus.PROCESSING,
        protocol=None,
        error=None
    )

@app.get("/api/protocols")
async def get_protocols():
    """Get list of all protocols"""
    return []

@app.delete("/api/protocols/{protocol_id}")
async def delete_protocol(protocol_id: str):
    """Delete a protocol"""
    return {"message": f"Protocol {protocol_id} deleted"}

@app.get("/api/protocols/{protocol_id}/download")
async def download_protocol(protocol_id: str):
    """Download processed protocol"""
    raise HTTPException(status_code=501, detail="Download functionality not implemented yet")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3001)

