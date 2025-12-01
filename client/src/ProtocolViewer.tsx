import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Edit2, ArrowLeft, FileText, Users, Clock, Calendar } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { formatProtocolContent, formatProtocolSummary, formatTranscript } from "@/lib/protocolFormatter";
import { Document, Packer, Paragraph, TextRun, AlignmentType, Table, TableRow, TableCell, WidthType } from "docx";
import { getProtocols } from "@/lib/api";

interface ProtocolViewerProps {
  protocol: {
    type: string;
    fileName: string;
    duration: string;
    participants: string[];
    date: string;
    content: string;
    summary: string;
    decisions: string[];
    transcript?: string;
    protocolType?: string;
    contentJson?: string; // Должен содержать ВЕСЬ объект protocol от LLM как строку
    participantsData?: Array<{ organization?: string; position?: string; name: string }>;
  };
  onBack: () => void;
}

// Формат даты: "2025-11-23" → "23.11.2025"
function formatDateForProtocol(dateStr: string): string {
  if (!dateStr || dateStr === "Н/Д") return "Н/Д";
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
  } catch {
    return dateStr;
  }
}

// Извлекает структуру из contentJson (ожидается ВЕСЬ protocol от LLM)
function buildProtocolJson(protocol: ProtocolViewerProps['protocol']): any {
  if (protocol.contentJson) {
    try {
      // Парсим полный объект protocol от LLM
      const fullProtocol = JSON.parse(protocol.contentJson);
      console.log("Full protocol from contentJson:", fullProtocol);
      console.log("assignments_table from contentJson:", fullProtocol.assignments_table);

      const result = {
        metadata: {
          protocol_number: fullProtocol.protocol_number ?? fullProtocol.metadata?.protocol_number ?? "Н/Д",
          meeting_title: fullProtocol.meeting_title ?? fullProtocol.metadata?.meeting_title ?? "Н/Д",
          date: fullProtocol.date ?? fullProtocol.metadata?.date ?? protocol.date ?? "Н/Д",
          city: fullProtocol.city ?? fullProtocol.metadata?.city ?? "Н/Д"
        },
        summary: fullProtocol.summary ?? "Н/Д",
        decisions: Array.isArray(fullProtocol.decisions) ? fullProtocol.decisions : [fullProtocol.decisions || "Н/Д"],
        attendees_table: fullProtocol.attendees_table ?? protocol.participantsData ?? [],
        assignments_table: Array.isArray(fullProtocol.assignments_table) ? fullProtocol.assignments_table : (fullProtocol.assignments_table ? [fullProtocol.assignments_table] : [])
      };
      
      console.log("Built result assignments_table:", result.assignments_table);
      return result;
    } catch (e) {
      console.error("Failed to parse contentJson:", e);
      console.error("contentJson value:", protocol.contentJson);
    }
  }

  // Fallback
  console.log("Using fallback - no contentJson or parse failed");
  return {
    metadata: {
      protocol_number: "Н/Д",
      meeting_title: protocol.protocolType || "Совещание",
      date: protocol.date || "Н/Д",
      city: "Н/Д"
    },
    summary: protocol.summary || "Н/Д",
    decisions: Array.isArray(protocol.decisions) ? protocol.decisions : ["Н/Д"],
    attendees_table: protocol.participantsData || protocol.participants.map(p => ({ name: p, position: "Н/Д" })),
    assignments_table: []
  };
}

