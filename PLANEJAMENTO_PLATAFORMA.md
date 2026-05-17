# Planejamento — Plataforma de Gestão Financeira & Investimentos

> Documento vivo. Atualize conforme avançamos. Versionar junto do código.

---

## 1. Visão Geral

Plataforma **multi-tenant** para gestão financeira pessoal (gastos) e de carteiras de investimento, com:

- **Admin (você)**: acesso global a todos os tenants/carteiras.
- **Cliente (tenant)**: acesso somente-leitura à sua própria carteira/dados.
- Integração futura com **API da Anthropic (Claude)** para análise, anotações e suporte à decisão.
- Exportação de relatórios em todos os módulos.
- Pensada para uso interno inicialmente, mas com arquitetura pronta para web pública e app.

---

## 2. Observações Estratégicas (leitura obrigatória antes de codar)

### 2.1. Regulatório
- No Brasil, **recomendação personalizada de compra/venda** de ativos é atividade regulada pela **CVM** (exige CNPI/credenciamento ou vínculo com casa habilitada).
- A IA (Claude) pode **analisar, comentar, anotar e sugerir hipóteses** — mas evite que o sistema gere *"compre X ações de Y"* para clientes terceiros. Para você mesmo, sem problema. Decisão: **toda saída da IA visível ao cliente terá disclaimer**; recomendações ativas ficam restritas ao seu login admin.

### 2.2. Modelo multi-tenant
Recomendo **row-level multi-tenancy**: todas as tabelas têm `tenant_id`, e o filtro é aplicado em todo query. Em PostgreSQL, complementar com **Row Level Security (RLS)** — mesmo que um bug deixe um filtro escapar, o banco bloqueia. É a defesa em profundidade que vai te salvar quando virar SaaS.

### 2.3. Privacidade & LGPD
Dados financeiros são **sensíveis**. Desde o dia 1:
- Senhas com `argon2` ou `bcrypt` (nunca SHA puro).
- TLS obrigatório.
- Logs de auditoria (`audit_log`) para toda ação relevante.
- Backup criptografado.
- Política clara de quem acessa o quê (você admin, cliente vê só o dele).

### 2.4. Escopo dos 10 dias
**Realista**: em 10 dias entregamos o **módulo de Gastos completo + base sólida (auth, multi-tenant, deploy local)**. Investimentos vão começar no dia 8–10 e ser o foco do próximo ciclo. Não vou prometer carteira completa em 10 dias com qualidade — seria mentira.

---

## 3. Stack Sugerida

| Camada | Escolha | Motivo |
|---|---|---|
| Backend | **Python + FastAPI** | Async, tipagem, OpenAPI automático, ótimo p/ integrar API do Claude depois |
| Banco | **PostgreSQL 16** | RLS nativo, JSON, robusto |
| ORM | **SQLAlchemy 2.0 + Alembic** | Migrations versionadas |
| Auth | **JWT + refresh token** | Stateless, fácil escalar; `argon2` p/ hash |
| Frontend | **Next.js 14 (App Router) + TypeScript** | SSR, fácil virar app via React Native depois, ecossistema gráfico forte |
| UI | **shadcn/ui + Tailwind** | Componentes acessíveis, customizáveis |
| Gráficos | **Recharts** ou **Chart.js** | Suficientes p/ pizza, barras, linha |
| Relatórios | **ReportLab** (PDF) + **openpyxl** (XLSX) | Padrão maduro em Python |
| Container | **Docker Compose** local | Reproduzível |
| Versionamento | **Git + GitHub privado** | Branch protegido na main |

> Se preferir outro stack (Node puro, Django, etc.) é só dizer e a gente troca. Mas essa escolha já te coloca pronto para a API da Anthropic.

---

## 4. Arquitetura Inicial

```
plataforma/
├── backend/
│   ├── app/
│   │   ├── core/          # config, segurança, deps
│   │   ├── db/            # session, base, RLS helpers
│   │   ├── models/        # SQLAlchemy
│   │   ├── schemas/       # Pydantic
│   │   ├── api/           # routers (v1)
│   │   │   ├── auth.py
│   │   │   ├── tenants.py
│   │   │   ├── expenses.py
│   │   │   ├── categories.py
│   │   │   ├── reports.py
│   │   │   └── portfolio.py  # futuro
│   │   ├── services/      # lógica de negócio
│   │   └── main.py
│   ├── alembic/           # migrations
│   ├── tests/
│   └── pyproject.toml
├── frontend/
│   ├── app/               # Next.js App Router
│   ├── components/
│   ├── lib/               # api client, auth
│   └── package.json
├── docker-compose.yml
└── README.md
```

### Modelo de dados (núcleo)

