import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Beer } from "lucide-react";
import { useAuth } from "@/lib/api/auth";

export function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError("");
    setLoading(true);
    try {
      await login(username.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha no login.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Lado escuro com a marca */}
      <div className="hidden lg:flex flex-col justify-between bg-card border-r border-border p-10">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-lg bg-primary text-primary-foreground grid place-items-center">
            <Beer className="size-6" />
          </div>
          <div>
            <div className="font-bold tracking-tight leading-none">
              ATACADAO CERVEJARIA
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Sistema de Comandas
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <h2 className="text-3xl font-bold tracking-tight">
            Controle total das suas comandas.
          </h2>
          <p className="text-muted-foreground max-w-sm">
            Abra comandas, lance produtos e de baixa nos pagamentos com seu time
            - tudo sincronizado em tempo real.
          </p>
        </div>
        <div className="text-xs text-muted-foreground">
          Atacadao Cervejaria - acesso restrito
        </div>
      </div>

      {/* Formulario */}
      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-sm p-6 space-y-5">
          <div className="lg:hidden flex items-center gap-3 mb-2">
            <div className="size-10 rounded-lg bg-primary text-primary-foreground grid place-items-center">
              <Beer className="size-5" />
            </div>
            <div className="font-bold tracking-tight">ATACADAO CERVEJARIA</div>
          </div>

          <div>
            <h1 className="text-xl font-bold tracking-tight">Entrar</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Digite seu usuario e senha.
            </p>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="username">Usuario</Label>
              <Input
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="atacadao"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="********"
              />
            </div>
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <Button
            className="w-full"
            size="lg"
            onClick={submit}
            disabled={loading || !username || !password}
          >
            {loading ? "Entrando..." : "Entrar"}
          </Button>
        </Card>
      </div>
    </div>
  );
}
