# Dev Dashboard — Visão Geral

> Documento técnico completo do sistema de orquestração multi-agente.  
> Última actualização: 2026-03-06

---

## 1. O que é o Dev Dashboard?

O **Dev Dashboard** é um painel web que orquestra um time de agentes de IA para desenvolvimento de software. Moniz cria tasks, os agentes executam-nas de forma autónoma, e Moniz aprova o trabalho em gates estratégicos.

**Quem usa:** Bruno Moniz (Product Owner) + agentes IA do time.  
**Onde corre:** VPS Ubuntu, acessível via Caddy reverse proxy.  
**Stack:** Next.js 15 · shadcn/ui · Drizzle ORM · SQLite (libSQL) · Docker.

---

## 2. Arquitectura

```
┌─────────────────────────────────────────┐
│               Browser (Moniz)           │
│   Next.js 15 App Router (SSR + Client)  │
│   shadcn/ui · Tailwind · ReactFlow      │
└────────────────┬────────────────────────┘
                 │ HTTP / SSE
┌────────────────▼────────────────────────┐
│         Next.js API Routes              │
│   /api/tasks  /api/agents  /api/logs    │
│   /api/flow   /api/stream  /api/chat    │
└────────────────┬────────────────────────┘
                 │ Drizzle ORM
┌────────────────▼────────────────────────┐
│         SQLite (libSQL)                 │
│         data/dashboard.db              │
└─────────────────────────────────────────┘
                 ▲
                 │ HTTP (REST)
┌────────────────┴────────────────────────┐
│  OpenClaw Agents (cada um é um processo │
│  autónomo que consulta e actualiza o DB)│
└─────────────────────────────────────────┘
```

**Rede Docker:** `vps-net` (172.18.0.0/16)  
**Dashboard IP:** 172.18.0.3:3000  
**Caddy:** reverse proxy externo  
**OpenClaw:** corre no host (não em container)

---

## 3. O Time de Agentes

| ID | Nome | Papel | Modelo | Emoji |
|---|---|---|---|---|
| `main` | **Atlas** | Orquestrador — coordena todo o time, responde ao Moniz | claude-sonnet-4-6 | 🧠 |
| `pm` | **Iris** | Product Manager — clarifica requisitos, escreve specs | claude-haiku-4-5 | 📋 |
| `architect` | **Orion** | Tech Lead — define arquitectura, aprova decisões técnicas | claude-sonnet-4-6 | 🏗️ |
| `frontend` | **Pixel** | Frontend Dev — Next.js 15, shadcn/ui, Tailwind, acessibilidade | claude-haiku-4-5 | 🎨 |
| `backend` | **Forge** | Backend Dev — APIs, Drizzle ORM, SQLite, autenticação | claude-haiku-4-5 | ⚙️ |
| `devops` | **Vega** | DevOps — Docker, Caddy, CI/CD, infra, uptime | claude-haiku-4-5 | 🚀 |
| `qa` | **Lyra** | QA Engineer — testes, edge cases, validação, bug reports | claude-haiku-4-5 | 🔍 |
| `reviewer` | **Argus** | Code Reviewer — padrões, boas práticas, aprovação de código | claude-haiku-4-5 | 👁️ |

**Por que dois modelos?**  
- `sonnet-4-6` para decisões de alto nível (Atlas, Orion) — mais raciocínio, mais custo.  
- `haiku-4-5` para execução (restantes) — rápido, económico, suficiente para tarefas bem definidas.

---

## 4. Fluxo de Desenvolvimento (Kanban)

```
Backlog → Todo → In Progress → Review → QA → Waiting Approval → Done
```

| Coluna | Quem age | O que acontece |
|---|---|---|
| **Backlog** | Moniz | Moniz cria o card com título e descrição |
| **Todo** | Atlas / Iris | Atlas atribui a agente; Iris clarifica se necessário |
| **In Progress** | Agente assignado | Agente executa a task (código, documentação, análise) |
| **Review** | Argus | Code review — aprova ou devolve com comentários |
| **QA** | Lyra | Testes e validação — aprova ou reporta bugs |
| **Waiting Approval** | **Moniz** ⚠️ | **Gate humano** — Moniz aprova ou rejeita antes de continuar |
| **Done** | — | Task concluída e deployada |

**Gates de aprovação humana:** Qualquer task em `waiting_approval` requer acção explícita de Moniz no dashboard (Aprovar / Rejeitar).

---

## 5. Funcionalidades do Dashboard

### Kanban Board
- Colunas drag-and-drop para cada status
- Cards com prioridade, agente assignado, tags
- Badge de aprovações pendentes (laranja)
- Criar card via botão "+ Nova Task"

