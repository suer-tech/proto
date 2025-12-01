import { Participant } from "@/components/ParticipantsManager";

// Базовый URL API - будет установлен из переменных окружения
// Для продакшена используем относительный путь /api/ через nginx reverse-proxy
const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  // В продакшене используем относительный путь /api/ (nginx проксирует на localhost:3001)
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') {
      // Используем относительный путь - nginx проксирует /api/ на бэкенд
      return '/api';
    }
  }
  return "http://localhost:3001/api";
};

const API_BASE_URL = getApiBaseUrl();

// Логирование для отладки
if (typeof window !== 'undefined') {
  console.log('API Base URL:', API_BASE_URL);
  console.log('VITE_API_URL env:', import.meta.env.VITE_API_URL);
}

export interface ProtocolRequest {
  protocolType: string;
  participants: Participant[];
  audioFile: File;
}

export interface TranscriptionResponse {
  success: boolean;
  transcript: string;
  diarization?: any;
  aligned_transcript?: any;
  duration?: string;
  duration_ms?: number;
}

export interface TranscriptionResult {
  success: boolean;
  transcript: string;
  diarization?: any;
  duration?: string;
  duration_ms?: number;
  protocol_id?: string;
  transcript_file?: string;
  error?: string;
}

export interface ProtocolResponse {
  id: string;
  status: "processing" | "completed" | "failed";
  protocol?: {
    content: string;
    summary: string;
    decisions: string[];
    transcript?: string;
    participants?: any[];
    protocol_type?: string;
    duration?: string;
    duration_ms?: number;
    created_at?: string;
  };
  error?: string;
}

/**
 * Отправляет данные протокола на бэкенд для обработки
 * @param request - Данные протокола с аудиофайлом и участниками
 * @returns Результат обработки
 */
