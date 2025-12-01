import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, ArrowLeft, Music, AlertCircle } from "lucide-react";
import { submitProtocol } from "@/lib/api";
import { Participant } from "@/components/ParticipantsManager";

interface FileUploaderProps {
  protocolType: string;
  participants?: Participant[];
  onUpload: (file: File, transcriptionData: { transcript: string; diarization?: any; duration?: string; duration_ms?: number }) => void;
  onBack: () => void;
}

const PROTOCOL_NAMES: Record<string, string> = {
  "standard-meeting": "Протокол совещания",
  "board-meeting": "Протокол заседания совета директоров",
  "general-assembly": "Протокол общего собрания",
  "technical-meeting": "Протокол технического совещания",
  "audit-meeting": "Протокол аудиторского совещания",
  "hr-meeting": "Протокол HR совещания"
};

export default function FileUploader({ 
  protocolType, 
  participants = [],
  onUpload, 
  onBack 
}: FileUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false); // Флаг успешной загрузки
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadSuccessRef = useRef(false); // Ref для проверки в асинхронных операциях

  // КРИТИЧЕСКИ ВАЖНО: Принудительно очищаем ошибку при монтировании компонента
  // Это гарантирует, что старая ошибка не останется от предыдущего рендера
  useEffect(() => {
    console.log("[FileUploader] Component mounted, clearing any existing error");
    setError("");
    setUploadSuccess(false);
    uploadSuccessRef.current = false;
  }, []);

  // Защищенная функция установки ошибки - блокирует установку, если uploadSuccess === true
  const setErrorSafe = (errorMessage: string, source: string = "unknown") => {
    if (uploadSuccessRef.current || uploadSuccess) {
      console.warn(`[FileUploader] BLOCKED setError from ${source}: "${errorMessage}" - uploadSuccess is true`);
      return;
    }
    console.log(`[FileUploader] setError from ${source}: "${errorMessage}"`);
    setError(errorMessage);
  };

  const ALLOWED_FORMATS = ["audio/mpeg", "audio/wav", "audio/mp4", "audio/x-m4a"];
  const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

  const validateFile = (file: File): boolean => {
    if (!ALLOWED_FORMATS.includes(file.type)) {
      setErrorSafe("Поддерживаемые форматы: MP3, WAV, M4A", "validateFile");
      return false;
    }
    if (file.size > MAX_FILE_SIZE) {
      setErrorSafe("Размер файла не должен превышать 500 МБ", "validateFile");
      return false;
    }
    setError("");
    setUploadSuccess(false);
    uploadSuccessRef.current = false; // Сбрасываем флаг успеха при выборе нового файла
    return true;
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      const file = files[0];
      if (validateFile(file)) {
        setSelectedFile(file);
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      const file = files[0];
      if (validateFile(file)) {
        setSelectedFile(file);
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    // Очищаем ошибку в самом начале
    console.log("=== handleUpload: Starting upload ===");
    setError("");
    setUploadSuccess(false); // Сбрасываем флаг успеха при выборе нового файла
    setIsUploading(true);
    setIsProcessing(true);

    try {
      // Имитируем загрузку файла с прогрессом
      const interval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(interval);
            return 90;
          }
          return prev + Math.random() * 20;
        });
      }, 300);

      // Используем /api/protocols/submit для транскрипции (без генерации протокола)
      const response = await submitProtocol({
        protocolType: protocolType,
        participants: participants,
        audioFile: selectedFile
      });

      clearInterval(interval);
      setUploadProgress(100);

      setIsUploading(false);
      
      console.log("=== FileUploader: Response received ===");
      console.log("Response object:", response);
      console.log("Response.success:", response.success);
      console.log("Response type:", typeof response);
      console.log("Response keys:", Object.keys(response || {}));
      
      if (!response || typeof response !== 'object') {
        console.error("Invalid response format:", response);
        setErrorSafe("Неверный формат ответа от сервера", "handleUpload");
        return;
      }
      
      // Проверяем наличие поля success
      if (!('success' in response)) {
        console.error("Response missing 'success' field:", response);
        console.error("Response keys:", Object.keys(response));
        setErrorSafe("Неверный формат ответа: отсутствует поле 'success'", "handleUpload");
        return;
      }
      
      // ВАЖНО: Проверяем success ПЕРВЫМ делом, чтобы не устанавливать ошибку из response.error при success: true
      if (response.success === true) {
        // Если success === true, гарантируем, что ошибка очищена
        // Игнорируем response.error полностью, если success === true (сервер может возвращать error даже при успехе)
        console.log("[FileUploader] Success detected, clearing error and setting uploadSuccess=true");
        setError("");
        setUploadSuccess(true);
        uploadSuccessRef.current = true; // Устанавливаем ref ПЕРВЫМ, чтобы блокировать все последующие setError
        
        // Дополнительная защита: если по какой-то причине response.error установлен при success: true, игнорируем его
        if (response.error) {
          console.warn("[FileUploader] Server returned error field despite success: true, ignoring it:", response.error);
        }
      } else if (!response.success) {
        // Только если success === false, устанавливаем ошибку
        console.error("Transcription failed!");
        console.error("Response.success:", response.success);
        console.error("Response.error:", response.error);
        console.error("Full response:", JSON.stringify(response, null, 2));
        setErrorSafe(response.error || "Ошибка при транскрибации аудио", "handleUpload - success false");
        setIsProcessing(false);
        setUploadSuccess(false);
        uploadSuccessRef.current = false;
        return;
      } else {
        // Дополнительная проверка: убеждаемся что success === true
        console.error("Response.success is not true:", response.success, typeof response.success);
        console.error("Full response:", JSON.stringify(response, null, 2));
        setErrorSafe("Неверный формат ответа: success не равен true", "handleUpload - invalid success");
        setIsProcessing(false);
        setUploadSuccess(false);
        uploadSuccessRef.current = false;
        return;
      }

      console.log("Transcription successful!");
      console.log("Transcript length:", response.transcript?.length || 0);
      console.log("Diarization object:", response.diarization);
      console.log("Diarization type:", typeof response.diarization);
      if (response.diarization) {
        console.log("Diarization keys:", Object.keys(response.diarization));
        console.log("Diarization.utterances:", response.diarization.utterances);
        console.log("Diarization.segments:", response.diarization.segments);
        console.log("Diarization.speaker_count:", response.diarization.speaker_count);
      }
      console.log("Duration:", response.duration, "Duration MS:", response.duration_ms);

      // Проверяем наличие обязательных полей
      if (!response.transcript || response.transcript.trim().length === 0) {
        console.error("Transcript is empty or missing!");
        setErrorSafe("Стенограмма пуста. Попробуйте загрузить файл снова.", "handleUpload - empty transcript");
        setIsProcessing(false);
        setIsUploading(false);
        setUploadSuccess(false);
        uploadSuccessRef.current = false;
        return;
      }

      // Передаем результат транскрипции для маппинга спикеров
      console.log("Calling onUpload with:", {
        file: selectedFile.name,
        transcriptLength: response.transcript?.length || 0,
        hasDiarization: !!response.diarization,
        duration: response.duration,
        duration_ms: response.duration_ms
      });
      
      try {
        // Вызываем onUpload синхронно
        onUpload(selectedFile, {
          transcript: response.transcript || "",
          diarization: response.diarization,
          duration: response.duration,
          duration_ms: response.duration_ms
        });
        
        console.log("onUpload called successfully - no errors thrown");
        
        // Только после успешного вызова onUpload обновляем состояние
        console.log("[FileUploader] === Setting states after successful onUpload ===");
        setIsProcessing(false);
        setIsUploading(false);
        // КРИТИЧЕСКИ ВАЖНО: Очищаем ошибку ПОСЛЕДНИМ, после установки uploadSuccess
        // Это гарантирует, что ошибка не будет отображаться
        setUploadSuccess(true); // Подтверждаем успех ПЕРВЫМ
        uploadSuccessRef.current = true; // Устанавливаем ref ПЕРВЫМ
        setError(""); // Гарантируем, что ошибка очищена ПОСЛЕДНИМ
        console.log("[FileUploader] === Error cleared, states updated, uploadSuccess=true ===");
        
        // Дополнительная защита через микротаск
        setTimeout(() => {
          console.log("[FileUploader] Final check: clearing error in setTimeout, uploadSuccess should be true");
          uploadSuccessRef.current = true; // Подтверждаем ref
          setError(""); // Всегда очищаем ошибку в микротаске после успешной обработки
          setUploadSuccess(true); // Подтверждаем еще раз
        }, 0);
      } catch (uploadError) {
        console.error("=== ERROR in onUpload callback ===");
        console.error("Error calling onUpload:", uploadError);
        console.error("Upload error details:", {
          name: uploadError instanceof Error ? uploadError.name : "Unknown",
          message: uploadError instanceof Error ? uploadError.message : String(uploadError),
          stack: uploadError instanceof Error ? uploadError.stack : undefined
        });
        setErrorSafe("Ошибка при обработке результата транскрипции", "onUpload catch");
        setIsProcessing(false);
        setIsUploading(false);
        setUploadSuccess(false);
        uploadSuccessRef.current = false; // Сбрасываем флаг успеха при ошибке
      }
    } catch (err) {
      clearInterval(0);
      setIsUploading(false);
      setIsProcessing(false);
      console.error("[FileUploader] Failed to transcribe audio:", err);
      console.error("[FileUploader] Error details:", {
        name: err instanceof Error ? err.name : "Unknown",
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined
      });
      
      // КРИТИЧЕСКИ ВАЖНО: Проверяем, не пришла ли ошибка из успешного ответа
      // Если в err.message есть "Ошибка при обработке протокола", но мы уже обработали успешный ответ,
      // игнорируем эту ошибку
      if (err instanceof Error && err.message.includes("Ошибка при обработке протокола")) {
        console.warn("[FileUploader] Ignoring error message that contains 'Ошибка при обработке протокола' - this should not appear for successful requests");
        // Если uploadSuccess уже установлен в true, не устанавливаем ошибку
        if (uploadSuccessRef.current || uploadSuccess) {
          console.warn("[FileUploader] uploadSuccess is true, not setting error");
          return;
        }
      }
      
      // Более детальная обработка ошибок
      let errorMessage = "Ошибка при отправке файла. Пожалуйста, попробуйте снова.";
      if (err instanceof Error) {
        errorMessage = err.message;
        // Если ошибка содержит "API error", показываем более понятное сообщение
        if (err.message.includes("API error")) {
          errorMessage = "Ошибка при обращении к серверу. Проверьте подключение к интернету.";
        } else if (err.message.includes("Failed to fetch")) {
          errorMessage = "Не удалось подключиться к серверу. Проверьте, что сервер запущен.";
        } else if (err.message.includes("Invalid protocol type")) {
          errorMessage = err.message;
        } else if (err.message.includes("detail")) {
          // Извлекаем детали из сообщения об ошибке
          errorMessage = err.message;
        }
      }
      setErrorSafe(errorMessage, "handleUpload catch");
      setUploadSuccess(false);
      uploadSuccessRef.current = false; // Сбрасываем флаг успеха при ошибке
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <Button
          variant="ghost"
          onClick={onBack}
          className="text-slate-600 hover:text-slate-900 mb-4"
          disabled={isUploading}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Вернуться к выбору типа
        </Button>
        <h2 className="text-3xl font-bold text-slate-900">Загрузите аудиофайл</h2>
        <p className="text-slate-600">
          Выбранный тип: <strong>{PROTOCOL_NAMES[protocolType]}</strong>
        </p>
      </div>

      {/* Upload Area */}
      <Card className="border-2 border-dashed border-slate-300 hover:border-blue-400 transition-colors">
        <CardContent className="pt-8">
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`p-12 text-center rounded-lg transition-colors ${
              dragActive ? "bg-blue-50 border-blue-400" : "bg-slate-50"
            }`}
          >
            {!selectedFile ? (
              <div className="space-y-4">
                <div className="flex justify-center">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                    <Upload className="h-8 w-8 text-blue-600" />
                  </div>
                </div>
                <div>
                  <p className="text-lg font-semibold text-slate-900">
                    Перетащите файл сюда
                  </p>
                  <p className="text-slate-600 text-sm mt-1">
                    или нажмите кнопку ниже для выбора файла
                  </p>
                </div>
                <p className="text-xs text-slate-500">
                  Поддерживаемые форматы: MP3, WAV, M4A (максимум 500 МБ)
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                    <Music className="h-8 w-8 text-green-600" />
                  </div>
                </div>
                <div>
                  <p className="text-lg font-semibold text-slate-900">
                    {selectedFile.name}
                  </p>
                  <p className="text-slate-600 text-sm mt-1">
                    Размер: {formatFileSize(selectedFile.size)}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleChange}
            className="hidden"
            disabled={isUploading}
          />

          {/* Error Message - НЕ показываем ошибку после успешного ответа */}
          {/* Ошибка показывается только если:
              1. Есть текст ошибки
              2. Не идет загрузка (isUploading === false)
              3. Не идет обработка (isProcessing === false)
              4. Загрузка НЕ была успешной (uploadSuccess === false)
          */}
          {/* Ошибка показывается ТОЛЬКО если:
              1. Есть текст ошибки
              2. Не идет загрузка (isUploading === false)
              3. Не идет обработка (isProcessing === false)
              4. Загрузка НЕ была успешной (uploadSuccess === false)
              5. Дополнительная проверка: если uploadSuccess === true, НИКОГДА не показываем ошибку
          */}
          {error && error.trim() !== "" && !isUploading && !isProcessing && !uploadSuccess && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 flex gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {/* Upload Progress */}
          {isUploading && (
            <div className="mt-6 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-slate-700">
                  {uploadProgress < 100 ? "Загрузка файла..." : "Обработка протокола..."}
                </span>
                <span className="text-sm text-slate-600">{Math.round(uploadProgress)}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
            </div>
          )}

          {/* Buttons */}
          <div className="mt-6 flex gap-3">
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || !!selectedFile}
              className="flex-1 border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Выбрать файл
            </Button>
            {selectedFile && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedFile(null);
                    setError("");
    setUploadSuccess(false); // Сбрасываем флаг успеха при выборе нового файла
                    setUploadProgress(0);
                  }}
                  disabled={isUploading}
                  className="border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Изменить
                </Button>
                <Button
                  onClick={handleUpload}
                  disabled={isUploading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isUploading ? "Загрузка..." : "Загрузить и обработать"}
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-900">Требования к файлу</CardTitle>
        </CardHeader>
        <CardContent className="text-blue-800 space-y-2 text-sm">
          <p>✓ Формат: MP3, WAV или M4A</p>
          <p>✓ Размер: до 500 МБ</p>
          <p>✓ Качество: любое (система автоматически оптимизирует)</p>
          <p>✓ Язык: русский или английский</p>
        </CardContent>
      </Card>
    </div>

  );
}