```
users (id, email, password_hash, role['admin'|'client'], created_at)
tenants (id, name, owner_user_id, created_at)
user_tenant_access (user_id, tenant_id, role)   -- admin tem acesso a todos
categories (id, tenant_id, type['expense'|'income'|'investment'], name, color)
transactions (id, tenant_id, category_id, type, amount, description, date, created_by)
credit_cards (id, tenant_id, name, closing_day, due_day, limit)
credit_card_purchases (id, card_id, description, total_amount, installments_total, installments_current, purchase_date)
planned_investments (id, tenant_id, month, asset_label, amount_planned, note)
audit_log (id, user_id, tenant_id, action, entity, entity_id, payload_json, ip, ts)
```

Para investimentos (próximo ciclo):
```
portfolios, assets, asset_classes, transactions_invest, dividends, goals, snapshots_patrimony
```

---

## 5. Cronograma 10 Dias

> Cada dia tem entregáveis claros. Se atrasar 1 dia, empurrar o resto e revisar no dia 10.

### **Dia 1 — Fundação & Ambiente**
- [ ] Setup do repositório Git (branch `main` protegida, branch `develop`).
- [ ] `docker-compose.yml` com Postgres 16 + pgAdmin.
- [ ] Esqueleto FastAPI rodando (`/health`).
- [ ] Esqueleto Next.js rodando.
- [ ] `.env.example` com todas as vars.
- [ ] Definir convenções (linter: `ruff` + `eslint`; formatter: `black` + `prettier`).
- **Entregável**: `docker compose up` sobe tudo, frontend mostra "Hello", backend responde `/health`.

### **Dia 2 — Auth & Multi-tenant**
- [ ] Models: `users`, `tenants`, `user_tenant_access`.
- [ ] Migration Alembic inicial.
- [ ] Endpoints: `POST /auth/register` (só admin cria contas no início), `POST /auth/login`, `POST /auth/refresh`, `GET /me`.
- [ ] JWT com claim `tenant_id` ativo + `role`.
- [ ] Middleware: extrai `tenant_id` do token e injeta em todo query.
- [ ] Habilitar **RLS no Postgres** para `transactions`, `categories`, `credit_cards`.
- [ ] Seed: usuário admin (você) + 1 tenant de teste + 1 usuário cliente.
- **Entregável**: login funcional, admin lista todos tenants, cliente só vê o dele.

### **Dia 3 — Categorias & Transações (base)**
- [ ] Model `categories` (livre, sem pré-definição — só `type`).
- [ ] Model `transactions` (entrada, gasto, investimento).
- [ ] CRUD completo via API: `categories`, `transactions`.
- [ ] Validações Pydantic (valor > 0, data válida, categoria pertence ao tenant).
- [ ] Filtros: por mês, ano, tipo, categoria.
- [ ] Testes unitários básicos (pytest) — pelo menos auth e CRUD.
- **Entregável**: API testada via Swagger/curl para gestão de categorias e lançamentos.

### **Dia 4 — Frontend: Auth + Layout + Lançamentos**
- [ ] Tela de login.
- [ ] Layout principal (sidebar, header, troca de tenant se admin).
- [ ] Página "Gastos" com tabela de transações do mês.
- [ ] Modal/form para criar transação (campos livres + categoria livre — cria nova categoria inline se não existir).
- [ ] Listagem com filtros (mês, tipo, categoria).
- **Entregável**: você consegue logar, escolher tenant, adicionar e listar lançamentos.

### **Dia 5 — Cartão de Crédito & Aportes Planejados**
- [ ] Model `credit_cards` e `credit_card_purchases` (com parcelas).
- [ ] Lógica: ao criar compra parcelada, gerar registros mês a mês (ou calcular on the fly — decidir).
- [ ] Endpoint: "fatura do mês X" (soma das parcelas que caem no mês).
- [ ] Model `planned_investments` (anotação livre: o que pretende aportar no mês).
- [ ] Frontend: aba "Cartão" + aba "Aportes Planejados".
- **Entregável**: registro de compras no cartão com parcelamento e visualização da fatura mensal.

### **Dia 6 — Dashboard & Gráficos**
- [ ] Endpoint `GET /dashboard/summary?month=&year=`: totais, % por categoria, comparativo mês anterior.
- [ ] Endpoint `GET /dashboard/yearly?year=`: série temporal.
- [ ] Frontend dashboard:
  - Cards: total gasto, total entrada, total investido, saldo do mês.
  - Gráfico pizza: gastos por categoria.
  - Gráfico linha: evolução ano.
  - Gráfico barras: entrada vs gasto vs investimento por mês.
- [ ] Campos extras dinâmicos (você pediu): permitir adicionar "novo campo de gasto/entrada" — implementado como criar categoria nova on the fly.
- **Entregável**: dashboard visualmente útil.

### **Dia 7 — Exportação de Relatórios**
- [ ] Serviço `report_service`: gera PDF (ReportLab) e XLSX (openpyxl).
- [ ] Endpoints: `GET /reports/expenses?format=pdf|xlsx&month=&year=`.
- [ ] Conteúdo: resumo, tabela completa, gráficos embutidos no PDF.
- [ ] Frontend: botão "Exportar" em cada tela relevante.
- [ ] Audit log: registrar quem exportou o quê.
- **Entregável**: relatório PDF e Excel bem formatados.