### Flow View
- Visualização ReactFlow do pipeline completo
- Nós: cada agente + Moniz no topo
- Edges: activos (azul animado), planeados (cinza), recentes (verde), retorno/rejeição (vermelho tracejado)
- Estrutura estática sempre visível mesmo quando sistema idle

### Agentes Panel
- Status em tempo real de cada agente (idle / working / error / offline)
- `currentTask` — o que cada agente está a fazer agora
- `lastSeen` — último heartbeat

### Logs Panel
- Stream de logs de todos os agentes
- Filtrável por agente e nível (info / warn / error)
- Auto-scroll para novos logs

### Chat (por agente)
- Moniz pode enviar mensagem directa a qualquer agente
- Agentes respondem em personagem durante heartbeats

---

## 6. API REST

Base URL: `http://172.18.0.3:3000/api`

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/api/tasks` | Lista todas as tasks (suporta `?status=todo`) |
| `POST` | `/api/tasks` | Cria nova task |
| `PATCH` | `/api/tasks/:id` | Actualiza status, assignedAgent, etc. |
| `GET` | `/api/agents` | Lista todos os agentes |
| `PATCH` | `/api/agents` | Actualiza status/currentTask de um agente |
| `GET` | `/api/logs` | Lista logs (suporta `?agentId=&level=&limit=&offset=`) |
| `POST` | `/api/logs` | Cria entrada de log |
| `GET` | `/api/flow` | Dados para o Flow View (nodes + edges) |
| `GET` | `/api/stream` | SSE stream — eventos em tempo real |
| `GET` | `/api/messages/pending` | Mensagens de chat não lidas |
| `POST` | `/api/agents/:id/messages` | Envia mensagem de/para agente |
| `PATCH` | `/api/agents/:id/messages/:msgId` | Marca mensagem como lida |

**Autenticação:** Nenhuma por agora — acesso restrito à rede `vps-net` via Docker.

---

## 7. Infra­estrutura

```
VPS Ubuntu (vps-1200754)
├── Docker (vps-net: 172.18.0.0/16)
│   └── dev-dashboard (172.18.0.3:3000)
│       ├── Next.js 15 (standalone build)
│       └── SQLite: /app/data/dashboard.db (volume)
├── Caddy (reverse proxy — expõe dashboard externamente)
└── OpenClaw (nativo no host)
    └── Atlas (agent main) — orquestra via HTTP
```

**Deploy:**
```bash
cd ~/projects/dev-dashboard
docker compose up -d --build
```

**Logs do container:**
```bash
docker logs dev-dashboard -f
```

**Acesso ao DB (debug):**
```bash
python3 -c "
import sqlite3
conn = sqlite3.connect('/var/lib/docker/volumes/dev-dashboard_dashboard-data/_data/dashboard.db')
# ou via docker exec:
# docker exec dev-dashboard sqlite3 /app/data/dashboard.db
"
```

---

## 8. Como usar no dia a dia

### Criar uma task
1. Abre o dashboard
2. Clica **"+ Nova Task"**
3. Preenche título, descrição, prioridade
4. Salva — aparece em **Backlog**

### Acompanhar progresso
- **Kanban** — visão por status
- **Flow View** — visão por agente (quem está a trabalhar em quê)
- **Logs** — o que cada agente está a fazer/pensando

### Aprovar uma task
1. Card entra em **Waiting Approval** (badge laranja no header)
2. Clica no card → lê o resumo do que foi feito
3. Clica **Aprovar** (move para Done) ou **Rejeitar** (volta para Review com comentário)

### Ver o que os agentes estão a fazer
- Página **Agentes** — status em tempo real
- Flow View — edges activos mostram fluxo de trabalho actual

### Falar com um agente
- Chat no menu lateral — selecciona o agente
- Envia mensagem — o agente responde no próximo heartbeat (~30min) em personagem

---

## 9. SSE — Actualizações em Tempo Real

O endpoint `GET /api/stream` emite eventos SSE:

| Evento | Payload | Frequência |
|---|---|---|
| `agents_update` | Array de todos os agentes | A cada 1s |
| `tasks_update` | Array de todas as tasks | A cada 1s |
| `log_entry` | Último(s) log(s) | A cada 1s (se houver) |
| `ping` | `{ ts: timestamp }` | A cada 1s (keepalive) |

**Fallback:** se SSE falhar, o frontend reinicia polling a 2-3s.

---

*Documento mantido por Atlas 🧠 — actualizar sempre que a arquitectura mudar.*
