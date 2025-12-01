import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { FileText, Trash2, Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
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

interface ProtocolListTableProps {
  onCreateNew: () => void;
  onViewingChange?: (isViewing: boolean) => void;
}

type SortField = "date" | "duration" | "participants" | null;
type SortDirection = "asc" | "desc";

export default function ProtocolListTable({ onCreateNew, onViewingChange }: ProtocolListTableProps) {
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [protocolToDelete, setProtocolToDelete] = useState<string | null>(null);
  const [selectedProtocol, setSelectedProtocol] = useState<any>(null);
  const [viewingProtocol, setViewingProtocol] = useState(false);
  const [protocolsWithContent, setProtocolsWithContent] = useState<Map<string, string>>(new Map());
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

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

  // Уведомляем родительский компонент о просмотре протокола
  useEffect(() => {
    onViewingChange?.(viewingProtocol);
  }, [viewingProtocol, onViewingChange]);

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
        fileName: `${protocol.id}.mp3`,
        duration: fullProtocol.protocol?.duration || protocol.duration,
        participants: fullProtocol.protocol?.participants?.map((p: any) => p.name || p) || protocol.participants.map((p: any) => p.name || p),
        participantsData: fullProtocol.protocol?.participants || protocol.participants,
        date: fullProtocol.created_at || protocol.created_at,
        content: fullProtocol.protocol?.content || "",
        contentJson: fullProtocol.protocol?.content || "", // Используем content как contentJson для парсинга
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

  const parseDuration = (duration: string): number => {
    // Парсит длительность в секунды для сортировки
    // "1 мин 50 сек" -> 110 секунд
    // "45 мин" -> 2700 секунд
    let totalSeconds = 0;
    const minMatch = duration.match(/(\d+)\s*мин/i);
    const secMatch = duration.match(/(\d+)\s*сек/i);
    if (minMatch) totalSeconds += parseInt(minMatch[1]) * 60;
    if (secMatch) totalSeconds += parseInt(secMatch[1]);
    return totalSeconds;
  };

  /**
   * Извлекает название протокола из meeting_title или content (то что формирует LLM)
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
        // Пропускаем пустые строки и разделители "---"
        for (let j = i + 1; j < lines.length && j < i + 10; j++) {
          const nextLine = lines[j].trim();
          
          if (!nextLine) continue;
          if (nextLine === '---' || /^-{3,}$/.test(nextLine)) continue;
          
          // Если встретили следующую строку с "#" - это название встречи!
          if (nextLine.startsWith('# ')) {
            let title = nextLine.substring(2).trim();
            title = title.replace(/\*\*(.+?)\*\*/g, '$1');
            title = title.replace(/_(.+?)_/g, '$1');
            
            if (j + 1 < lines.length) {
              const nextNextLine = lines[j + 1].trim();
              if (nextNextLine && 
                  nextNextLine !== '---' && 
                  !/^-{3,}$/.test(nextNextLine) &&
                  !nextNextLine.match(/^(Дата|ПРИСУТСТВОВАЛИ|УЧАСТНИКИ|\*\*)/i) &&
                  nextNextLine.length > 5 &&
                  !nextNextLine.startsWith('#')) {
                let continuation = nextNextLine;
                continuation = continuation.replace(/\*\*(.+?)\*\*/g, '$1');
                continuation = continuation.replace(/_(.+?)_/g, '$1');
                title = title + ' ' + continuation;
              }
            }
            
            if (title && title.length > 5) {
              return title;
            }
          }
          
          if (nextLine.match(/^(Дата|ПРИСУТСТВОВАЛИ|УЧАСТНИКИ):/i) || nextLine.startsWith('**Дата:**')) {
            break;
          }
        }
      }
    }
    
    return protocol.protocol_type || "Протокол";
  };

  // Фильтрация и сортировка
  const filteredAndSortedProtocols = useMemo(() => {
    let result = [...protocols];

    // Фильтрация по поисковому запросу
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((protocol) => {
        const content = protocolsWithContent.get(protocol.id);
        const title = extractProtocolTitle(protocol, content).toLowerCase();
        return title.includes(query);
      });
    }

    // Сортировка
    if (sortField) {
      result.sort((a, b) => {
        let comparison = 0;
        
        if (sortField === "date") {
          const dateA = new Date(a.created_at).getTime();
          const dateB = new Date(b.created_at).getTime();
          comparison = dateA - dateB;
        } else if (sortField === "duration") {
          const durA = parseDuration(a.duration);
          const durB = parseDuration(b.duration);
          comparison = durA - durB;
        } else if (sortField === "participants") {
          const countA = a.participants?.length || 0;
          const countB = b.participants?.length || 0;
          comparison = countA - countB;
        }

        return sortDirection === "asc" ? comparison : -comparison;
      });
    }

    return result;
  }, [protocols, searchQuery, sortField, sortDirection, protocolsWithContent]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Переключаем направление сортировки
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // Новое поле - сортируем по убыванию
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4 ml-1 text-slate-400" />;
    }
    return sortDirection === "asc" 
      ? <ArrowUp className="h-4 w-4 ml-1 text-blue-600" />
      : <ArrowDown className="h-4 w-4 ml-1 text-blue-600" />;
  };

  if (viewingProtocol && selectedProtocol) {
    return (
      <ProtocolViewer
        protocol={selectedProtocol}
        onBack={() => {
          setViewingProtocol(false);
          setSelectedProtocol(null);
          loadProtocols();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-slate-600">Список сохраненных протоколов</p>
        <Button
          onClick={onCreateNew}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          + Создать протокол
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
      {!loading && !error && filteredAndSortedProtocols.length === 0 && (
        <Card>
          <CardContent className="pt-12 pb-12 text-center">
            <FileText className="h-16 w-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-900 mb-2">
              {searchQuery ? "Ничего не найдено" : "Нет протоколов"}
            </h3>
            <p className="text-slate-600 mb-6">
              {searchQuery 
                ? "Попробуйте изменить поисковый запрос"
                : "Создайте первый протокол, загрузив аудиофайл"}
            </p>
            {!searchQuery && (
              <Button
                onClick={onCreateNew}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                + Создать протокол
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Protocols Table */}
      {!loading && !error && filteredAndSortedProtocols.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className={`overflow-y-auto ${filteredAndSortedProtocols.length > 5 ? 'max-h-[600px]' : ''}`}>
            {/* Верхняя декоративная строка */}
            <div className="bg-white h-2 w-full"></div>
            <Table>
              <TableHeader className="sticky top-0 bg-white z-10 border-0">
                <TableRow className="bg-white">
                  <TableHead className="w-[40%] bg-white pl-6">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <Input
                        type="text"
                        placeholder="Поиск..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-7 h-8 text-sm bg-white border-0 focus:border-0 focus:ring-0 shadow-none"
                      />
                    </div>
                  </TableHead>
                  <TableHead className="w-[20%] bg-white">
                    <Button
                      variant="ghost"
                      onClick={() => handleSort("date")}
                      className="h-auto p-0 font-semibold hover:bg-slate-100 text-slate-900"
                    >
                      Дата создания
                      {getSortIcon("date")}
                    </Button>
                  </TableHead>
                  <TableHead className="w-[15%] bg-white">
                    <Button
                      variant="ghost"
                      onClick={() => handleSort("duration")}
                      className="h-auto p-0 font-semibold hover:bg-slate-100 text-slate-900"
                    >
                      Длительность
                      {getSortIcon("duration")}
                    </Button>
                  </TableHead>
                  <TableHead className="w-[15%] bg-white">
                    <Button
                      variant="ghost"
                      onClick={() => handleSort("participants")}
                      className="h-auto p-0 font-semibold hover:bg-slate-100 text-slate-900"
                    >
                      Участники
                      {getSortIcon("participants")}
                    </Button>
                  </TableHead>
                  <TableHead className="w-[10%] text-right bg-white text-slate-900 font-semibold pr-6">Действие</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedProtocols.slice(0, 10).map((protocol) => {
                  const protocolContent = protocolsWithContent.get(protocol.id);
                  const protocolTitle = extractProtocolTitle(protocol, protocolContent);
                  
                  return (
                    <TableRow 
                      key={protocol.id} 
                      className="hover:bg-slate-50 cursor-pointer"
                      onClick={(e) => {
                        // Не открываем если клик по кнопке удаления
                        const target = e.target as HTMLElement;
                        if (target.closest('button[data-action="delete"]')) {
                          return;
                        }
                        handleView(protocol);
                      }}
                    >
                      <TableCell className="pl-6">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <FileText className="h-4 w-4 text-blue-600" />
                          </div>
                          <span className="font-medium text-slate-900 line-clamp-2 min-w-0">
                            {protocolTitle}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {formatDate(protocol.created_at)}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {protocol.duration || "Неизвестно"}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {protocol.participants?.length || 0}
                      </TableCell>
                      <TableCell className="pr-6">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(protocol.id);
                            }}
                            variant="ghost"
                            size="sm"
                            className="h-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                            data-action="delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {/* Нижняя декоративная строка */}
            <div className="bg-white h-12 w-full"></div>
          </div>
        </Card>
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
