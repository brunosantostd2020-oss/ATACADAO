import { z } from "zod";
import { query } from "../db/pool.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const dateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data invalida (YYYY-MM-DD)").optional(),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// Fechamento de caixa de um dia (default: hoje)
export const caixaDiario = asyncHandler(async (req, res) => {
  const { date } = dateSchema.parse(req.query);
  const dia = date ?? new Date().toISOString().slice(0, 10);

  // Pagamentos do dia (ja feitos)
  const { rows: pagamentos } = await query(
    `SELECT
       payment_method,
       COUNT(*)::int        AS qtd,
       SUM(amount_cents)::int AS total_cents
     FROM payments
    WHERE created_at::date = $1::date
    GROUP BY payment_method
    ORDER BY total_cents DESC`,
    [dia]
  );

  // Total geral recebido no dia
  const { rows: totalGeral } = await query(
    `SELECT
       COUNT(*)::int           AS qtd_pagamentos,
       COALESCE(SUM(amount_cents),0)::int AS total_cents
     FROM payments
    WHERE created_at::date = $1::date`,
    [dia]
  );

  // Comandas abertas no dia (que ainda estao devendo)
  const { rows: abertas } = await query(
    `SELECT
       COUNT(*)::int AS qtd,
       COALESCE(SUM(GREATEST(
         COALESCE((SELECT SUM(price_cents*qty) FROM comanda_items WHERE comanda_id=c.id),0) -
         COALESCE((SELECT SUM(amount_cents)   FROM payments       WHERE comanda_id=c.id),0)
       ,0)),0)::int AS restante_cents
     FROM comandas c
    WHERE c.created_at::date = $1::date
      AND c.status IN ('open','partial')`,
    [dia]
  );

  // Produtos mais vendidos no dia
  const { rows: produtos } = await query(
    `SELECT
       ci.name,
       SUM(ci.qty)::int           AS total_qty,
       SUM(ci.price_cents*ci.qty)::int AS total_cents
     FROM comanda_items ci
     JOIN comandas c ON c.id = ci.comanda_id
    WHERE c.created_at::date = $1::date
    GROUP BY ci.name
    ORDER BY total_qty DESC
    LIMIT 10`,
    [dia]
  );

  res.json({
    date: dia,
    pagamentos,
    total_recebido_cents: totalGeral[0].total_cents,
    qtd_pagamentos: totalGeral[0].qtd_pagamentos,
    comandas_abertas: abertas[0].qtd,
    restante_a_receber_cents: abertas[0].restante_cents,
    produtos_mais_vendidos: produtos,
  });
});

// Relatorio de vendas por periodo
export const relatorioVendas = asyncHandler(async (req, res) => {
  const { start, end } = dateSchema.parse(req.query);
  const dataInicio = start ?? new Date().toISOString().slice(0, 10);
  const dataFim    = end   ?? new Date().toISOString().slice(0, 10);

  // Totais por dia
  const { rows: porDia } = await query(
    `SELECT
       p.created_at::date          AS dia,
       COUNT(*)::int               AS qtd_pagamentos,
       SUM(p.amount_cents)::int    AS total_cents
     FROM payments p
    WHERE p.created_at::date BETWEEN $1::date AND $2::date
    GROUP BY dia
    ORDER BY dia DESC`,
    [dataInicio, dataFim]
  );

  // Totais por forma de pagamento no periodo
  const { rows: porMetodo } = await query(
    `SELECT
       payment_method,
       COUNT(*)::int           AS qtd,
       SUM(amount_cents)::int  AS total_cents
     FROM payments
    WHERE created_at::date BETWEEN $1::date AND $2::date
    GROUP BY payment_method
    ORDER BY total_cents DESC`,
    [dataInicio, dataFim]
  );

  // Top produtos no periodo
  const { rows: topProdutos } = await query(
    `SELECT
       ci.name,
       SUM(ci.qty)::int               AS total_qty,
       SUM(ci.price_cents * ci.qty)::int AS total_cents
     FROM comanda_items ci
     JOIN comandas c ON c.id = ci.comanda_id
    WHERE c.created_at::date BETWEEN $1::date AND $2::date
    GROUP BY ci.name
    ORDER BY total_qty DESC
    LIMIT 15`,
    [dataInicio, dataFim]
  );

  // Total geral
  const { rows: geral } = await query(
    `SELECT
       COALESCE(SUM(amount_cents),0)::int AS total_cents,
       COUNT(DISTINCT comanda_id)::int    AS qtd_comandas
     FROM payments
    WHERE created_at::date BETWEEN $1::date AND $2::date`,
    [dataInicio, dataFim]
  );

  res.json({
    start: dataInicio,
    end: dataFim,
    total_cents: geral[0].total_cents,
    qtd_comandas: geral[0].qtd_comandas,
    por_dia: porDia,
    por_metodo: porMetodo,
    top_produtos: topProdutos,
  });
});
