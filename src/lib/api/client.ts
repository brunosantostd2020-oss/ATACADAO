// Cliente HTTP para a API do back-end (Express + PostgreSQL).
// A URL base vem de VITE_API_URL; em producao usa a variavel VITE_API_URL
// configurada no Railway. Se nao estiver definida, tenta usar a propria
// origem da pagina (util quando front e back rodam no mesmo servico).

function resolveApiUrl(): string {
  const fromEnv = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  // Em producao sem VITE_API_URL: usa a origem atual (ex: https://meu-app.up.railway.app)
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    return window.location.origin;
  }
  // Desenvolvimento local
  return "http://localhost:3333";
}

const API_URL = resolveApiUrl();

const TOKEN_KEY = "atacadao-token";

export function getToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof localStorage === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // Token expirado/invalido: limpa e forca novo login
    if (res.status === 401) setToken(null);
    throw new ApiError(res.status, (data as { error?: string }).error ?? "Erro na requisicao.");
  }
  return data as T;
}

// ---------- Tipos ----------
export type Role = "admin" | "caixa" | "garcom";
export type User = { id: string; name: string; username: string; role: Role };
export type Product = {
  id: string;
  name: string;
  price_cents: number;
  category: string;
  active: boolean;
};
export type ComandaItem = {
  id: string;
  product_id: string;
  name: string;
  price_cents: number;
  qty: number;
};
export type Payment = {
  id: string;
  amount_cents: number;
  payment_method: string;
  created_at: string;
};
export type Comanda = {
  id: string;
  customer: string;
  status: "open" | "partial" | "paid" | "canceled";
  payment_method?: string;
  created_at: string;
  paid_at?: string;
  total_cents: number;
  paid_cents?: number;
  remaining_cents?: number;
  item_count?: number;
  items?: ComandaItem[];
  payments?: Payment[];
};
export type Summary = {
  open_count: number;
  open_total_cents: number;
  paid_today_count: number;
  paid_today_cents: number;
};

// ---------- Endpoints ----------
export const authApi = {
  login: (username: string, password: string) =>
    api<{ token: string; user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  me: () => api<User>("/api/auth/me"),
};

export const productsApi = {
  list: () => api<Product[]>("/api/products"),
  create: (p: { name: string; price_cents: number; category?: string }) =>
    api<Product>("/api/products", { method: "POST", body: JSON.stringify(p) }),
  remove: (id: string) => api<void>(`/api/products/${id}`, { method: "DELETE" }),
};

export const comandasApi = {
  list: (status?: string) =>
    api<Comanda[]>(`/api/comandas${status ? `?status=${status}` : ""}`),
  get: (id: string) => api<Comanda>(`/api/comandas/${id}`),
  create: (customer: string) =>
    api<Comanda>("/api/comandas", { method: "POST", body: JSON.stringify({ customer }) }),
  addItem: (id: string, product_id: string, qty = 1) =>
    api<Comanda>(`/api/comandas/${id}/items`, {
      method: "POST",
      body: JSON.stringify({ product_id, qty }),
    }),
  setItemQty: (id: string, itemId: string, qty: number) =>
    api<Comanda>(`/api/comandas/${id}/items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify({ qty }),
    }),
  removeItem: (id: string, itemId: string) =>
    api<Comanda>(`/api/comandas/${id}/items/${itemId}`, { method: "DELETE" }),
  pay: (id: string, payment_method: string, amount_cents?: number) =>
    api<Comanda>(`/api/comandas/${id}/pay`, {
      method: "POST",
      body: JSON.stringify(
        amount_cents != null ? { payment_method, amount_cents } : { payment_method },
      ),
    }),
  remove: (id: string) => api<void>(`/api/comandas/${id}`, { method: "DELETE" }),
  summary: () => api<Summary>("/api/comandas/summary"),
};
