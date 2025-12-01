import { useMemo, useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Plus, Edit2, Trash2, UserCheck, UserX, Users } from "lucide-react";
import { Participant } from "@/components/ParticipantsManager";
import { generateProtocolFromTranscript } from "@/lib/api";
import { formatTranscript } from "@/lib/protocolFormatter";
import { loadPermanentParticipants } from "@/lib/permanentParticipants";

interface SpeakerMappingProps {
  protocolType: string;
  participants?: Participant[]; // Теперь опциональный, управляется внутри компонента
  transcript: string;
  diarization?: any;
  duration?: string;
  duration_ms?: number;
  onBack: () => void;
  onGenerated: (protocolData: any, participants: Participant[]) => void; // Теперь передаем participants
}

export default function SpeakerMapping({
  protocolType,
  participants: initialParticipants = [],
  transcript,
  diarization,
  duration,
  duration_ms,
  onBack,
  onGenerated
}: SpeakerMappingProps) {
  // Управление участниками внутри компонента
  const [participants, setParticipants] = useState<Participant[]>(() => {
    // Если переданы начальные участники, используем их
    if (initialParticipants.length > 0) {
      return initialParticipants;
    }
    // Иначе загружаем сохраненных постоянных участников
    const savedParticipants = loadPermanentParticipants();
    if (savedParticipants.length > 0) {
      console.log(`[SpeakerMapping] Loaded ${savedParticipants.length} permanent participants from storage`);
      return savedParticipants;
    }
    // Если нет сохраненных, возвращаем пустой массив (пользователь добавит участников)
    return [];
  });

  // Обновляем участников, когда initialParticipants меняется
  useEffect(() => {
    console.log(`[SpeakerMapping] useEffect triggered, initialParticipants:`, initialParticipants);
    if (initialParticipants.length > 0) {
      console.log(`[SpeakerMapping] Updating participants from props: ${initialParticipants.length} participants`);
      setParticipants(initialParticipants);
    } else {
      // Если initialParticipants пустой, загружаем сохраненных
      const savedParticipants = loadPermanentParticipants();
      console.log(`[SpeakerMapping] Loaded from storage: ${savedParticipants.length} participants`);
      if (savedParticipants.length > 0) {
        console.log(`[SpeakerMapping] Updating participants from storage: ${savedParticipants.length} participants`);
        setParticipants(savedParticipants);
      } else {
        console.log(`[SpeakerMapping] No saved participants found, keeping current state`);
      }
    }
  }, [initialParticipants]);

  // Состояние для диалога управления участниками
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    role: "",
    organization: "",
    type: "permanent" as "permanent" | "temporary"
  });

  // Функции управления участниками
  const handleAddClick = () => {
    setEditingId(null);
    setFormData({ name: "", role: "", organization: "", type: "permanent" });
    setIsDialogOpen(true);
  };

  const handleEditClick = (participant: Participant) => {
    setEditingId(participant.id);
    setFormData({
      name: participant.name,
      role: participant.role,
      organization: participant.organization || "",
      type: participant.type
    });
    setIsDialogOpen(true);
  };

  const handleSave = () => {
    if (!formData.name.trim()) {
      alert("Пожалуйста, заполните имя");
      return;
    }

    if (editingId) {
      // Редактирование существующего участника
      setParticipants(participants.map(p =>
        p.id === editingId
          ? { ...p, ...formData }
          : p
      ));
    } else {
      // Добавление нового участника
      const newParticipant: Participant = {
        id: Date.now().toString(),
        ...formData
      };
      setParticipants([...participants, newParticipant]);
    }

    setIsDialogOpen(false);
    setFormData({ name: "", role: "", organization: "", type: "permanent" });
  };

  const handleDelete = (id: string) => {
    if (confirm("Вы уверены, что хотите удалить этого участника?")) {
      const deletedParticipant = participants.find(p => p.id === id);
      setParticipants(participants.filter(p => p.id !== id));
      
      // Удаляем маппинг для удаленного участника
      setMapping(prev => {
        const newMapping = { ...prev };
        if (deletedParticipant) {
          Object.keys(newMapping).forEach(key => {
            if (newMapping[key] === deletedParticipant.name) {
              delete newMapping[key];
            }
          });
        }
        return newMapping;
      });
    }
  };

  const permanentParticipants = participants.filter(p => p.type === "permanent");
  const temporaryParticipants = participants.filter(p => p.type === "temporary");

  const speakerLabels = useMemo(() => {
    console.log("=== SpeakerMapping: Extracting speaker labels ===");
    console.log("Diarization object:", diarization);
    console.log("Diarization type:", typeof diarization);
    
    // Try to extract unique speaker labels from diarization result
    const labels = new Set<string>();
    const segments = diarization?.utterances || diarization?.segments || diarization?.diarization || [];
    console.log("Segments found:", segments);
    console.log("Segments type:", Array.isArray(segments) ? "array" : typeof segments);
    console.log("Segments length:", Array.isArray(segments) ? segments.length : "not array");
    
    if (Array.isArray(segments) && segments.length > 0) {
      console.log("First segment example:", segments[0]);
      for (const seg of segments) {
        const s = seg.speaker || seg.spk || seg.label || seg.speaker_label;
        if (s !== null && s !== undefined) {
          // AssemblyAI возвращает "A", "B", "C" и т.д.
          const speakerId = String(s).trim();
          // Преобразуем в "Спикер A", "Спикер B" и т.д.
          const speakerLabel = /^[A-Z0-9]+$/.test(speakerId) ? `Спикер ${speakerId}` : speakerId;
          labels.add(speakerLabel);
          console.log("Found speaker:", speakerLabel, "from segment:", seg);
        }
      }
    } else {
      console.warn("No segments found or segments is not an array");
    }
    
    // Fallback: extract from transcript patterns
    if (labels.size === 0) {
      console.log("No speakers found in diarization, trying to extract from transcript...");
      // Try to guess from transcript patterns - look for "Спикер X:" or "Speaker X:"
      const transcriptPattern = /\[(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\]\s*(?:Спикер\s+([A-Z0-9]+)|([^:]+)):/g;
      const matches = [...transcript.matchAll(transcriptPattern)];
      console.log("Transcript pattern matches:", matches.length);
      for (const match of matches) {
        const speakerLabel = match[3] || match[4];
        if (speakerLabel) {
          // If it's a speaker label like "A", "B", etc., add "Спикер A"
          if (/^[A-Z0-9]+$/.test(speakerLabel.trim())) {
            const label = `Спикер ${speakerLabel.trim()}`;
            labels.add(label);
            console.log("Found speaker from transcript:", label);
          } else {
            // Otherwise it's already a name, use as is
            labels.add(speakerLabel.trim());
            console.log("Found speaker name from transcript:", speakerLabel.trim());
          }
        }
      }
    }
    
    // If still no labels found, try simpler patterns
    if (labels.size === 0) {
      console.log("Trying simpler patterns...");
      const simplePatterns = [
        /Спикер\s+([A-Z0-9]+)/gi,
        /Speaker\s+([A-Z0-9]+)/gi,
        /SPEAKER_(\d{2})/gi
      ];
      for (const pattern of simplePatterns) {
        const matches = transcript.matchAll(pattern);
        for (const match of matches) {
          const label = match[0].trim();
          labels.add(label);
          console.log("Found speaker from simple pattern:", label);
        }
      }
    }
    
    // Final fallback
    if (labels.size === 0) {
      console.warn("No speakers found, using default fallback");
      ["Спикер A", "Спикер B"].forEach(l => labels.add(l));
    }
    
    const finalLabels = Array.from(labels).sort();
    console.log("Final speaker labels:", finalLabels);
    return finalLabels;
  }, [diarization, transcript]);

  const [mapping, setMapping] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    speakerLabels.forEach((label, idx) => {
      // Маппим по name, а не по id, для совместимости с applyMappingToTranscript
      init[label] = participants[idx]?.name || "";
    });
    return init;
  });

  // Обновляем маппинг при изменении участников
  useMemo(() => {
    setMapping(prev => {
      const newMapping = { ...prev };
      // Проверяем, что все маппинги указывают на существующих участников
      Object.keys(newMapping).forEach(key => {
        const participantName = newMapping[key];
        if (participantName && !participants.find(p => p.name === participantName)) {
          // Участник был удален, очищаем маппинг
          delete newMapping[key];
        }
      });
      return newMapping;
    });
  }, [participants]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>("");
  const allMapped = useMemo(() => {
    return speakerLabels.length > 0 && speakerLabels.every(lbl => (mapping[lbl] || "").trim().length > 0);
  }, [speakerLabels, mapping]);

  const handleChange = (speaker: string, participantName: string) => {
    setMapping(prev => ({ ...prev, [speaker]: participantName }));
  };

  const applyMappingToTranscript = useCallback((text: string): string => {
    let result = text;
    for (const [speakerLabel, participantName] of Object.entries(mapping)) {
      if (!participantName || !participantName.trim()) continue;
      
      // Извлекаем только метку спикера (без "Спикер ")
      const speakerId = speakerLabel.replace(/^Спикер\s+/i, "").trim();
      
      // Паттерны для замены:
      // 1. [MM:SS - MM:SS] Спикер X: текст -> [MM:SS - MM:SS] Имя: текст
      // 2. Спикер X: текст -> Имя: текст
      const patterns = [
        // Полный паттерн с таймингом и "Спикер X"
        new RegExp(`(\\[\\d{2}:\\d{2}\\s*-\\s*\\d{2}:\\d{2}\\]\\s*)Спикер\\s+${escapeRegExp(speakerId)}\\s*:`, "gi"),
        // Полный паттерн с таймингом и просто меткой
        new RegExp(`(\\[\\d{2}:\\d{2}\\s*-\\s*\\d{2}:\\d{2}\\]\\s*)${escapeRegExp(speakerLabel)}\\s*:`, "gi"),
        // Просто "Спикер X:" в начале строки
        new RegExp(`(^|\\n)\\s*Спикер\\s+${escapeRegExp(speakerId)}\\s*:`, "gi"),
        // Просто метка в начале строки
        new RegExp(`(^|\\n)\\s*${escapeRegExp(speakerLabel)}\\s*:`, "gi"),
      ];
      
      for (const pattern of patterns) {
        result = result.replace(pattern, (match, prefix = "") => {
          // Если есть префикс (тайминг), сохраняем его
          if (prefix && prefix.trim()) {
            return `${prefix}${participantName}:`;
          }
          // Иначе заменяем на имя с двоеточием
          return match.includes(":") ? match.replace(new RegExp(`Спикер\\s+${escapeRegExp(speakerId)}|${escapeRegExp(speakerLabel)}`, "gi"), participantName) : `${participantName}:`;
        });
      }
    }
    return result;
  }, [mapping]);

  // Предпросмотр стенограммы с примененным маппингом
  const mappedTranscriptPreview = useMemo(() => {
    return applyMappingToTranscript(transcript);
  }, [transcript, applyMappingToTranscript]);

  const onGenerate = async () => {
    setSubmitting(true);
    setError("");
    try {
      if (!allMapped) {
        setError("Назначьте участника для каждого спикера перед генерацией.");
        setSubmitting(false);
        return;
      }
      if (participants.length === 0) {
        setError("Добавьте хотя бы одного участника перед генерацией.");
        setSubmitting(false);
        return;
      }
      const mappedTranscript = applyMappingToTranscript(transcript);
      const resp = await generateProtocolFromTranscript({
        protocolType,
        participants,
        transcript: mappedTranscript,
        duration: duration,
        duration_ms: duration_ms
      });
      if (resp.status === "completed" && resp.protocol) {
        console.log(`[SpeakerMapping] ===== Calling onGenerated =====`);
        console.log(`[SpeakerMapping] participants.length: ${participants.length}`);
        console.log(`[SpeakerMapping] participants:`, participants);
        console.log(`[SpeakerMapping] participants details:`, participants.map(p => ({ id: p.id, name: p.name, type: p.type })));
        onGenerated(resp.protocol, participants);
        console.log(`[SpeakerMapping] onGenerated called successfully`);
      } else {
        setError(resp.error || "Ошибка генерации протокола");
      }
    } catch (e: any) {
      setError(e?.message || "Ошибка генерации протокола");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="space-y-2">
        <Button
          variant="ghost"
          onClick={onBack}
          className="text-slate-600 hover:text-slate-900 mb-4"
          disabled={submitting}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Вернуться к загрузке файла
        </Button>
        <h2 className="text-3xl font-bold text-slate-900">Сопоставьте спикеров</h2>
        <p className="text-slate-600">
          Определите участников встречи и сопоставьте автоматически определенных спикеров с реальными участниками совещания.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Левая колонка: Назначение участников (объединенный блок) */}
        <div className="space-y-4">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle>Назначение участников</CardTitle>
              <CardDescription>
                Добавьте участников встречи и сопоставьте их со спикерами из стенограммы
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Управление участниками */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">Участники встречи</h3>
                  <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                      <Button
                        onClick={handleAddClick}
                        variant="outline"
                        size="sm"
                        className="border-blue-300 text-blue-700 hover:bg-blue-50"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Добавить участника
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>
                          {editingId ? "Редактировать участника" : "Добавить участника"}
                        </DialogTitle>
                        <DialogDescription>
                          Заполните информацию об участнике встречи
                        </DialogDescription>
                      </DialogHeader>

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="name" className="text-slate-700">
                            Имя и фамилия *
                          </Label>
                          <Input
                            id="name"
                            placeholder="Иван Петров"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="border-slate-300 focus:border-blue-500"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="organization" className="text-slate-700">
                            Организация
                          </Label>
                          <Input
                            id="organization"
                            placeholder="ООО «Компания»"
                            value={formData.organization}
                            onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                            className="border-slate-300 focus:border-blue-500"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="role" className="text-slate-700">
                            Должность
                          </Label>
                          <Input
                            id="role"
                            placeholder="Руководитель проекта"
                            value={formData.role}
                            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                            className="border-slate-300 focus:border-blue-500"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="type" className="text-slate-700">
                            Тип участника
                          </Label>
                          <Select value={formData.type} onValueChange={(value) =>
                            setFormData({ ...formData, type: value as "permanent" | "temporary" })
                          }>
                            <SelectTrigger className="border-slate-300">
                              <SelectValue placeholder="Выберите тип" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="permanent">Постоянный участник</SelectItem>
                              <SelectItem value="temporary">Временный участник</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex gap-3 pt-4">
                          <Button
                            variant="outline"
                            onClick={() => setIsDialogOpen(false)}
                            className="flex-1 border-slate-300 text-slate-700 hover:bg-slate-50"
                          >
                            Отмена
                          </Button>
                          <Button
                            onClick={handleSave}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            {editingId ? "Сохранить" : "Добавить"}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>

                {/* Постоянные участники */}
                {permanentParticipants.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                      <UserCheck className="h-4 w-4 text-blue-600" />
                      Постоянные участники
                    </div>
                    <div className="space-y-2">
                      {permanentParticipants.map(participant => (
                        <div
                          key={participant.id}
                          className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 hover:border-blue-300 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-slate-900">{participant.name}</p>
                            {participant.role && (
                              <p className="text-sm text-slate-600 mt-1">Должность: {participant.role}</p>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditClick(participant)}
                              className="h-8 w-8 p-0 border-slate-300 text-slate-700 hover:bg-slate-100"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(participant.id)}
                              className="h-8 w-8 p-0 border-red-300 text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Временные участники */}
                {temporaryParticipants.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                      <UserX className="h-4 w-4 text-amber-600" />
                      Временные участники
                    </div>
                    <div className="space-y-2">
                      {temporaryParticipants.map(participant => (
                        <div
                          key={participant.id}
                          className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-200 hover:border-amber-400 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-slate-900">{participant.name}</p>
                            {participant.role && (
                              <p className="text-sm text-slate-600 mt-1">Должность: {participant.role}</p>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditClick(participant)}
                              className="h-8 w-8 p-0 border-slate-300 text-slate-700 hover:bg-slate-100"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(participant.id)}
                              className="h-8 w-8 p-0 border-red-300 text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Сообщение, если нет участников */}
                {participants.length === 0 && (
                  <div className="text-center py-6 text-slate-500 text-sm">
                    <Users className="h-8 w-8 mx-auto mb-2 text-slate-400" />
                    <p>Нет добавленных участников</p>
                    <p className="text-xs mt-1">Нажмите "Добавить участника" для начала</p>
                  </div>
                )}
              </div>

              {/* Разделитель */}
              <div className="border-t border-slate-200"></div>

              {/* Маппинг спикеров */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-slate-900">Сопоставление спикеров</h3>
                {speakerLabels.length === 0 ? (
                  <p className="text-slate-600 text-sm">Спикеры не найдены в стенограмме.</p>
                ) : (
                  <div className="space-y-3">
                    {speakerLabels.map((label) => (
                      <div key={label} className="flex items-center gap-4">
                        <span className="font-medium text-slate-700 w-32 flex-shrink-0 text-sm">
                          {label}:
                        </span>
                        <Select
                          value={mapping[label] || ""}
                          onValueChange={(val) => handleChange(label, val)}
                          disabled={submitting || participants.length === 0}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Выберите участника" />
                          </SelectTrigger>
                          <SelectContent>
                            {participants.map((p) => (
                              <SelectItem key={p.id} value={p.name}>
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Правая колонка: Предпросмотр стенограммы */}
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>Предпросмотр стенограммы</CardTitle>
            <CardDescription>
              Предварительный просмотр стенограммы с примененным маппингом
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 min-h-64 max-h-[60vh] overflow-y-auto">
              {formatTranscript(mappedTranscriptPreview)}
            </div>
          </CardContent>
        </Card>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          onClick={onBack}
          disabled={submitting}
          className="border-slate-300 text-slate-700 hover:bg-slate-50"
        >
          Назад
        </Button>
        <Button
          onClick={onGenerate}
          disabled={submitting || !allMapped || participants.length === 0}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {submitting ? "Создание..." : "Создать протокол"}
        </Button>
      </div>
    </div>
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
