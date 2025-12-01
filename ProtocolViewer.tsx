import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Edit2, ArrowLeft, FileText, Users, Clock, Calendar } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { formatProtocolContent, formatProtocolSummary, formatTranscript } from "@/lib/protocolFormatter";
import { Document, Packer, Paragraph, TextRun, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle } from "docx";
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
    participantsData?: Array<{ organization?: string; role?: string; name: string }>;
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

// Формат даты для отображения: "2025-11-23T17:04:50.734617" → "2025-11-23 17:04" (UTC+3)
function formatDateForDisplay(dateStr: string): string {
  if (!dateStr || dateStr === "Н/Д") return "Н/Д";
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "Н/Д";
    
    // Добавляем 3 часа для UTC+3
    const utc3Date = new Date(date.getTime() + 3 * 60 * 60 * 1000);
    
    const year = utc3Date.getUTCFullYear();
    const month = String(utc3Date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(utc3Date.getUTCDate()).padStart(2, "0");
    const hours = String(utc3Date.getUTCHours()).padStart(2, "0");
    const minutes = String(utc3Date.getUTCMinutes()).padStart(2, "0");
    
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  } catch {
    return "Н/Д";
  }
}

// Извлекает структуру из contentJson или content (ожидается ВЕСЬ protocol от LLM)
function buildProtocolJson(protocol: ProtocolViewerProps['protocol']): any {
  // Сначала пробуем contentJson
  let jsonString: string | null = null;
  let source = "unknown";
  
  if (protocol.contentJson) {
    jsonString = protocol.contentJson;
    source = "contentJson";
  } else if (protocol.content) {
    // Проверяем, является ли content JSON строкой
    const trimmedContent = protocol.content.trim();
    if (trimmedContent.startsWith("{") || trimmedContent.startsWith("[")) {
      jsonString = trimmedContent;
      source = "content";
    }
  }
  
  if (jsonString) {
    try {
      // Парсим полный объект protocol от LLM
      const fullProtocol = JSON.parse(jsonString);
      console.log(`Full protocol from ${source}:`, fullProtocol);
      console.log(`assignments_table from ${source}:`, fullProtocol.assignments_table);
      console.log(`protocol.participantsData:`, protocol.participantsData);
      console.log(`fullProtocol.attendees_table:`, fullProtocol.attendees_table);
      console.log(`fullProtocol.participants:`, fullProtocol.participants);

      // Извлекаем данные участников из разных возможных полей и объединяем с participantsData
      let attendees_data = [];
      const participantsDataMap = new Map();
      
      // Создаем карту участников из protocol.participantsData для объединения данных
      if (protocol.participantsData && Array.isArray(protocol.participantsData)) {
        console.log(`Building participantsDataMap from protocol.participantsData (${protocol.participantsData.length} items)`);
        protocol.participantsData.forEach((p: any) => {
          const name = p.name || "Н/Д";
          // Сохраняем только валидные данные (не "Н/Д" и не пустые)
          const org = p.organization && p.organization !== "Н/Д" && p.organization.trim() ? p.organization : "";
          const role = (p.role || p.position) && (p.role || p.position) !== "Н/Д" && (p.role || p.position).trim() ? (p.role || p.position) : "";
          console.log(`  Adding to map: ${name} -> org="${org}", role="${role}"`);
          participantsDataMap.set(name, {
            organization: org,
            role: role
          });
        });
        console.log(`participantsDataMap size: ${participantsDataMap.size}`, Array.from(participantsDataMap.entries()));
      }
      
      if (fullProtocol.attendees_table && Array.isArray(fullProtocol.attendees_table)) {
        console.log(`Using fullProtocol.attendees_table (${fullProtocol.attendees_table.length} items)`);
        // Объединяем данные из attendees_table с данными из participantsData
        attendees_data = fullProtocol.attendees_table.map((a: any) => {
          const name = a.name || "Н/Д";
          const participantInfo = participantsDataMap.get(name);
          console.log(`  Processing attendee: ${name}, participantInfo:`, participantInfo);
          
          // Получаем organization: если в attendees_table есть валидное значение, используем его, иначе берем из participantInfo
          let organization = "";
          if (a.organization && a.organization !== "Н/Д" && a.organization.trim()) {
            organization = a.organization;
            console.log(`    Using organization from attendees_table: "${organization}"`);
          } else if (participantInfo?.organization) {
            organization = participantInfo.organization;
            console.log(`    Using organization from participantInfo: "${organization}"`);
          } else {
            console.log(`    No organization found for ${name}`);
          }
          
          // Получаем role/position: если в attendees_table есть валидное значение, используем его, иначе берем из participantInfo
          let role = "";
          const attendeeRole = a.role || a.position;
          if (attendeeRole && attendeeRole !== "Н/Д" && attendeeRole.trim()) {
            role = attendeeRole;
            console.log(`    Using role from attendees_table: "${role}"`);
          } else if (participantInfo?.role) {
            role = participantInfo.role;
            console.log(`    Using role from participantInfo: "${role}"`);
          } else {
            console.log(`    No role found for ${name}`);
          }
          
          const result = {
            name: name,
            organization: organization,
            role: role
          };
          console.log(`  Final result for ${name}:`, result);
          return result;
        });
      } else if (fullProtocol.participants && Array.isArray(fullProtocol.participants)) {
        // Если LLM вернул participants, преобразуем их в формат attendees_table
        console.log(`Using fullProtocol.participants, mapping to attendees_table`);
        attendees_data = fullProtocol.participants.map((p: any) => {
          const name = p.name || p.id || "Н/Д";
          const participantInfo = participantsDataMap.get(name);
          
          // Получаем organization: если в participants есть валидное значение, используем его, иначе берем из participantInfo
          let organization = "";
          if (p.organization && p.organization !== "Н/Д" && p.organization.trim()) {
            organization = p.organization;
          } else if (participantInfo?.organization) {
            organization = participantInfo.organization;
          }
          
          // Получаем role: если в participants есть валидное значение, используем его, иначе берем из participantInfo
          let role = "";
          if (p.role && p.role !== "Н/Д" && p.role.trim()) {
            role = p.role;
          } else if (participantInfo?.role) {
            role = participantInfo.role;
          }
          
          return {
            name: name,
            organization: organization,
            role: role
          };
        });
      } else if (protocol.participantsData && Array.isArray(protocol.participantsData)) {
        // Используем participantsData из протокола (с organization и role)
        console.log(`Using protocol.participantsData`);
        attendees_data = protocol.participantsData.map((p: any) => {
          // Сохраняем исходные значения, не заменяя пустые на "Н/Д" сразу
          const org = p.organization && p.organization !== "Н/Д" && p.organization !== "000" ? p.organization : (p.organization === "000" ? "" : "");
          const role = p.role || "";
          console.log(`Participant ${p.name}: organization="${org}", role="${role}"`);
          return {
            name: p.name || "Н/Д",
            organization: org,
            role: role
          };
        });
      } else {
        console.log(`No attendees data found, using empty array`);
      }
      
      console.log(`Final attendees_data:`, attendees_data);

      const result = {
        metadata: {
          protocol_number: fullProtocol.protocol_number ?? fullProtocol.metadata?.protocol_number ?? "Н/Д",
          meeting_title: fullProtocol.meeting_title ?? fullProtocol.metadata?.meeting_title ?? "Н/Д",
          date: fullProtocol.date ?? fullProtocol.metadata?.date ?? protocol.date ?? "Н/Д",
          city: fullProtocol.city ?? fullProtocol.metadata?.city ?? "г. Москва"
        },
        summary: fullProtocol.summary ?? "Н/Д",
        decisions: Array.isArray(fullProtocol.decisions) ? fullProtocol.decisions : [fullProtocol.decisions || "Н/Д"],
        attendees_table: attendees_data.length > 0 ? attendees_data : (protocol.participantsData || []),
        assignments_table: Array.isArray(fullProtocol.assignments_table) ? fullProtocol.assignments_table : (fullProtocol.assignments_table ? [fullProtocol.assignments_table] : [])
      };
      
      console.log(`Built result from ${source}, attendees_table:`, result.attendees_table);
      console.log(`Built result from ${source}, assignments_table:`, result.assignments_table);
      return result;
    } catch (e) {
      console.error(`Failed to parse ${source}:`, e);
      console.error(`${source} value:`, jsonString?.substring(0, 200));
    }
  }

  // Fallback
  console.log("Using fallback - no JSON found in contentJson or content");
  // Преобразуем participantsData в правильный формат
  let fallback_attendees = [];
  if (protocol.participantsData && Array.isArray(protocol.participantsData)) {
    fallback_attendees = protocol.participantsData.map((p: any) => ({
      name: p.name || "Н/Д",
      organization: p.organization || "",
      role: p.role || ""
    }));
  } else if (protocol.participants && Array.isArray(protocol.participants)) {
    fallback_attendees = protocol.participants.map((p: any) => {
      if (typeof p === 'string') {
        return { name: p, role: "", organization: "" };
      }
      return {
        name: p.name || p || "Н/Д",
        organization: p.organization || "",
        role: p.role || ""
      };
    });
  }
  
  return {
    metadata: {
      protocol_number: "Н/Д",
      meeting_title: protocol.protocolType || "Совещание",
      date: protocol.date || "Н/Д",
      city: "г. Москва"
    },
    summary: protocol.summary || "Н/Д",
    decisions: Array.isArray(protocol.decisions) ? protocol.decisions : ["Н/Д"],
    attendees_table: fallback_attendees,
    assignments_table: []
  };
}

