# Durique — instruções do projeto

SaaS de agenda, pacotes/planos, financeiro e WhatsApp para **clínicas de fisioterapia e estúdios de pilates que atendem particular**. Público usuário: recepcionistas e profissionais **sem familiaridade com tecnologia** — a interface precisa ser óbvia.

Especificação completa (decisões do produto): https://claude.ai/artifact/BSVUa3DbyNXyVkDPUoCFC6

## Stack
- Next.js 15 (App Router, Server Components + Server Actions), TypeScript, Tailwind CSS 4
- Supabase (Postgres + Auth), projeto `durique-piloto` (`vhiygzvlrqrhjrtehfst`, região São Paulo)
- Deploy: Vercel. Variáveis em `.env.example`.

## Regras que não podem ser quebradas
- **Multi-tenant pelo banco.** Toda tabela de negócio tem `clinic_id` e RLS. FKs entre tabelas são compostas `(clinic_id, x_id)` para impedir referência cruzada entre clínicas. Nunca desligar RLS nem usar a service key no app.
- Funções de autorização ficam no schema `private` (fora da API): `private.has_role(clinic, ...papeis)`, `private.is_member`, `private.my_professional_ids()`.
- Papéis fixos: `admin`, `recepcao`, `profissional`, `financeiro`. Profissional só vê as próprias sessões e só altera o status de presença (trigger `guard_attendee_update`).
- **Nada de apagar histórico de pacientes.** Sair de um horário fixo marca as presenças futuras como `removido`; pacientes são arquivados (`active = false`).
- Mudanças de banco: **sempre** como migração nova em `supabase/migrations/` (timestamp + nome), aplicada também no projeto Supabase. Rodar os advisors de segurança depois.
- Fuso: `America/Sao_Paulo` (`-03:00`, sem horário de verão). Use os helpers de `src/lib/format.ts`.

## Conceitos da agenda
- `recurring_series` = horário fixo semanal (ex.: Pilates ter 7h, 4 vagas). `enrollments` = paciente fixo nele.
- `appointments` = cada sessão; geradas por `generate_series_occurrences` / `ensure_agenda` (8 semanas à frente, chamado ao abrir a agenda).
- `appointment_attendees` = paciente na sessão com status (`agendado`, `confirmado`, `presente`, `falta`, `desmarcado_no_prazo`, `desmarcado_fora_prazo`, `removido`). Trigger impede passar da capacidade.
- RPCs: `create_clinic`, `enroll_patient`, `end_enrollment`, `end_series`, `ensure_agenda`.

## Interface (padrões)
- Textos em português simples, sem jargão ("Veio / Faltou / Desmarcou", não "presença/ausência").
- Componentes em `src/components/ui.tsx` (Card, Field, Input, Select, Badge, EmptyState, PageHeader…) e `forms.tsx` (`ActionForm` com mensagens amigáveis, `SubmitButton`, `ConfirmSubmit` para ações destrutivas).
- Toda lista vazia tem um `EmptyState` que diz o que fazer a seguir. Toda ação irreversível pede confirmação.
- Erros do banco passam por `friendlyError()`; nunca mostrar mensagem técnica.
- Mobile first: alvos de toque ≥ 44px, inputs com 16px (evita zoom no iPhone), barra inferior no celular e menu lateral no computador.

## Fases (ver especificação)
1. ✅ Fundação: login, clínica, profissionais, serviços, pacientes (importação), agenda, turmas, recorrência
2. WhatsApp (lembrete, confirmação 1/2, remarcação)
3. Venda: pacotes, planos, reposição com regras, Asaas
4. Financeiro · 5. Prontuário + LGPD · 6. Virar SaaS (convites de equipe, assinatura, link público)

## Comandos
```bash
npm run dev      # desenvolvimento
npm run build    # build de produção
npx tsc --noEmit && npx eslint src
```
