# Atacadão Cervejaria — Sistema de Comandas

SaaS de comandas com **back-end profissional** (Node.js + Express + PostgreSQL)
e **front-end** (React + TanStack Start). Login com papéis: **admin**, **caixa**
e **garçom**.

## Controle de pagamentos e cores

O sistema foi feito para você **nunca mais perder de vista quem deve**:

- **Seção "Devendo Agora"** no topo: lista quem está com saldo em aberto,
  ordenada da comanda mais antiga para a mais nova, mostrando quanto falta
  e há quanto tempo está aberta.
- **Cores por situação** (bate o olho e entende):

  | Cor | Situação |
  |---|---|
  | Verde | Comanda quitada (paga) |
  | Amarelo | Pagamento parcial (pagou parte, ainda deve) |
  | Vermelho | Esquecida — aberta há mais de 1 hora |
  | Normal | Aberta há pouco tempo |

- **Aviso de comanda esquecida**: quando passa de 1 hora aberta, aparece um
  aviso vermelho no topo da tela.
- **Pagamento parcial**: o cliente pode pagar uma parte agora (campo "Valor
  parcial") e o resto depois. O sistema guarda cada pagamento e mostra sempre
  o **saldo que falta**. Ao zerar o saldo, a comanda fica verde (quitada). O
  botão **"Quitar tudo"** recebe o saldo restante de uma vez.
- **Painel do dia**: total a receber (o que está na rua) e total recebido hoje.

```
atacadao-cervejaria/
├── src/                 # FRONT-END (React / TanStack Start)
├── server/              # BACK-END (Express + PostgreSQL)
│   ├── src/
│   │   ├── config/      # variáveis de ambiente
│   │   ├── db/          # pool, schema.sql, migrate, seed
│   │   ├── middleware/  # auth (JWT), tratamento de erros
│   │   ├── controllers/ # auth, users, products, comandas
│   │   ├── routes/      # rotas da API
│   │   └── index.js     # servidor Express
│   ├── .env.example
│   └── package.json
├── .env.example         # variável do front (VITE_API_URL)
└── package.json
```

---

## 1. Rodar localmente no CMD (Windows)

### Pré-requisitos
- **Node.js 18+** instalado ([nodejs.org](https://nodejs.org))
- **PostgreSQL** instalado e rodando, OU um banco Postgres no Railway

### Passo a passo

**1) Back-end**

```cmd
cd server
npm install
copy .env.example .env
```

Edite o arquivo `server\.env` e preencha:

```
DATABASE_URL=postgresql://postgres:SUA_SENHA@localhost:5432/atacadao
JWT_SECRET=um-valor-bem-aleatorio-e-secreto
SEED_ADMIN_EMAIL=admin@atacadao.local
SEED_ADMIN_PASSWORD=troque123
```

Crie o banco (se ainda não existe) e rode migração + seed:

```cmd
npm run migrate
npm run seed
npm start
```

A API sobe em `http://localhost:3333`. O seed cria o **admin** com o e-mail e
senha que você definiu no `.env`.

**2) Front-end** (em outra janela do CMD, na raiz do projeto)

```cmd
npm install
copy .env.example .env
npm run dev
```

O front sobe (porta exibida no terminal) e já conversa com a API local.
Abra no navegador, entre com o admin e comece a usar.

---

## 2. Subir no GitHub

Na raiz do projeto:

```cmd
git init
git add .
git commit -m "Atacadao Cervejaria - backend completo + frontend integrado"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/atacadao-cervejaria.git
git push -u origin main
```

> Troque `SEU_USUARIO` pelo seu usuário do GitHub. Crie o repositório vazio
> antes em github.com (sem README, pois já temos um).

Os arquivos `.env` **não vão** para o GitHub (estão no `.gitignore`). Só os
`.env.example` sobem, servindo de modelo.

---

## 3. Deploy no Railway

Você terá **3 componentes** no mesmo projeto Railway: o banco **PostgreSQL**,
o serviço da **API** (pasta `server`) e o serviço do **front-end** (raiz).

### 3.1. Banco PostgreSQL
1. No Railway, **New Project → Deploy PostgreSQL**.
2. Pronto: o Railway cria a variável `DATABASE_URL` automaticamente.

### 3.2. Serviço da API (back-end)
1. **New → GitHub Repo** e selecione o repositório.
2. Em **Settings → Root Directory**, defina: `server`
3. Em **Variables**, adicione (e referencie o Postgres):

   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | referencie a do Postgres (botão *Add Reference*) |
   | `JWT_SECRET` | um valor longo e aleatório |
   | `JWT_EXPIRES_IN` | `12h` |
   | `CORS_ORIGIN` | a URL pública do front (preencha após o passo 3.3) |
   | `SEED_ADMIN_EMAIL` | seu e-mail de admin |
   | `SEED_ADMIN_PASSWORD` | sua senha de admin |
   | `NODE_ENV` | `production` |

4. O deploy roda `npm run migrate` (via `Procfile` release) e sobe a API.
5. Após o primeiro deploy, rode o seed **uma vez**. No Railway, abra o serviço
   da API → aba **Settings → Deploy**, ou use o terminal do serviço:
   ```
   npm run seed
   ```
   (alternativa: rode `npm run seed` localmente apontando o `DATABASE_URL`
   para o banco do Railway.)
6. Em **Settings → Networking → Generate Domain** para obter a URL pública da
   API (ex.: `https://atacadao-api.up.railway.app`).

### 3.3. Serviço do front-end
1. **New → GitHub Repo**, mesmo repositório.
2. **Root Directory**: deixe vazio (raiz).
3. Em **Variables**, adicione:

   | Variável | Valor |
   |---|---|
   | `VITE_API_URL` | a URL pública da API do passo 3.2 |

4. **Generate Domain** para obter a URL do front.
5. **Volte ao serviço da API** e coloque essa URL do front em `CORS_ORIGIN`.
   Faça redeploy da API para aplicar.

Pronto. Acesse a URL do front, faça login com o admin e use o sistema.

---

## Papéis e permissões

| Ação | admin | caixa | garçom |
|---|:--:|:--:|:--:|
| Login / ver comandas | ✓ | ✓ | ✓ |
| Abrir comanda e lançar itens | ✓ | ✓ | ✓ |
| Dar baixa em pagamento | ✓ | ✓ | — |
| Gerenciar cardápio (produtos) | ✓ | ✓ | — |
| Excluir comanda | ✓ | — | — |
| Gerenciar usuários (`/api/users`) | ✓ | — | — |

> Criação de novos usuários (caixa/garçom) é feita pela API `/api/users`
> (apenas admin). Posso adicionar uma tela de gestão de usuários no front
> se você quiser.

---

## Endpoints da API

```
POST   /api/auth/login            { email, password }  -> { token, user }
GET    /api/auth/me               (auth)

GET    /api/products              (auth)
POST   /api/products              (admin/caixa)
PATCH  /api/products/:id          (admin/caixa)
DELETE /api/products/:id          (admin/caixa)  soft delete

GET    /api/comandas?status=open  (auth)
GET    /api/comandas/summary      (auth)
GET    /api/comandas/:id          (auth)
POST   /api/comandas              (auth)  { customer }
POST   /api/comandas/:id/items    (auth)  { product_id, qty }
PATCH  /api/comandas/:id/items/:itemId   (auth)  { qty }   (qty=0 remove)
DELETE /api/comandas/:id/items/:itemId   (auth)
POST   /api/comandas/:id/pay      (admin/caixa)  { payment_method }
DELETE /api/comandas/:id          (admin)

GET    /api/users  POST /api/users  PATCH/DELETE /api/users/:id   (admin)
```

Todos os valores monetários trafegam em **centavos** (`price_cents`,
`total_cents`) para evitar erros de arredondamento.

---

## Observações técnicas

- **Senhas** com hash `bcrypt`; **autenticação** via JWT (12h por padrão).
- **Transações** no Postgres para lançamento de itens e pagamento (evita
  condição de corrida quando dois dispositivos mexem na mesma comanda).
- **Rate limit** no login (anti força-bruta).
- **helmet** + **CORS** restrito ao domínio do front em produção.
- O front sincroniza automaticamente a cada poucos segundos, então comandas
  abertas por um garçom aparecem para o caixa sem precisar recarregar.