export default function ProtocolViewer({ protocol, onBack }: ProtocolViewerProps) {
  const [editedContent, setEditedContent] = useState(protocol.content);
  const [editedSummary, setEditedSummary] = useState(protocol.summary);
  const [editedDecisions, setEditedDecisions] = useState(protocol.decisions.join("\n"));
  const [editedMeetingTitle, setEditedMeetingTitle] = useState("");
  const [editedAttendees, setEditedAttendees] = useState<Array<{organization?: string; role?: string; name: string}>>([]);
  const [editedAssignments, setEditedAssignments] = useState<Array<{no?: number; task: string; responsible: string; due_date: string}>>([]);
  const [editedDate, setEditedDate] = useState<string>("");
  const [editedCity, setEditedCity] = useState<string>("");
  const [protocolNumber, setProtocolNumber] = useState<string>("Н/Д");
  const [isDownloading, setIsDownloading] = useState(false);

  // Инициализируем данные из протокола и получаем номер протокола
  useEffect(() => {
    const parsed = buildProtocolJson(protocol);
    setEditedSummary(parsed.summary || protocol.summary);
    if (Array.isArray(parsed.decisions) && parsed.decisions.length > 0) {
      setEditedDecisions(parsed.decisions.join("\n"));
    } else {
      setEditedDecisions(protocol.decisions.join("\n"));
    }
    setEditedMeetingTitle(parsed.metadata.meeting_title || "Н/Д");
    setEditedAttendees(parsed.attendees_table || protocol.participantsData || protocol.participants.map(p => ({ name: p, role: "Н/Д", organization: "Н/Д" })));
    setEditedAssignments(parsed.assignments_table || []);
    setEditedDate(formatDateForProtocol(parsed.metadata.date || protocol.date));
    setEditedCity(parsed.metadata.city || "г. Москва");
    
    // Получаем номер протокола
    getProtocols().then(existingProtocols => {
      setProtocolNumber(String((existingProtocols.length || 0) + 1));
    }).catch(err => {
      console.warn("Не удалось получить список протоколов для нумерации:", err);
    });
  }, [protocol]);

  // Функция для генерации документа (используется и для скачивания, и для предпросмотра)
  const generateDocument = async () => {
    // Используем сохраненный номер протокола или получаем заново
    let currentProtocolNumber = protocolNumber;
    if (currentProtocolNumber === "Н/Д") {
      try {
        const existingProtocols = await getProtocols();
        currentProtocolNumber = String((existingProtocols.length || 0) + 1);
        setProtocolNumber(currentProtocolNumber);
      } catch (err) {
        console.warn("Не удалось получить список протоколов для нумерации:", err);
      }
    }

    const parsed = buildProtocolJson(protocol);
    // Используем вычисленный номер протокола
    parsed.metadata.protocol_number = currentProtocolNumber;
    
    // Используем отредактированные данные
    if (editedSummary && editedSummary.trim()) {
      parsed.summary = editedSummary;
    }
    if (editedDecisions && editedDecisions.trim()) {
      const decisionsArray = editedDecisions.split("\n").filter(d => d.trim());
      if (decisionsArray.length > 0) {
        parsed.decisions = decisionsArray;
      }
    }
    if (editedMeetingTitle && editedMeetingTitle.trim()) {
      parsed.metadata.meeting_title = editedMeetingTitle;
    }
    if (editedAttendees && editedAttendees.length > 0) {
      parsed.attendees_table = editedAttendees;
    }
    if (editedAssignments && editedAssignments.length > 0) {
      parsed.assignments_table = editedAssignments;
    }
    if (editedDate && editedDate.trim()) {
      // Пытаемся распарсить дату из формата дд.мм.гггг обратно в исходный формат
      if (editedDate.match(/^\d{2}\.\d{2}\.\d{4}$/)) {
        const [day, month, year] = editedDate.split('.');
        parsed.metadata.date = `${year}-${month}-${day}`;
      } else {
        parsed.metadata.date = editedDate;
      }
    }
    if (editedCity && editedCity.trim()) {
      parsed.metadata.city = editedCity;
    }
    
    console.log("=== PROTOCOL DATA FOR DOCX ===");
    console.log("Has contentJson:", !!protocol.contentJson);
    console.log("Parsed protocol:", parsed);
    console.log("Summary (for ПОВЕСТКА):", parsed.summary);
    console.log("Decisions (for РАССМОТРЕЛИ):", parsed.decisions);
    console.log("Meeting title (for Рабочая встреча):", parsed.metadata.meeting_title);
    console.log("assignments_table length:", parsed.assignments_table?.length);
    console.log("assignments_table content:", JSON.stringify(parsed.assignments_table, null, 2));
    console.log("==============================");

    // Функция для создания параграфа с шрифтом Times New Roman, размер 12
    const makeParagraph = (text: string, opts: any = {}) => {
      const { bold, alignment, ...restOpts } = opts;
      return new Paragraph({
        children: [
          new TextRun({
            text: text,
            font: "Times New Roman",
            size: 24, // размер в half-points (12pt = 24 half-points)
            bold: bold || false,
          }),
        ],
        alignment: alignment || AlignmentType.LEFT, // По умолчанию выравнивание по левому краю
        indent: { left: 0, right: 0, firstLine: 0, hanging: 0 }, // Убираем все отступы
        spacing: { after: 150 },
        ...restOpts,
      });
    };

    // === Таблица участников ===
    // Отступы в ячейках по горизонтали (в twips: 1 см = 567 twips, 0.5 см = 283.5 twips)
    const cellMargins = {
      top: 0,      // Вертикальные отступы оставляем как были
      bottom: 0,   // Вертикальные отступы оставляем как были
      left: 283,   // 0.5 см слева
      right: 283,  // 0.5 см справа
    };
    
    const attendeesTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      indent: { size: 0 }, // Убираем отступ таблицы
      rows: [
        new TableRow({
          children: [
            new TableCell({ 
              width: { size: 50, type: WidthType.PERCENTAGE }, 
              margins: cellMargins,
              children: [makeParagraph("Должность", { bold: true })] 
            }),
            new TableCell({ 
              width: { size: 50, type: WidthType.PERCENTAGE }, 
              margins: cellMargins,
              children: [makeParagraph("Бизнес-эксперт (по Skype):", { bold: true })] 
            }),
          ],
        }),
        ...(parsed.attendees_table || []).map((a: any) => {
          // Получаем организацию и должность, проверяя все возможные поля
          const organization = a.organization || "";
          const role = a.role || a.position || "";
          
          // Формируем полную должность: организация + должность
          const parts: string[] = [];
          if (organization && organization !== "Н/Д" && organization.trim()) {
            parts.push(organization);
          }
          if (role && role !== "Н/Д" && role.trim()) {
            parts.push(role);
          }
          
          const fullPosition = parts.length > 0 ? parts.join("\n") : "Н/Д";
          
          return new TableRow({
            children: [
              new TableCell({ margins: cellMargins, children: [makeParagraph(fullPosition)] }),
              new TableCell({ margins: cellMargins, children: [makeParagraph(a.name || "Н/Д")] }),
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
              new TableCell({ margins: cellMargins, children: [makeParagraph(String(a.no ?? idx + 1))] }),
              new TableCell({ margins: cellMargins, children: [makeParagraph(a.task ?? "Н/Д")] }),
              new TableCell({ margins: cellMargins, children: [makeParagraph(a.responsible ?? "Н/Д")] }),
              new TableCell({ margins: cellMargins, children: [makeParagraph(a.due_date ? formatDateForProtocol(a.due_date) : "Н/Д")] }),
            ],
          });
        })
      : [];
    
    console.log("Assignments rows count:", assignmentsRows.length);
    
    const assignmentsTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      indent: { size: 0 }, // Убираем отступ таблицы
      rows: [
        new TableRow({
          children: [
            new TableCell({ margins: cellMargins, children: [makeParagraph("№", { bold: true })] }),
            new TableCell({ margins: cellMargins, children: [makeParagraph("Поручение", { bold: true })] }),
            new TableCell({ margins: cellMargins, children: [makeParagraph("Ответственный", { bold: true })] }),
            new TableCell({ margins: cellMargins, children: [makeParagraph("Срок", { bold: true })] }),
          ],
        }),
        ...assignmentsRows,
      ],
    });

    const dateText = editedDate || formatDateForProtocol(parsed.metadata.date);
    const cityText = editedCity || parsed.metadata.city;

      const doc = new Document({
        sections: [
          {
            properties: {
              page: {
                margin: {
                  top: 1134,    // 2 см сверху (1 см = 567 twips)
                  bottom: 1134, // 2 см снизу
                  left: 1134,   // 2 см слева
                  right: 1134,  // 2 см справа
                },
              },
            },
            children: [
            // Заголовок
            makeParagraph(`ПРОТОКОЛ № ${parsed.metadata.protocol_number}`, {
                alignment: AlignmentType.CENTER,
              heading: "Title",
              spacing: { after: 200 },
              }),
            makeParagraph(`Рабочая встреча «${parsed.metadata.meeting_title || "Н/Д"}»`, {
                alignment: AlignmentType.CENTER,
              spacing: { after: 200 },
            }),
            // Дата и город в одной строке - используем таблицу для выравнивания с прозрачными границами
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              indent: { size: 0 }, // Убираем отступ таблицы
              borders: {
                top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              },
              rows: [
                new TableRow({
                children: [
                    new TableCell({
                      width: { size: 50, type: WidthType.PERCENTAGE },
                      borders: {
                        top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                        bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                        left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                        right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                      },
                      children: [makeParagraph(dateText, { alignment: AlignmentType.LEFT })],
                    }),
                    new TableCell({
                      width: { size: 50, type: WidthType.PERCENTAGE },
                      borders: {
                        top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                        bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                        left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                        right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                      },
                      children: [makeParagraph(cityText, { alignment: AlignmentType.RIGHT })],
                    }),
                  ],
                }),
              ],
            }),
            makeParagraph("", { spacing: { after: 300 } }),

            // Участники
            makeParagraph("ПРИСУТСТВОВАЛИ", { bold: true, alignment: AlignmentType.LEFT, spacing: { after: 150 } }),
              attendeesTable,
  
            // Повестка
            makeParagraph("ПОВЕСТКА:", { bold: true, alignment: AlignmentType.LEFT, spacing: { before: 300, after: 150 } }),
            makeParagraph(parsed.summary || "Н/Д", { alignment: AlignmentType.LEFT }),

            // Рассмотрели
            makeParagraph("РАССМОТРЕЛИ:", { bold: true, alignment: AlignmentType.LEFT, spacing: { before: 300, after: 150 } }),
            ...(Array.isArray(parsed.decisions) && parsed.decisions.length > 0
              ? parsed.decisions.map((d: string, idx: number) => 
                  makeParagraph(`${idx + 1}. ${d || "Н/Д"}`, { alignment: AlignmentType.LEFT })
                )
              : [makeParagraph("Н/Д", { alignment: AlignmentType.LEFT })]),

            // Решили
            makeParagraph("РЕШИЛИ:", { bold: true, alignment: AlignmentType.LEFT, spacing: { before: 300, after: 150 } }),
            makeParagraph("Зафиксировать поручения по итогам встречи:", { alignment: AlignmentType.LEFT, spacing: { after: 150 } }),
            assignmentsTable,

            // Подпись
            makeParagraph("", { alignment: AlignmentType.LEFT, spacing: { before: 400, after: 100 } }),
            makeParagraph("Протокол подготовлен: Корнаев А.А.", { alignment: AlignmentType.LEFT, spacing: { after: 100 } }),
            makeParagraph("Контактный e-mail: Arsen.Kornaev@contractor.lukoil.com", { alignment: AlignmentType.LEFT, spacing: { after: 100 } }),
            makeParagraph(`Дата: ${formatDateForProtocol(parsed.metadata.date)}`, { alignment: AlignmentType.LEFT }),
            ],
          },
        ],
      });
  
    return { doc, protocolNumber: parsed.metadata.protocol_number };
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const { doc, protocolNumber } = await generateDocument();
      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Протокол_${protocolNumber || Date.now()}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Ошибка генерации Word:", err);
    } finally {
      setIsDownloading(false);
    }
  };

  // Функция для получения данных протокола для отображения
  const getProtocolData = () => {
    const parsed = buildProtocolJson(protocol);
    return {
      protocolNumber: protocolNumber,
      meetingTitle: editedMeetingTitle || parsed.metadata.meeting_title || "Н/Д",
      date: editedDate || formatDateForProtocol(parsed.metadata.date || protocol.date),
      city: editedCity || parsed.metadata.city || "г. Москва",
      summary: editedSummary || parsed.summary || "Н/Д",
      decisions: editedDecisions.split("\n").filter(d => d.trim()).length > 0 
        ? editedDecisions.split("\n").filter(d => d.trim())
        : (parsed.decisions || []),
      attendees: editedAttendees.length > 0 
        ? editedAttendees 
        : (parsed.attendees_table || protocol.participantsData || protocol.participants.map(p => ({ name: p, role: "Н/Д", organization: "Н/Д" }))),
      assignments: editedAssignments.length > 0 
        ? editedAssignments 
        : (parsed.assignments_table || [])
    };
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
              <div className="min-w-0 flex-1">
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
                <p className="text-sm font-semibold text-slate-900">
                  {formatDateForDisplay(protocol.date)}
                </p>
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
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="content" className="space-y-4">
            <TabsList className={`grid w-full ${protocol.transcript ? 'grid-cols-2' : 'grid-cols-1'} bg-slate-100`}>
              <TabsTrigger value="content">Содержание</TabsTrigger>
              {protocol.transcript && <TabsTrigger value="transcript">Стенограмма</TabsTrigger>}
            </TabsList>

            <TabsContent value="content" className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-blue-800">
                  <strong>Редактирование:</strong> Вы можете редактировать текст прямо в документе ниже. Изменения сохраняются автоматически.
                </p>
                </div>
              
              <div 
                className="border border-slate-300 rounded-lg bg-white overflow-auto"
                style={{ 
                  minHeight: '1000px',
                  padding: '60px 80px',
                  backgroundColor: '#ffffff',
                  fontFamily: 'Times New Roman, serif',
                  fontSize: '12pt',
                  lineHeight: '1.5'
                }}
              >
                {(() => {
                  const data = getProtocolData();
                  return (
                    <div className="max-w-full" style={{ fontFamily: 'Times New Roman, serif', fontSize: '12pt' }}>
                      {/* Заголовок */}
                      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                        <h1 style={{ fontWeight: 'bold', fontSize: '14pt', marginBottom: '15px' }}>
                          ПРОТОКОЛ № {data.protocolNumber}
                        </h1>
                        <div
                          contentEditable
                          suppressContentEditableWarning
                          onBlur={(e) => setEditedMeetingTitle(e.currentTarget.textContent?.replace(/Рабочая встреча «|»/g, '') || '')}
                          style={{
                            fontWeight: 'bold',
                            fontSize: '12pt',
                            marginBottom: '15px',
                            padding: '4px',
                            border: '1px dashed #cbd5e1',
                            borderRadius: '4px',
                            outline: 'none',
                            minHeight: '20px'
                          }}
                        >
                          Рабочая встреча «{data.meetingTitle}»
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12pt', marginBottom: '25px' }}>
                          <div
                            contentEditable
                            suppressContentEditableWarning
                            onBlur={(e) => {
                              const dateText = e.currentTarget.textContent || '';
                              setEditedDate(dateText);
                            }}
                            style={{
                              padding: '4px',
                              border: '1px dashed #cbd5e1',
                              borderRadius: '4px',
                              outline: 'none',
                              minHeight: '20px',
                              minWidth: '100px'
                            }}
                          >
                            {data.date}
                          </div>
                          <div
                            contentEditable
                            suppressContentEditableWarning
                            onBlur={(e) => setEditedCity(e.currentTarget.textContent || '')}
                            style={{
                              padding: '4px',
                              border: '1px dashed #cbd5e1',
                              borderRadius: '4px',
                              outline: 'none',
                              minHeight: '20px',
                              minWidth: '100px',
                              textAlign: 'right'
                            }}
                          >
                            {data.city}
                          </div>
                        </div>
                      </div>

                      {/* Участники */}
                      <div style={{ marginBottom: '25px' }}>
                        <p style={{ fontWeight: 'bold', fontSize: '12pt', marginBottom: '10px' }}>ПРИСУТСТВОВАЛИ</p>
                        <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', marginBottom: '15px' }}>
                          <thead>
                            <tr>
                              <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'left', fontWeight: 'bold', width: '50%' }}>Должность</th>
                              <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'left', fontWeight: 'bold', width: '50%' }}>Бизнес-эксперт (по Skype):</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.attendees.map((a: any, idx: number) => {
                              const org = a.organization && a.organization !== "Н/Д" ? `${a.organization}\n` : "";
                              const role = (a.role || a.position) && (a.role || a.position) !== "Н/Д" ? (a.role || a.position) : "";
                              const fullPosition = org + role || "Н/Д";
                              return (
                                <tr key={idx}>
                                  <td style={{ border: '1px solid #000', padding: '8px' }}>
                                    <div
                                      contentEditable
                                      suppressContentEditableWarning
                                      onBlur={(e) => {
                                        const text = e.currentTarget.textContent || '';
                                        const lines = text.split('\n');
                                        const newAttendees = [...editedAttendees];
                                        if (newAttendees[idx]) {
                                          if (lines.length > 1) {
                                            newAttendees[idx].organization = lines[0].trim();
                                            newAttendees[idx].role = lines.slice(1).join('\n').trim();
                                          } else {
                                            newAttendees[idx].role = text.trim();
                                            newAttendees[idx].organization = "Н/Д";
                                          }
                                          setEditedAttendees(newAttendees);
                                        }
                                      }}
                                      style={{
                                        whiteSpace: 'pre-line',
                                        minHeight: '20px',
                                        padding: '2px',
                                        border: '1px dashed #cbd5e1',
                                        borderRadius: '2px',
                                        outline: 'none'
                                      }}
                                    >
                                      {fullPosition}
                                    </div>
                                  </td>
                                  <td style={{ border: '1px solid #000', padding: '8px' }}>
                                    <div
                                      contentEditable
                                      suppressContentEditableWarning
                                      onBlur={(e) => {
                                        const newAttendees = [...editedAttendees];
                                        if (newAttendees[idx]) {
                                          newAttendees[idx].name = e.currentTarget.textContent || "Н/Д";
                                          setEditedAttendees(newAttendees);
                                        }
                                      }}
                                      style={{
                                        minHeight: '20px',
                                        padding: '2px',
                                        border: '1px dashed #cbd5e1',
                                        borderRadius: '2px',
                                        outline: 'none'
                                      }}
                                    >
                                      {a.name || "Н/Д"}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                </div>

                      {/* Повестка */}
                      <div style={{ marginBottom: '25px' }}>
                        <p style={{ fontWeight: 'bold', fontSize: '12pt', marginBottom: '10px' }}>ПОВЕСТКА:</p>
                        <div
                          contentEditable
                          suppressContentEditableWarning
                          onBlur={(e) => setEditedSummary(e.currentTarget.textContent || '')}
                          style={{
                            minHeight: '50px',
                            padding: '8px',
                            border: '1px dashed #cbd5e1',
                            borderRadius: '4px',
                            outline: 'none'
                          }}
                        >
                          {data.summary}
                        </div>
                      </div>

                      {/* Рассмотрели */}
                      <div style={{ marginBottom: '25px' }}>
                        <p style={{ fontWeight: 'bold', fontSize: '12pt', marginBottom: '10px' }}>РАССМОТРЕЛИ:</p>
                        <div
                          contentEditable
                          suppressContentEditableWarning
                          onBlur={(e) => {
                            const text = e.currentTarget.textContent || '';
                            setEditedDecisions(text);
                          }}
                          style={{
                            minHeight: '100px',
                            padding: '8px',
                            border: '1px dashed #cbd5e1',
                            borderRadius: '4px',
                            outline: 'none'
                          }}
                        >
                          {data.decisions.map((d: string, idx: number) => (
                            <div key={idx} style={{ marginBottom: '5px' }}>
                              {idx + 1}. {d}
                            </div>
                  ))}
                </div>
                      </div>

                      {/* Решили */}
                      <div style={{ marginBottom: '25px' }}>
                        <p style={{ fontWeight: 'bold', fontSize: '12pt', marginBottom: '10px' }}>РЕШИЛИ:</p>
                        <p style={{ marginBottom: '10px' }}>Зафиксировать поручения по итогам встречи:</p>
                        
                        {data.assignments.length > 0 && (
                          <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', marginTop: '10px' }}>
                            <thead>
                              <tr>
                                <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>№</th>
                                <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>Поручение</th>
                                <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>Ответственный</th>
                                <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>Срок</th>
                              </tr>
                            </thead>
                            <tbody>
                              {data.assignments.map((a: any, idx: number) => (
                                <tr key={idx}>
                                  <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'center' }}>{a.no ?? idx + 1}</td>
                                  <td style={{ border: '1px solid #000', padding: '8px' }}>
                                    <div
                                      contentEditable
                                      suppressContentEditableWarning
                                      onBlur={(e) => {
                                        const newAssignments = [...editedAssignments];
                                        if (newAssignments[idx]) {
                                          newAssignments[idx].task = e.currentTarget.textContent || "Н/Д";
                                          setEditedAssignments(newAssignments);
                                        }
                                      }}
                                      style={{
                                        minHeight: '20px',
                                        padding: '2px',
                                        border: '1px dashed #cbd5e1',
                                        borderRadius: '2px',
                                        outline: 'none'
                                      }}
                                    >
                                      {a.task || "Н/Д"}
                                    </div>
                                  </td>
                                  <td style={{ border: '1px solid #000', padding: '8px' }}>
                                    <div
                                      contentEditable
                                      suppressContentEditableWarning
                                      onBlur={(e) => {
                                        const newAssignments = [...editedAssignments];
                                        if (newAssignments[idx]) {
                                          newAssignments[idx].responsible = e.currentTarget.textContent || "Н/Д";
                                          setEditedAssignments(newAssignments);
                                        }
                                      }}
                                      style={{
                                        minHeight: '20px',
                                        padding: '2px',
                                        border: '1px dashed #cbd5e1',
                                        borderRadius: '2px',
                                        outline: 'none'
                                      }}
                                    >
                                      {a.responsible || "Н/Д"}
                                    </div>
                                  </td>
                                  <td style={{ border: '1px solid #000', padding: '8px' }}>
                                    <div
                                      contentEditable
                                      suppressContentEditableWarning
                                      onBlur={(e) => {
                                        const newAssignments = [...editedAssignments];
                                        if (newAssignments[idx]) {
                                          const dateText = e.currentTarget.textContent || "Н/Д";
                                          // Пытаемся распарсить дату в формате дд.мм.гггг обратно в гггг-мм-дд
                                          if (dateText !== "Н/Д" && dateText.match(/^\d{2}\.\d{2}\.\d{4}$/)) {
                                            const [day, month, year] = dateText.split('.');
                                            newAssignments[idx].due_date = `${year}-${month}-${day}`;
                                          } else {
                                            newAssignments[idx].due_date = dateText;
                                          }
                                          setEditedAssignments(newAssignments);
                                        }
                                      }}
                                      style={{
                                        minHeight: '20px',
                                        padding: '2px',
                                        border: '1px dashed #cbd5e1',
                                        borderRadius: '2px',
                                        outline: 'none'
                                      }}
                                    >
                                      {a.due_date ? formatDateForProtocol(a.due_date) : "Н/Д"}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>

                      {/* Подпись */}
                      <div style={{ marginTop: '40px' }}>
                        <p style={{ marginBottom: '10px' }}>Протокол подготовлен: Корнаев А.А.</p>
                        <p style={{ marginBottom: '10px' }}>Контактный e-mail: Arsen.Kornaev@contractor.lukoil.com</p>
                        <p>Дата: {data.date}</p>
                      </div>
                    </div>
                  );
                })()}
              </div>
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