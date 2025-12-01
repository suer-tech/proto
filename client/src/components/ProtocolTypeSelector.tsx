import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Users, Building2, Briefcase, Zap, CheckCircle, Users2 } from "lucide-react";

interface ProtocolType {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

const PROTOCOL_TYPES: ProtocolType[] = [
  {
    id: "standard-meeting",
    title: "Протокол совещания",
    description: "Стандартный протокол рабочего совещания",
    icon: <Users className="h-6 w-6" />,
    color: "bg-blue-50 border-blue-200 hover:border-blue-400"
  },
  {
    id: "board-meeting",
    title: "Протокол заседания совета директоров",
    description: "Протокол заседания совета директоров или правления",
    icon: <Building2 className="h-6 w-6" />,
    color: "bg-slate-50 border-slate-200 hover:border-slate-400"
  },
  {
    id: "general-assembly",
    title: "Протокол общего собрания",
    description: "Протокол общего собрания участников/акционеров",
    icon: <Users2 className="h-6 w-6" />,
    color: "bg-indigo-50 border-indigo-200 hover:border-indigo-400"
  },
  {
    id: "technical-meeting",
    title: "Протокол технического совещания",
    description: "Протокол технического или проектного совещания",
    icon: <Zap className="h-6 w-6" />,
    color: "bg-amber-50 border-amber-200 hover:border-amber-400"
  },
  {
    id: "audit-meeting",
    title: "Протокол аудиторского совещания",
    description: "Протокол совещания с участием аудиторов",
    icon: <CheckCircle className="h-6 w-6" />,
    color: "bg-green-50 border-green-200 hover:border-green-400"
  },
  {
    id: "hr-meeting",
    title: "Протокол HR совещания",
    description: "Протокол кадрового совещания",
    icon: <Briefcase className="h-6 w-6" />,
    color: "bg-purple-50 border-purple-200 hover:border-purple-400"
  }
];

interface ProtocolTypeSelectorProps {
  onSelect: (typeId: string) => void;
}

export default function ProtocolTypeSelector({ onSelect }: ProtocolTypeSelectorProps) {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold text-slate-900">Выберите тип протокола</h2>
        <p className="text-slate-600 max-w-2xl mx-auto">
          Выберите подходящий тип протокола для вашего совещания. Это поможет нам правильно структурировать документ в соответствии с требованиями.
        </p>
      </div>

      {/* Protocol Types Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {PROTOCOL_TYPES.map((protocol) => (
          <Card
            key={protocol.id}
            className={`border-2 transition-all duration-200 cursor-pointer hover:shadow-lg flex flex-col h-full ${protocol.color}`}
            onClick={() => onSelect(protocol.id)}
          >
            <CardHeader className="pb-3 flex-grow">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <div className="text-blue-600 mt-1">{protocol.icon}</div>
                  <div className="flex-1">
                    <CardTitle className="text-lg text-slate-900">
                      {protocol.title}
                    </CardTitle>
                    <CardDescription className="text-slate-600 text-sm mt-1">
                      {protocol.description}
                    </CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="mt-auto">
              <Button
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(protocol.id);
                }}
              >
                Выбрать
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Info Section */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-900">Как это работает?</CardTitle>
        </CardHeader>
        <CardContent className="text-blue-800 space-y-2">
          <p>
            1. <strong>Выберите тип протокола</strong> — соответствующий вашему совещанию
          </p>
          <p>
            2. <strong>Загрузите аудиофайл</strong> — запись совещания в формате MP3, WAV или M4A
          </p>
          <p>
            3. <strong>Выберите участников</strong> — спикеры совещания и их выбор
          </p>
          <p>
            4. <strong>Получите результат</strong> — готовый протокол в формате Word с возможностью редактирования
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