export async function submitProtocol(request: ProtocolRequest): Promise<TranscriptionResult> {
  const formData = new FormData();
  
  // Добавляем тип протокола
  formData.append("protocolType", request.protocolType);
  
  // Добавляем участников в формате JSON
  formData.append("participants", JSON.stringify(request.participants));
  
  // Добавляем аудиофайл
  formData.append("audioFile", request.audioFile);

  try {
    const url = `${API_BASE_URL}/protocols/submit`;
    console.log('Submitting to:', url);
    console.log('FormData keys:', Array.from(formData.keys()));
    
    const response = await fetch(url, {
      method: "POST",
      // Не устанавливаем Content-Type - браузер сам добавит multipart/form-data с boundary
      // Authorization заголовок тоже убираем, т.к. бэкенд его не требует
      body: formData,
    });

    console.log('Response status:', response.status, response.statusText);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Response error:', errorText);
      let errorMessage = `Ошибка сервера: ${response.status} ${response.statusText}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.detail) {
          errorMessage = errorJson.detail;
        } else if (errorJson.error) {
          errorMessage = errorJson.error;
        }
      } catch {
        // Если не JSON, используем текст как есть
        if (errorText) {
          errorMessage = errorText.length > 200 ? errorText.substring(0, 200) + "..." : errorText;
        }
      }
      throw new Error(errorMessage);
    }

    const data: TranscriptionResult = await response.json();
    console.log('Response data:', data);
    
    // Проверяем, что ответ имеет правильный формат
    if (!data || typeof data !== 'object') {
      throw new Error("Неверный формат ответа от сервера");
    }
    
    // КРИТИЧЕСКИ ВАЖНО: Если success === true, удаляем поле error из ответа (если оно есть)
    // Это гарантирует, что фронтенд не будет использовать ошибку из успешного ответа
    if (data.success === true && 'error' in data) {
      console.warn('[api.ts] Removing error field from successful response:', data.error);
      delete (data as any).error;
    }
    
    return data;
  } catch (error) {
    console.error("Failed to submit protocol:", error);
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      console.error('Network error - возможно CORS или бэкенд недоступен');
      console.error('Проверьте что бэкенд запущен на:', API_BASE_URL.replace('/api', ''));
    }
    throw error;
  }
}

/**
 * Выполняет транскрибацию с опциональной диаризацией
 */
export async function transcribeWithDiarization(
  audioFile: File,
  options?: { enableDiarization?: boolean; minSpeakers?: number | null; maxSpeakers?: number | null; device?: string; modelSize?: string; }
): Promise<TranscriptionResponse> {
  const formData = new FormData();
  formData.append("audioFile", audioFile);
  formData.append("enableDiarization", String(options?.enableDiarization ?? true));
  if (options?.minSpeakers != null) formData.append("minSpeakers", String(options.minSpeakers));
  if (options?.maxSpeakers != null) formData.append("maxSpeakers", String(options.maxSpeakers));
  if (options?.device) formData.append("device", options.device);
  if (options?.modelSize) formData.append("modelSize", options.modelSize);

  const response = await fetch(`${API_BASE_URL}/transcribe`, { method: "POST", body: formData });
  if (!response.ok) throw new Error(`API error: ${response.status} ${response.statusText}`);
  return response.json();
}

/**
 * Генерирует протокол из готовой стенограммы
 */
export async function generateProtocolFromTranscript(params: {
  protocolType: string;
  participants: Participant[];
  transcript: string;
  duration?: string;
  duration_ms?: number;
}): Promise<ProtocolResponse> {
  const formData = new FormData();
  formData.append("protocolType", params.protocolType);
  formData.append("participants", JSON.stringify(params.participants));
  formData.append("transcript", params.transcript);
  if (params.duration) {
    formData.append("duration", params.duration);
  }
  if (params.duration_ms) {
    formData.append("duration_ms", String(params.duration_ms));
  }

  const url = `${API_BASE_URL}/protocols/submit_llm`;
  console.log('[generateProtocolFromTranscript] Sending request to:', url);
  console.log('[generateProtocolFromTranscript] FormData keys:', Array.from(formData.keys()));
  
  try {
    // Создаем AbortController для таймаута (5 минут)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 минут
    
    const response = await fetch(url, { 
      method: "POST", 
      body: formData,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    console.log('[generateProtocolFromTranscript] Response status:', response.status, response.statusText);
    console.log('[generateProtocolFromTranscript] Response headers:', Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      const text = await response.text();
      console.error('[generateProtocolFromTranscript] Error response:', text);
      throw new Error(`API error: ${response.status} ${response.statusText} - ${text}`);
    }
    
    const responseText = await response.text();
    console.log('[generateProtocolFromTranscript] Response text length:', responseText.length);
    console.log('[generateProtocolFromTranscript] Response text preview:', responseText.substring(0, 200));
    
    let jsonData: ProtocolResponse;
    try {
      jsonData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[generateProtocolFromTranscript] Failed to parse JSON:', parseError);
      console.error('[generateProtocolFromTranscript] Response text:', responseText);
      throw new Error(`Failed to parse response as JSON: ${parseError}`);
    }
    
    console.log('[generateProtocolFromTranscript] Parsed response:', jsonData);
    console.log('[generateProtocolFromTranscript] Response status:', jsonData.status);
    console.log('[generateProtocolFromTranscript] Has protocol:', !!jsonData.protocol);
    
    return jsonData;
  } catch (error: any) {
    console.error('[generateProtocolFromTranscript] Fetch error:', error);
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      throw new Error('Запрос превысил время ожидания. Генерация протокола может занять несколько минут.');
    }
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      throw new Error('Не удалось подключиться к серверу. Проверьте подключение к интернету.');
    }
    throw error;
  }
}

/**
 * Получает статус обработки протокола
 * @param protocolId - ID протокола
 * @returns Статус обработки
 */
export async function getProtocolStatus(protocolId: string): Promise<ProtocolResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/protocols/${protocolId}/status`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${localStorage.getItem("authToken")}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    const data: ProtocolResponse = await response.json();
    return data;
  } catch (error) {
    console.error("Failed to get protocol status:", error);
    throw error;
  }
}

/**
 * Скачивает готовый протокол в формате Word
 * @param protocolId - ID протокола
 * @returns Blob с содержимым файла
 */
export async function downloadProtocol(protocolId: string): Promise<Blob> {
  try {
    const response = await fetch(`${API_BASE_URL}/protocols/${protocolId}/download`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${localStorage.getItem("authToken")}`,
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    return await response.blob();
  } catch (error) {
    console.error("Failed to download protocol:", error);
    throw error;
  }
}

/**
 * Получает список сохраненных протоколов пользователя
 * @returns Список протоколов
 */
export async function getProtocols(): Promise<any[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/protocols`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Failed to get protocols:", error);
    throw error;
  }
}

/**
 * Получает протокол по ID
 * @param protocolId - ID протокола
 * @returns Данные протокола
 */
export async function getProtocol(protocolId: string): Promise<any> {
  try {
    const response = await fetch(`${API_BASE_URL}/protocols/${protocolId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Failed to get protocol:", error);
    throw error;
  }
}

/**
 * Удаляет протокол
 * @param protocolId - ID протокола
 */
export async function deleteProtocol(protocolId: string): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/protocols/${protocolId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }
  } catch (error) {
    console.error("Failed to delete protocol:", error);
    throw error;
  }
}

