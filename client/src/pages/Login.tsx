import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";
import { Lock, Mail } from "lucide-react";

export default function Login() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    // Mock authentication - в реальном приложении здесь будет API запрос
    if (!email || !password) {
      setError("Пожалуйста, заполните все поля");
      setIsLoading(false);
      return;
    }

    // Проверка учетных данных
    const validEmail = "demo@example.com";
    const validPassword = "protocol123";

    if (email === validEmail && password === validPassword) {
      // Сохраняем данные пользователя в localStorage
      localStorage.setItem("user", JSON.stringify({ email, name: email.split("@")[0] }));
      localStorage.setItem("authToken", "mock-token-" + Date.now());
      navigate("/dashboard");
    } else {
      setError("Неверный email или пароль");
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <img 
              src="/logo_team_idea.png" 
              alt="Team Idea Logo" 
              className="h-12 w-auto"
            />
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">PM</span>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Protocol Maker</h1>
          <p className="text-slate-600 mt-2">Сервис формирования протоколов совещаний</p>
        </div>

        {/* Login Card */}
        <Card className="border-slate-200 shadow-lg">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl">Вход в систему</CardTitle>
            <CardDescription>
              Введите ваши учетные данные для доступа к приложению
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-700">
                  Электронная почта
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="user@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-700">
                  Пароль
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                    disabled={isLoading}
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white h-10"
                disabled={isLoading}
              >
                {isLoading ? "Загрузка..." : "Войти"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-slate-600 text-sm mt-6">
          © 2025 Protocol Maker Service. Все права защищены.
        </p>
      </div>
    </div>
  );
}

