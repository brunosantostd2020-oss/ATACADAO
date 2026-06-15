// Cliente HTTP para a API do back-end (Express + PostgreSQL).
// A URL base vem de VITE_API_URL; em dev cai no localhost:3333.

const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ??
  "";

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
  track_stock: boolean;
  stock_qty: number;
  stock_min: number;
  low_stock?: boolean;
};

export type StockStatus = "ok" | "baixo" | "esgotado";
export type StockProduct = Product & { stock_status: StockStatus };
export type StockMovement = {
  id: string;
  type: "entrada" | "saida" | "ajuste";
  qty: number;
  reason: string;
  user_name?: string;
  created_at: string;
};
export type ComandaItem = {
  id: string;
  product_id: string;
  name: string;
  price_cents: number;
  qty: number;
  notes?: string;
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
  create: (p: { name: string; price_cents: number; category?: string; track_stock?: boolean; stock_qty?: number; stock_min?: number }) =>
    api<Product>("/api/products", { method: "POST", body: JSON.stringify(p) }),
  update: (id: string, p: Partial<Product>) =>
    api<Product>(`/api/products/${id}`, { method: "PATCH", body: JSON.stringify(p) }),
  remove: (id: string) => api<void>(`/api/products/${id}`, { method: "DELETE" }),
  stockPanel: () => api<StockProduct[]>("/api/products/stock"),
  stockEntry: (id: string, qty: number, reason?: string) =>
    api<Product>(`/api/products/${id}/stock/entry`, { method: "POST", body: JSON.stringify({ qty, reason }) }),
  stockAdjust: (id: string, qty: number, reason?: string) =>
    api<Product>(`/api/products/${id}/stock/adjust`, { method: "POST", body: JSON.stringify({ qty, reason }) }),
  stockHistory: (id: string) => api<StockMovement[]>(`/api/products/${id}/stock/history`),
};

export const comandasApi = {
  list: (status?: string) =>
    api<Comanda[]>(`/api/comandas${status ? `?status=${status}` : ""}`),
  get: (id: string) => api<Comanda>(`/api/comandas/${id}`),
  create: (customer: string) =>
    api<Comanda>("/api/comandas", { method: "POST", body: JSON.stringify({ customer }) }),
  addItem: (id: string, product_id: string, qty = 1, notes?: string) =>
    api<Comanda>(`/api/comandas/${id}/items`, {
      method: "POST",
      body: JSON.stringify({ product_id, qty, notes }),
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

// --- Reports API ---
export type CaixaDiario = {
  date: string;
  total_recebido_cents: number;
  qtd_pagamentos: number;
  comandas_abertas: number;
  restante_a_receber_cents: number;
  pagamentos: { payment_method: string; qtd: number; total_cents: number }[];
  produtos_mais_vendidos: { name: string; total_qty: number; total_cents: number }[];
};

export type RelatorioVendas = {
  start: string;
  end: string;
  total_cents: number;
  qtd_comandas: number;
  por_dia: { dia: string; qtd_pagamentos: number; total_cents: number }[];
  por_metodo: { payment_method: string; qtd: number; total_cents: number }[];
  top_produtos: { name: string; total_qty: number; total_cents: number }[];
};

export const reportsApi = {
  caixa: (date?: string) =>
    api<CaixaDiario>(`/api/reports/caixa${date ? `?date=${date}` : ""}`),
  vendas: (start?: string, end?: string) =>
    api<RelatorioVendas>(`/api/reports/vendas${start ? `?start=${start}&end=${end ?? start}` : ""}`),
};
