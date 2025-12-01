import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Edit2, Trash2, Users, UserCheck, UserX } from "lucide-react";
import { loadPermanentParticipants, savePermanentParticipants } from "@/lib/permanentParticipants";

export interface Participant {
  id: string;
  name: string;
  role: string;
  organization?: string;
  type: "permanent" | "temporary";
}

interface ParticipantsManagerProps {
  protocolType: string;
  onNext: (participants: Participant[]) => void;
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

export default function ParticipantsManager({
  protocolType,
  onNext,
  onBack
}: ParticipantsManagerProps) {
  // Загружаем сохраненных постоянных участников при инициализации
  const [participants, setParticipants] = useState<Participant[]>(() => {
    const savedParticipants = loadPermanentParticipants();
    if (savedParticipants.length > 0) {
      console.log(`[ParticipantsManager] Loaded ${savedParticipants.length} permanent participants from storage`);
      return savedParticipants;
    }
    // Если нет сохраненных, возвращаем пустой массив
    return [];
  });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    role: "",
    organization: "",
    type: "permanent" as "permanent" | "temporary"
  });

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
      setParticipants(participants.filter(p => p.id !== id));
    }
  };

  const permanentParticipants = participants.filter(p => p.type === "permanent");
  const temporaryParticipants = participants.filter(p => p.type === "temporary");

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <Button
          variant="ghost"
          onClick={onBack}
          className="text-slate-600 hover:text-slate-900 mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Вернуться к выбору типа
        </Button>
        <h2 className="text-3xl font-bold text-slate-900">Управление участниками</h2>
        <p className="text-slate-600">
          Выбранный тип: <strong>{PROTOCOL_NAMES[protocolType]}</strong>
        </p>
      </div>

      {/* Info Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-900 text-base">Добавьте участников встречи</CardTitle>
        </CardHeader>
        <CardContent className="text-blue-800 text-sm space-y-2">
          <p>
            • <strong>Постоянные участники</strong> — сотрудники, которые регулярно участвуют в совещаниях
          </p>
          <p>
            • <strong>Временные участники</strong> — приглашенные гости или специалисты на одну встречу
          </p>
          <p>
            • Вы можете добавить, отредактировать или удалить участников в любой момент
          </p>
        </CardContent>
      </Card>

      {/* Participants List */}
      <div className="space-y-6">
        {/* Permanent Participants */}
        <Card className="border-slate-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-blue-600" />
                <div>
                  <CardTitle className="text-lg">Постоянные участники</CardTitle>
                  <CardDescription>
                    {permanentParticipants.length} участник(ов)
                  </CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {permanentParticipants.length === 0 ? (
              <p className="text-slate-500 text-sm py-4">Нет постоянных участников</p>
            ) : (
              <div className="space-y-3">
                {permanentParticipants.map(participant => (
                  <div
                    key={participant.id}
                    className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200 hover:border-blue-300 transition-colors"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-slate-900">{participant.name}</p>
                      {participant.role && (
                        <p className="text-sm text-slate-600 mt-1">Должность: {participant.role}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditClick(participant)}
                        className="border-slate-300 text-slate-700 hover:bg-slate-100"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(participant.id)}
                        className="border-red-300 text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Temporary Participants */}
        <Card className="border-slate-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserX className="h-5 w-5 text-amber-600" />
                <div>
                  <CardTitle className="text-lg">Временные участники</CardTitle>
                  <CardDescription>
                    {temporaryParticipants.length} участник(ов)
                  </CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {temporaryParticipants.length === 0 ? (
              <p className="text-slate-500 text-sm py-4">Нет временных участников</p>
            ) : (
              <div className="space-y-3">
                {temporaryParticipants.map(participant => (
                  <div
                    key={participant.id}
                    className="flex items-center justify-between p-4 bg-amber-50 rounded-lg border border-amber-200 hover:border-amber-400 transition-colors"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-slate-900">{participant.name}</p>
                      {participant.role && (
                        <p className="text-sm text-slate-600 mt-1">Должность: {participant.role}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditClick(participant)}
                        className="border-slate-300 text-slate-700 hover:bg-slate-100"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(participant.id)}
                        className="border-red-300 text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Participant Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <Button
            onClick={handleAddClick}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white h-10"
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

      {/* Navigation Buttons */}
      <div className="flex gap-3 pt-4">
        <Button
          onClick={onBack}
          variant="outline"
          className="flex-1 border-slate-300 text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Назад
        </Button>
        <Button
          onClick={() => {
            // Сохраняем постоянных участников перед переходом к следующему шагу
            savePermanentParticipants(participants);
            onNext(participants);
          }}
          disabled={participants.length === 0}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Users className="h-4 w-4 mr-2" />
          Далее ({participants.length} участников)
        </Button>
      </div>
    </div>
  );
}

