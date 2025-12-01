import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { LogOut, FileText } from "lucide-react";
import ProtocolTypeSelector from "@/components/ProtocolTypeSelector";
import { Participant } from "@/components/ParticipantsManager";
import FileUploader from "@/components/FileUploader";
import ProtocolViewer from "@/components/ProtocolViewer";
import ProtocolListTable from "@/components/ProtocolListTable";
import SpeakerMapping from "@/components/SpeakerMapping";
import { loadPermanentParticipants, savePermanentParticipants } from "@/lib/permanentParticipants";

type PageState = "protocol-list" | "select-type" | "upload-file" | "map-speakers" | "view-result";

export default function Dashboard() {
  const [, navigate] = useLocation();
  const [currentPage, setCurrentPage] = useState<PageState>("protocol-list");
  const [selectedProtocolType, setSelectedProtocolType] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [protocolResult, setProtocolResult] = useState<any>(null);
  const [transcript, setTranscript] = useState<string>("");
  const [diarization, setDiarization] = useState<any | null>(null);
  const [transcriptDuration, setTranscriptDuration] = useState<string>("");
  const [transcriptDurationMs, setTranscriptDurationMs] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [isViewingProtocol, setIsViewingProtocol] = useState(false);
  const protocolTypeSelectorRef = useRef<HTMLDivElement>(null);

  // Логируем изменения participants для отладки
  useEffect(() => {
    console.log(`[Dashboard] participants state changed: ${participants.length} participants`, participants);
  }, [participants]);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    setUser(JSON.parse(userData));
  }, [navigate]);

  // Очищаем ошибку при переходе на другую страницу
  useEffect(() => {
    if (currentPage !== "upload-file") {
      setError(null);
    } else {
      // Очищаем ошибку при переходе на страницу загрузки файла
      // чтобы гарантировать, что старая ошибка не останется
      setError(null);
    }
  }, [currentPage]);

  // Логируем изменения ошибки для отладки
  useEffect(() => {
    if (error) {
      console.log("=== Dashboard: Error state changed ===", error);
      console.trace("Error set at:");
    } else {
      console.log("=== Dashboard: Error cleared ===");
    }
  }, [error]);

  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("authToken");
    navigate("/login");
  };

  const handleProtocolTypeSelect = (typeId: string) => {
    console.log(`[Dashboard] handleProtocolTypeSelect called with type: ${typeId}`);
    console.log(`[Dashboard] Current participants count: ${participants.length}`);
    setSelectedProtocolType(typeId);
    // Загружаем сохраненных постоянных участников при выборе типа протокола
    // если они еще не загружены
    if (participants.length === 0) {
      const savedParticipants = loadPermanentParticipants();
      console.log(`[Dashboard] Loaded ${savedParticipants.length} permanent participants when selecting protocol type`);
      if (savedParticipants.length > 0) {
        console.log(`[Dashboard] Setting participants:`, savedParticipants);
        setParticipants(savedParticipants);
      }
    } else {
      console.log(`[Dashboard] Participants already loaded, skipping load`);
    }
    setCurrentPage("upload-file");
  };


  const handleFileUpload = (file: File, transcriptionData: { transcript: string; diarization?: any; duration?: string; duration_ms?: number }) => {
    console.log("=== Dashboard: handleFileUpload called ===");
    console.log("File:", file.name, file.size);
    console.log("Transcript length:", transcriptionData.transcript?.length || 0);
    console.log("Transcript preview:", transcriptionData.transcript?.substring(0, 200));
    console.log("Diarization:", transcriptionData.diarization);
    console.log("Duration:", transcriptionData.duration, "Duration MS:", transcriptionData.duration_ms);
    console.log("Current selectedProtocolType:", selectedProtocolType);
    console.log("Current currentPage:", currentPage);
    console.log("Current error state:", error);
    
    // Очищаем ошибку перед обработкой
    console.log("=== Dashboard: Clearing error at start ===");
    setError(null);
    
    try {
      console.log("=== Dashboard: Setting state variables ===");
      setUploadedFile(file);
      setTranscript(transcriptionData.transcript || "");
      setDiarization(transcriptionData.diarization || null);
      setTranscriptDuration(transcriptionData.duration || "");
      setTranscriptDurationMs(transcriptionData.duration_ms || 0);
      
      console.log("State updated, setting currentPage to map-speakers");
      console.log("Before setCurrentPage - currentPage:", currentPage);
      console.log("Before setCurrentPage - uploadedFile:", uploadedFile);
      console.log("Before setCurrentPage - selectedProtocolType:", selectedProtocolType);
      
      setCurrentPage("map-speakers");
      console.log("=== Dashboard: currentPage set to map-speakers ===");
      
      // Используем setTimeout для логирования после обновления состояния
      setTimeout(() => {
        console.log("After setCurrentPage - currentPage should be 'map-speakers'");
        console.log("After setCurrentPage - uploadedFile:", uploadedFile);
        console.log("After setCurrentPage - selectedProtocolType:", selectedProtocolType);
        console.log("SpeakerMapping should render if all conditions are met");
      }, 0);
      
      // Убеждаемся, что ошибка очищена после успешной обработки
      console.log("=== Dashboard: Clearing error after successful processing ===");
      setError(null);
      setTimeout(() => {
        setError(null);
        console.log("=== Dashboard: Error cleared in setTimeout ===");
      }, 0);
      console.log("=== Dashboard: handleFileUpload completed successfully ===");
    } catch (error) {
      console.error("=== Dashboard: ERROR in handleFileUpload ===");
      console.error("Error in handleFileUpload:", error);
      console.error("Error details:", {
        name: error instanceof Error ? error.name : "Unknown",
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      // НЕ устанавливаем ошибку - пусть FileUploader сам обрабатывает ошибки
      // Ошибка не должна отображаться в Dashboard
      // setError("Ошибка при обработке результата транскрипции");
      console.error("=== Dashboard: Error caught but not displayed ===");
    }
  };

  const handleMappingBack = () => {
    setCurrentPage("upload-file");
  };

  const handleProtocolGenerated = (protocolData: any, participantsUsed: Participant[]) => {
    console.log(`[Dashboard] ===== handleProtocolGenerated CALLED =====`);
    console.log(`[Dashboard] uploadedFile:`, uploadedFile);
    console.log(`[Dashboard] protocolData:`, protocolData);
    console.log(`[Dashboard] participantsUsed:`, participantsUsed);
    console.log(`[Dashboard] participantsUsed type:`, typeof participantsUsed);
    console.log(`[Dashboard] participantsUsed is array:`, Array.isArray(participantsUsed));
    console.log(`[Dashboard] participantsUsed length:`, participantsUsed?.length);
    console.log(`[Dashboard] Current participants state:`, participants);
    
    // НЕ проверяем uploadedFile здесь, так как он может быть null из-за асинхронности состояния
    // Протокол уже сгенерирован, значит файл был загружен
    
    // Сохраняем постоянных участников после успешной генерации протокола
    // ВАЖНО: Сохраняем даже если participantsUsed пустой, используем текущее состояние participants
    const participantsToSave = (participantsUsed && Array.isArray(participantsUsed) && participantsUsed.length > 0) 
      ? participantsUsed 
      : participants;
    
    console.log(`[Dashboard] participantsToSave:`, participantsToSave);
    console.log(`[Dashboard] participantsToSave length:`, participantsToSave.length);
    
    if (participantsToSave && Array.isArray(participantsToSave) && participantsToSave.length > 0) {
      const permanentCount = participantsToSave.filter(p => p && p.type === "permanent").length;
      console.log(`[Dashboard] Saving ${permanentCount} permanent participants out of ${participantsToSave.length} total`);
      console.log(`[Dashboard] All participants to save:`, participantsToSave);
      savePermanentParticipants(participantsToSave);
      console.log(`[Dashboard] ✓ Saved ${permanentCount} permanent participants after protocol generation`);
    } else {
      console.warn(`[Dashboard] ✗ participantsToSave is invalid or empty, not saving`);
      console.warn(`[Dashboard] participantsToSave:`, participantsToSave);
      console.warn(`[Dashboard] participants state:`, participants);
    }
    
    // Используем данные участников из ответа бэкенда (protocol.participants), которые содержат organization и role
    const backendParticipants = protocolData.protocol?.participants || protocolData.participants;
    const participantsToUse = backendParticipants && Array.isArray(backendParticipants) && backendParticipants.length > 0
      ? backendParticipants
      : participants;
    
    console.log('[Dashboard] handleProtocolGenerated - backendParticipants:', backendParticipants);
    console.log('[Dashboard] handleProtocolGenerated - participantsToUse:', participantsToUse);
    
    const result = {
      type: selectedProtocolType,
      fileName: uploadedFile.name,
      duration: protocolData.protocol?.duration || protocolData.duration || "Неизвестно",
      participants: participantsToUse.map((p: any) => (typeof p === 'string' ? p : (p.name || p))),
      participantsData: participantsToUse, // Используем данные из бэкенда с organization и role
      date: protocolData.protocol?.created_at || protocolData.created_at
        ? new Date(protocolData.protocol?.created_at || protocolData.created_at).toLocaleDateString("ru-RU")
        : new Date().toLocaleDateString("ru-RU"),
      content: protocolData.protocol?.content || protocolData.content || "Протокол не был сгенерирован",
      contentJson: protocolData.protocol?.content || protocolData.content || null, // Передаем JSON строку для парсинга
      summary: protocolData.protocol?.summary || protocolData.summary || "Автоматически сгенерированное резюме",
      decisions: Array.isArray(protocolData.protocol?.decisions) 
        ? protocolData.protocol.decisions
        : (Array.isArray(protocolData.decisions)
          ? protocolData.decisions
          : (protocolData.protocol?.decisions ? [protocolData.protocol.decisions] : (protocolData.decisions ? [protocolData.decisions] : ["Обработано автоматически"]))),
      transcript: protocolData.protocol?.transcript || protocolData.transcript,
      protocolType: protocolData.protocol?.protocol_type || protocolData.protocol_type
    };
    console.log('[Dashboard] handleProtocolGenerated - result.participantsData:', result.participantsData);
    setProtocolResult(result);
    setCurrentPage("view-result");
  };

  const handleBackToList = () => {
    // Reset all state
    setSelectedProtocolType(null);
    setParticipants([]);
    setUploadedFile(null);
    setProtocolResult(null);
    setCurrentPage("protocol-list");
  };

  const handleCreateNew = () => {
    console.log(`[Dashboard] handleCreateNew called`);
    // Загружаем сохраненных постоянных участников при создании нового протокола
    const savedParticipants = loadPermanentParticipants();
    console.log(`[Dashboard] Loaded ${savedParticipants.length} permanent participants for new protocol`);
    if (savedParticipants.length > 0) {
      console.log(`[Dashboard] Setting participants:`, savedParticipants);
      setParticipants(savedParticipants);
    } else {
      // Если нет сохраненных участников, очищаем список
      console.log(`[Dashboard] No saved participants, clearing list`);
      setParticipants([]);
    }
    
    // Прокручиваем к блоку выбора типов протоколов
    if (protocolTypeSelectorRef.current) {
      protocolTypeSelectorRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      // Если еще не на странице со списком, переключаемся
      setSelectedProtocolType(null);
      setUploadedFile(null);
      setProtocolResult(null);
      setCurrentPage("protocol-list");
      // Небольшая задержка для рендера, затем прокрутка
      setTimeout(() => {
        if (protocolTypeSelectorRef.current) {
          protocolTypeSelectorRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  };

  const handleBackToType = () => {
    setSelectedProtocolType(null);
    setParticipants([]);
    setUploadedFile(null);
    setCurrentPage("select-type");
  };

  const handleBackToParticipants = () => {
    setUploadedFile(null);
    setSelectedProtocolType(null);
    setCurrentPage("select-type");
  };

  const handleBackToUpload = () => {
    setUploadedFile(null);
    setCurrentPage("upload-file");
  };


  const handleViewResultBack = () => {
    // After viewing result, go back to list
    handleBackToList();
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Логотип Team Idea */}
            <img 
              src="/logo_team_idea.png" 
              alt="Team Idea" 
              className="h-10 w-auto"
            />
            {/* Текущий логотип и название - смещены вправо */}
            <div 
              className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => {
                if (currentPage !== "protocol-list") {
                  handleBackToList();
                }
              }}
            >
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <FileText className="text-white h-5 w-5" />
              </div>
              <h1 className="text-xl font-bold text-slate-900">Protocol Maker</h1>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {user && (
              <span className="text-sm text-slate-600">
                Добро пожаловать, <strong>{user.name}</strong>
              </span>
            )}
            {currentPage !== "protocol-list" && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleBackToList}
                className="border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                К списку протоколов
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Выход
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {currentPage === "protocol-list" && (
          <div className="space-y-12">
            {/* Список протоколов */}
            <ProtocolListTable 
              onCreateNew={handleCreateNew}
              onViewingChange={setIsViewingProtocol}
            />
            
            {/* Блок выбора типов протоколов - показываем только когда НЕ просматривается протокол */}
            {!isViewingProtocol && (
              <div ref={protocolTypeSelectorRef} className="scroll-mt-8">
                <ProtocolTypeSelector onSelect={handleProtocolTypeSelect} />
              </div>
            )}
          </div>
        )}

        {currentPage === "select-type" && (
          <ProtocolTypeSelector onSelect={handleProtocolTypeSelect} />
        )}

        {currentPage === "upload-file" && selectedProtocolType && (
          <>
            <FileUploader
              protocolType={selectedProtocolType}
              participants={participants}
              onUpload={handleFileUpload}
              onBack={handleBackToParticipants}
            />
            {/* Ошибка не отображается - она показывается только в FileUploader */}
          </>
        )}

        {currentPage === "map-speakers" && selectedProtocolType && uploadedFile && (
          <SpeakerMapping
            protocolType={selectedProtocolType}
            participants={participants}
            transcript={transcript}
            diarization={diarization}
            duration={transcriptDuration}
            duration_ms={transcriptDurationMs}
            onBack={handleMappingBack}
            onGenerated={handleProtocolGenerated}
          />
        )}

        {currentPage === "view-result" && protocolResult && (
          <ProtocolViewer
            protocol={protocolResult}
            onBack={handleViewResultBack}
          />
        )}
      </main>
    </div>
  );
}

