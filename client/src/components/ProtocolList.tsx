import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { FileText, Calendar, Clock, Users, Trash2, Eye, Plus } from "lucide-react";
import { getProtocols, deleteProtocol, getProtocol } from "@/lib/api";
import ProtocolViewer from "@/components/ProtocolViewer";

interface Protocol {
  id: string;
  protocol_type: string;
  duration: string;
  summary: string;
  created_at: string;
  participants: any[];
  meeting_title?: string;
}

interface ProtocolListProps {
  onCreateNew: () => void;
}

export default function ProtocolList({ onCreateNew }: ProtocolListProps) {
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [protocolToDelete, setProtocolToDelete] = useState<string | null>(null);
  const [selectedProtocol, setSelectedProtocol] = useState<any>(null);
  const [viewingProtocol, setViewingProtocol] = useState(false);
  const [protocolsWithContent, setProtocolsWithContent] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    loadProtocols();
  }, []);

  // Загружаем контент для каждого протокола для извлечения заголовка
  useEffect(() => {
    const loadProtocolsContent = async () => {
      if (protocols.length === 0) return;
      
      const contentMap = new Map<string, string>();
      const promises = protocols.map(async (protocol) => {
        try {
          const fullProtocol = await getProtocol(protocol.id);
          if (fullProtocol.protocol?.content) {
            contentMap.set(protocol.id, fullProtocol.protocol.content);
          }
        } catch (err) {
          console.error(`Failed to load content for protocol ${protocol.id}:`, err);
        }
      });
      await Promise.all(promises);
      setProtocolsWithContent(contentMap);
    };

    loadProtocolsContent();
  }, [protocols]);

  const loadProtocols = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getProtocols();
      setProtocols(data);
    } catch (err: any) {
      console.error("Failed to load protocols:", err);
      setError(err.message || "Не удалось загрузить список протоколов");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (protocolId: string) => {
    setProtocolToDelete(protocolId);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!protocolToDelete) return;

    try {
      await deleteProtocol(protocolToDelete);
      await loadProtocols(); // Reload list
      setDeleteDialogOpen(false);
      setProtocolToDelete(null);
    } catch (err: any) {
      console.error("Failed to delete protocol:", err);
      alert(`Не удалось удалить протокол: ${err.message}`);
    }
  };

  const handleView = async (protocol: Protocol) => {
    try {
      // Get full protocol data
      const fullProtocol = await getProtocol(protocol.id);
      
      // Transform to ProtocolViewer format
      const protocolData = {
        id: fullProtocol.id,
        type: fullProtocol.protocol?.protocol_type || protocol.protocol_type,
        fileName: `${protocol.id}.mp3`, // Placeholder
        duration: fullProtocol.protocol?.duration || protocol.duration,
        participants: fullProtocol.protocol?.participants?.map((p: any) => p.name || p) || protocol.participants.map((p: any) => p.name || p),
        participantsData: fullProtocol.protocol?.participants || protocol.participants,
        date: fullProtocol.created_at || protocol.created_at,
        content: fullProtocol.protocol?.content || "",
        summary: fullProtocol.protocol?.summary || protocol.summary,
        decisions: fullProtocol.protocol?.decisions || [],
        transcript: fullProtocol.protocol?.transcript,
        protocolType: fullProtocol.protocol?.protocol_type || protocol.protocol_type
      };
      
      setSelectedProtocol(protocolData);
      setViewingProtocol(true);
    } catch (err: any) {
      console.error("Failed to load protocol:", err);
      alert(`Не удалось загрузить протокол: ${err.message}`);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("ru-RU", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return dateString;
    }
  };

  /**
   * Извлекает название протокола из meeting_title или content (то что формирует LLM)
   * 
   * Структура content от LLM:
   * "# Протокол № 1\n\n---\n# Рабочая встреча \"...\" на проекте \"...\"\n\n---\n**Дата:**"
   * 
   * Алгоритм:
   * 1. Используем meeting_title если он есть (приоритет)
   * 2. Найти строку с "Протокол № X"
   * 3. Пропустить пустые строки и разделители "---"
   * 4. Взять следующую строку с "#" - это и есть название встречи
   */
  const extractProtocolTitle = (protocol: Protocol, content?: string): string => {
    // Приоритет 1: Используем meeting_title из протокола (то же самое, что идет в "Рабочая встреча «...»")
    if (protocol.meeting_title && protocol.meeting_title.trim() && protocol.meeting_title !== "Н/Д") {
      return protocol.meeting_title;
    }
    
    // Приоритет 2: Пытаемся извлечь из content
    if (!content) {
      return protocol.protocol_type || "Протокол";
    }

    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      
      // Ищем строку с "Протокол № X" или "Протокол N X"
      if (trimmed.match(/^#?\s*ПРОТОКОЛ\s*(№|N|#)?\s*\d+/i)) {
        // Нашли заголовок протокола, теперь ищем название после разделителя
        
        // Пропускаем пустые строки и разделители "---"
        for (let j = i + 1; j < lines.length && j < i + 10; j++) {
          const nextLine = lines[j].trim();
          
          // Пропускаем пустые строки
          if (!nextLine) continue;
          
          // Пропускаем разделители "---"
          if (nextLine === '---' || /^-{3,}$/.test(nextLine)) continue;
          
          // Если встретили следующую строку с "#" - это название встречи!
          if (nextLine.startsWith('# ')) {
            let title = nextLine.substring(2).trim(); // Убираем "# "
            
            // Убираем markdown форматирование
            title = title.replace(/\*\*(.+?)\*\*/g, '$1');
            title = title.replace(/_(.+?)_/g, '$1');
            
            // Проверяем следующую строку - может быть продолжение названия
            if (j + 1 < lines.length) {
              const nextNextLine = lines[j + 1].trim();
              // Если следующая строка не пустая, не разделитель, не начинается с "Дата:" или "**"
              if (nextNextLine && 
                  nextNextLine !== '---' && 
                  !/^-{3,}$/.test(nextNextLine) &&
                  !nextNextLine.match(/^(Дата|ПРИСУТСТВОВАЛИ|УЧАСТНИКИ|\*\*)/i) &&
                  nextNextLine.length > 5 &&
                  !nextNextLine.startsWith('#')) {
                // Добавляем продолжение названия
                let continuation = nextNextLine;
                continuation = continuation.replace(/\*\*(.+?)\*\*/g, '$1');
                continuation = continuation.replace(/_(.+?)_/g, '$1');
                title = title + ' ' + continuation;
              }
            }
            
            // Если название найдено, возвращаем его
            if (title && title.length > 5) {
              return title;
            }
          }
          
          // Если встретили "Дата:" или другие метаданные - название уже прошло
          if (nextLine.match(/^(Дата|ПРИСУТСТВОВАЛИ|УЧАСТНИКИ):/i) || nextLine.startsWith('**Дата:**')) {
            break;
          }
        }
      }
    }
    
    // Fallback: используем тип протокола
    return protocol.protocol_type || "Протокол";
  };

  if (viewingProtocol && selectedProtocol) {
    return (
      <ProtocolViewer
        protocol={selectedProtocol}
        onBack={() => {
          setViewingProtocol(false);
          setSelectedProtocol(null);
          loadProtocols(); // Refresh list when returning
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-900">Мои протоколы</h2>
          <p className="text-slate-600 mt-1">Список всех созданных протоколов</p>
        </div>
        <Button
          onClick={onCreateNew}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          Создать новый
        </Button>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="text-slate-600 mt-4">Загрузка протоколов...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-600">{error}</p>
            <Button
              onClick={loadProtocols}
              variant="outline"
              className="mt-4 border-red-300 text-red-700 hover:bg-red-100"
            >
              Попробовать снова
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!loading && !error && protocols.length === 0 && (
        <Card>
          <CardContent className="pt-12 pb-12 text-center">
            <FileText className="h-16 w-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-900 mb-2">
              Нет протоколов
            </h3>
            <p className="text-slate-600 mb-6">
              Создайте первый протокол, загрузив аудиофайл
            </p>
            <Button
              onClick={onCreateNew}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              Создать протокол
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Protocols Grid */}
      {!loading && !error && protocols.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {protocols.map((protocol) => {
            const protocolContent = protocolsWithContent.get(protocol.id);
            const protocolTitle = extractProtocolTitle(protocol, protocolContent);
            
            return (
            <Card
              key={protocol.id}
              className="hover:shadow-lg transition-shadow cursor-pointer border-slate-200"
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <FileText className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg font-semibold text-slate-900 line-clamp-2">
                        {protocolTitle}
                      </CardTitle>
                      <CardDescription className="mt-1 text-sm text-slate-600">
                        {formatDate(protocol.created_at)}
                      </CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Summary */}
                <p className="text-sm text-slate-700 line-clamp-2 mb-4">
                  {protocol.summary || "Нет описания"}
                </p>

                {/* Metadata */}
                <div className="space-y-2 text-sm text-slate-600 mb-4">
                  {protocol.duration && (
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-slate-400" />
                      <span>{protocol.duration}</span>
                    </div>
                  )}
                  {protocol.participants && protocol.participants.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-slate-400" />
                      <span>
                        {protocol.participants.length}{" "}
                        {protocol.participants.length === 1 ? "участник" : "участников"}
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-4 border-t border-slate-200">
                  <Button
                    onClick={() => handleView(protocol)}
                    variant="outline"
                    className="flex-1 border-slate-300 hover:bg-slate-50"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Открыть
                  </Button>
                  <Button
                    onClick={() => handleDelete(protocol.id)}
                    variant="outline"
                    className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить протокол?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить. Протокол будет удален навсегда.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setProtocolToDelete(null)}>
              Отмена
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