### **Dia 8 — Segurança, Audit, Hardening**
- [ ] Rate limiting (`slowapi`) no login e endpoints sensíveis.
- [ ] CORS configurado direito.
- [ ] Headers de segurança (HSTS, CSP básico, X-Frame-Options).
- [ ] `audit_log` populado em todas as ações de escrita.
- [ ] Validar que cliente NUNCA consegue ver dados de outro tenant (testes de penetração caseiros).
- [ ] Validar RLS funciona mesmo com query maliciosa.
- [ ] Refresh token rotativo, invalidação no logout.
- [ ] Política de senha forte + bloqueio após N tentativas.
- **Entregável**: checklist OWASP Top 10 revisado, com itens marcados.

### **Dia 9 — Investimentos (esqueleto)**
- [ ] Models: `portfolios`, `assets`, `transactions_invest` (compra/venda), `dividends`.
- [ ] CRUD básico via API.
- [ ] Lógica: preço médio, posição atual, total investido por carteira.
- [ ] Frontend: tela "Carteiras" com listagem por tenant; tela detalhe com ativos.
- [ ] Adição manual de operações (compra, venda, dividendo recebido).
- **Entregável**: lançamento manual de operações funciona, mostra posição.

### **Dia 10 — Investimentos (dashboard) + Polimento + Deploy**
- [ ] Dashboard da carteira: alocação por classe (pizza), evolução do patrimônio (linha), proventos recebidos (barras).
- [ ] Objetivos (patrimônio meta, proventos meta) — model + tela simples de barra de progresso.
- [ ] Exportar relatório da carteira.
- [ ] Revisão geral, testes, README, instruções de deploy.
- [ ] Deploy em VPS pessoal (ou só local documentado) — TLS via Caddy/Traefik, backup automático do Postgres.
- **Entregável**: plataforma rodando, módulo de gastos 100%, investimentos com MVP funcional, pronta para evoluir.

---

## 6. Próximos Ciclos (pós-dia 10)

- **Ciclo 2 — Investimentos completo**: cotação automática (via API tipo brapi/Alpha Vantage), rentabilidade real, comparação com índices, IR (DARF mensal pra trades), histórico de aportes detalhado.
- **Ciclo 3 — Integração Claude API**:
  - Análise de carteira sob demanda ("comente esta alocação").
  - Anotações inteligentes (você dita, Claude estrutura).
  - Detecção de padrões nos gastos.
  - Endpoint protegido: só admin chama, com rate limit e log de tokens consumidos.
- **Ciclo 4 — Onboarding de cliente real + área pública**.
- **Ciclo 5 — App mobile** (React Native compartilhando API).

---

## 7. Decisões em Aberto (decidir antes do dia 1)

| Tópico | Opções | Recomendação |
|---|---|---|
| Stack backend | FastAPI / Django / Node | **FastAPI** |
| Frontend | Next.js / Vite+React / Remix | **Next.js** |
| Hospedagem futura | VPS própria / Railway / Fly.io / AWS | VPS pessoal no início |
| Cotação de ativos (ciclo 2) | brapi (BR grátis) / Alpha Vantage / paga | **brapi** p/ começar |
| Moeda | Só BRL / Multi-moeda | Só BRL no MVP |
| Auth de cliente | Email+senha / Magic link | Email+senha + 2FA opcional |

---

## 8. Critérios de "Pronto" (Definition of Done) por feature

Toda feature só fecha quando:
1. Tem migration aplicada.
2. Tem endpoint testado (pytest).
3. Tem tela frontend correspondente (se aplicável).
4. Respeita o filtro de tenant.
5. Está logada no `audit_log` se for escrita.
6. Tem tratamento de erro consistente (sem 500 vazando stack).
7. Foi testada manualmente com 2 usuários (1 admin, 1 cliente).

---

## 9. Riscos & Mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| Vazamento de dados entre tenants | Crítico | RLS no Postgres + testes automatizados de isolamento |
| Senha fraca de admin | Alto | Senha forte obrigatória + 2FA quando virar produção |
| Perda de dados | Alto | Backup diário do Postgres criptografado |
| Atraso no cronograma | Médio | Buffer no dia 10; investimentos pode escorregar p/ ciclo 2 |
| Uso indevido da IA para recomendação regulada | Médio | Disclaimer + escopo limitado p/ clientes |

---

## 10. Próximos passos imediatos

1. Você valida ou ajusta a **stack** (seção 3) e as **decisões em aberto** (seção 7).
2. Eu monto o **Dia 1** (scaffold completo: docker-compose, FastAPI base, Next.js base, README).
3. Seguimos.

---

*Última atualização: dia 0 — planejamento inicial.*