export default function ProtocolViewer({ protocol, onBack }: ProtocolViewerProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(protocol.content);
  const [editedSummary, setEditedSummary] = useState(protocol.summary);
  const [editedDecisions, setEditedDecisions] = useState(protocol.decisions.join("\n"));
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      // Получаем количество существующих протоколов для нумерации
      let protocolNumber = "Н/Д";
      try {
        const existingProtocols = await getProtocols();
        protocolNumber = String((existingProtocols.length || 0) + 1);
      } catch (err) {
        console.warn("Не удалось получить список протоколов для нумерации:", err);
      }

      const parsed = buildProtocolJson(protocol);
      // Используем вычисленный номер протокола
      parsed.metadata.protocol_number = protocolNumber;
      
      console.log("Parsed protocol for docx:", parsed); // отладка
      console.log("assignments_table length:", parsed.assignments_table?.length);
      console.log("assignments_table content:", JSON.stringify(parsed.assignments_table, null, 2));

      const makeParagraph = (text: string, opts: any = {}) =>
        new Paragraph({ text, spacing: { after: 150 }, ...opts });

      // === Таблица участников ===
      const attendeesTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, children: [makeParagraph("Должность", { bold: true })] }),
              new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, children: [makeParagraph("Бизнес-эксперт (по Skype):", { bold: true })] }),
            ],
          }),
          ...(parsed.attendees_table || []).map((a: any) => {
            const org = a.organization && a.organization !== "Н/Д" ? `${a.organization}\n` : "";
            const pos = a.position && a.position !== "Н/Д" ? a.position : "";
            const fullPosition = org + pos || "Н/Д";
            return new TableRow({
              children: [
                new TableCell({ children: [makeParagraph(fullPosition)] }),
                new TableCell({ children: [makeParagraph(a.name || "Н/Д")] }),
              ],
            });
          }),
        ],
      });

      // === Таблица поручений ===
      const assignmentsRows = Array.isArray(parsed.assignments_table) && parsed.assignments_table.length > 0
        ? parsed.assignments_table.map((a: any, idx: number) => {
            console.log("Processing assignment:", a, "index:", idx);
            return new TableRow({
              children: [
                new TableCell({ children: [makeParagraph(String(a.no ?? idx + 1))] }),
                new TableCell({ children: [makeParagraph(a.task ?? "Н/Д")] }),
                new TableCell({ children: [makeParagraph(a.responsible ?? "Н/Д")] }),
                new TableCell({ children: [makeParagraph(a.due_date ? formatDateForProtocol(a.due_date) : "Н/Д")] }),
              ],
            });
          })
        : [];
      
      console.log("Assignments rows count:", assignmentsRows.length);
      
      const assignmentsTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({ children: [makeParagraph("№", { bold: true })] }),
              new TableCell({ children: [makeParagraph("Поручение", { bold: true })] }),
              new TableCell({ children: [makeParagraph("Ответственный", { bold: true })] }),
              new TableCell({ children: [makeParagraph("Срок", { bold: true })] }),
            ],
          }),
          ...assignmentsRows,
        ],
      });

      const dateCityLine = `${formatDateForProtocol(parsed.metadata.date)}   ${parsed.metadata.city}`;

      const doc = new Document({
        sections: [
          {
            children: [
              // Заголовок
              makeParagraph(`ПРОТОКОЛ № ${parsed.metadata.protocol_number}`, {
                alignment: AlignmentType.CENTER,
                heading: "Title",
                spacing: { after: 200 },
              }),
              makeParagraph(`Рабочая встреча «${parsed.metadata.meeting_title}»`, {
                alignment: AlignmentType.CENTER,
                spacing: { after: 200 },
              }),
              makeParagraph(dateCityLine, {
                alignment: AlignmentType.LEFT,
                spacing: { after: 300 },
              }),

              // Участники
              makeParagraph("ПРИСУТСТВОВАЛИ", { bold: true, spacing: { after: 150 } }),
              attendeesTable,

              // Повестка
              makeParagraph("ПОВЕСТКА:", { bold: true, spacing: { before: 300, after: 150 } }),
              makeParagraph(parsed.summary),

              // Рассмотрели
              makeParagraph("РАССМОТРЕЛИ:", { bold: true, spacing: { before: 300, after: 150 } }),
              ...(Array.isArray(parsed.decisions)
                ? parsed.decisions.map((d: string) => makeParagraph(d))
                : [makeParagraph("Н/Д")]),

              // Решили
              makeParagraph("РЕШИЛИ:", { bold: true, spacing: { before: 300, after: 150 } }),
              makeParagraph("Зафиксировать поручения по итогам встречи:", { spacing: { after: 150 } }),
              assignmentsTable,

              // Подпись
              makeParagraph("", { spacing: { before: 400, after: 100 } }),
              makeParagraph("Протокол подготовлен: Суяргулов И.Н.", { spacing: { after: 100 } }),
              makeParagraph("Контактный e-mail: suyargulov@teamidea.ru", { spacing: { after: 100 } }),
              makeParagraph(`Дата: ${formatDateForProtocol(parsed.metadata.date)}`),
            ],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Протокол_${parsed.metadata.protocol_number || Date.now()}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error("Ошибка генерации Word:", err);
    } finally {
      setIsDownloading(false);
    }
  };

  const PROTOCOL_NAMES: Record<string, string> = {
    "standard-meeting": "Протокол совещания",
    "board-meeting": "Протокол заседания совета директоров",
    "general-assembly": "Протокол общего собрания",
    "technical-meeting": "Протокол технического совещания",
    "audit-meeting": "Протокол аудиторского совещания",
    "hr-meeting": "Протокол HR совещания"
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <Button variant="ghost" onClick={onBack} className="text-slate-600 hover:text-slate-900 mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> Загрузить новый файл
        </Button>
        <h2 className="text-3xl font-bold text-slate-900">Протокол готов</h2>
        <p className="text-slate-600">
          Тип: <strong>{PROTOCOL_NAMES[protocol.type]}</strong>
        </p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-white border-slate-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-slate-600">Файл</p>
                <p className="text-sm font-semibold text-slate-900 truncate">{protocol.fileName}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Clock className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-slate-600">Длительность</p>
                <p className="text-sm font-semibold text-slate-900">{protocol.duration}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <Users className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-slate-600">Участники</p>
                <p className="text-sm font-semibold text-slate-900">{protocol.participants.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                <Calendar className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-slate-600">Дата</p>
                <p className="text-sm font-semibold text-slate-900">{protocol.date}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Content Tabs */}
      <Card className="border-slate-200">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Содержание протокола</CardTitle>
            <CardDescription>Просмотр и редактирование сформированного протокола</CardDescription>
          </div>
          <Button
            variant={isEditing ? "default" : "outline"}
            size="sm"
            onClick={() => setIsEditing(!isEditing)}
            className={isEditing ? "bg-blue-600 hover:bg-blue-700" : "border-slate-300"}
          >
            <Edit2 className="h-4 w-4 mr-2" />
            {isEditing ? "Готово" : "Редактировать"}
          </Button>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="content" className="space-y-4">
            <TabsList className={`grid w-full ${protocol.transcript ? 'grid-cols-4' : 'grid-cols-3'} bg-slate-100`}>
              <TabsTrigger value="content">Содержание</TabsTrigger>
              <TabsTrigger value="summary">Резюме</TabsTrigger>
              <TabsTrigger value="decisions">Решения</TabsTrigger>
              {protocol.transcript && <TabsTrigger value="transcript">Стенограмма</TabsTrigger>}
            </TabsList>

            <TabsContent value="content" className="space-y-4">
              {isEditing ? (
                <Textarea
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  className="min-h-64 border-slate-300 focus:border-blue-500"
                />
              ) : (
                <div className="bg-slate-50 p-6 rounded-lg border border-slate-200 min-h-64 text-slate-700 pl-8">
                  {formatProtocolContent(editedContent)}
                </div>
              )}
            </TabsContent>

            <TabsContent value="summary" className="space-y-4">
              {isEditing ? (
                <Textarea
                  value={editedSummary}
                  onChange={(e) => setEditedSummary(e.target.value)}
                  className="min-h-64 border-slate-300 focus:border-blue-500"
                />
              ) : (
                <div className="bg-slate-50 p-6 rounded-lg border border-slate-200 min-h-64 text-slate-700">
                  {formatProtocolSummary(editedSummary)}
                </div>
              )}
            </TabsContent>

            <TabsContent value="decisions" className="space-y-4">
              {isEditing ? (
                <Textarea
                  value={editedDecisions}
                  onChange={(e) => setEditedDecisions(e.target.value)}
                  className="min-h-64 border-slate-300 focus:border-blue-500"
                />
              ) : (
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-2">
                  {editedDecisions.split("\n").map((d, i) => d.trim() ? (
                    <div key={i} className="flex gap-3">
                      <span className="text-blue-600">•</span>
                      <span className="text-slate-700">{d.trim()}</span>
                    </div>
                  ) : null)}
                </div>
              )}
            </TabsContent>

            {protocol.transcript && (
              <TabsContent value="transcript" className="space-y-4">
                <div className="bg-slate-50 p-6 rounded-lg border border-slate-200 min-h-64 text-slate-700 max-h-96 overflow-y-auto pl-8">
                  {formatTranscript(protocol.transcript)}
                </div>
              </TabsContent>
            )}
          </Tabs>
        </CardContent>
      </Card>

      {/* Participants List */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-lg">Участники совещания</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {protocol.participants.map((p, i) => (
              <div key={i} className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-xs font-semibold text-blue-600">
                  {p.charAt(0)}
                </div>
                <span className="text-slate-700">{p}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Buttons */}
      <div className="flex gap-3">
        <Button onClick={onBack} variant="outline" className="flex-1 border-slate-300">
          <ArrowLeft className="h-4 w-4 mr-2" /> Загрузить другой файл
        </Button>
        <Button onClick={handleDownload} disabled={isDownloading} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
          <Download className="h-4 w-4 mr-2" />
          {isDownloading ? "Скачивание..." : "Скачать Word документ"}
        </Button>
      </div>

      {/* Success Info */}
      <Card className="bg-green-50 border-green-200">
        <CardHeader>
          <CardTitle className="text-green-900 text-base">Протокол успешно сформирован</CardTitle>
        </CardHeader>
        <CardContent className="text-green-800 text-sm space-y-2">
          <p>✓ Протокол готов к скачиванию в формате Word</p>
          <p>✓ Вы можете отредактировать содержание перед скачиванием</p>
          <p>✓ Документ содержит всю необходимую информацию о совещании</p>
        </CardContent>
      </Card>
    </div>
  );
}