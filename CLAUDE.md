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
- `recurring_series` = turma fixa semanal (menu "Turmas", rota /horarios) (ex.: Pilates ter 7h, 4 vagas). `enrollments` = paciente fixo nele.
- `appointments` = cada sessão; geradas por `generate_series_occurrences` / `ensure_agenda` (8 semanas à frente, chamado ao abrir a agenda).
- `appointment_attendees` = paciente na sessão com status (`agendado`, `confirmado`, `presente`, `falta`, `desmarcado_no_prazo`, `desmarcado_fora_prazo`, `removido`). Trigger impede passar da capacidade.
- RPCs: `create_clinic`, `enroll_patient`, `end_enrollment`, `end_series`, `ensure_agenda`.

## Conceitos do financeiro
- `products` = catálogo (pacote de N sessões com validade, ou plano mensal X vezes/semana). `patient_packages` = pacote/plano vendido ao paciente.
- Ao marcar Veio / Faltou / Desmarcou em cima da hora, o trigger `assign_package` consome uma sessão do pacote ativo (`appointment_attendees.package_id`); desfazer devolve. Uso em `package_usage`.
- `transactions` = lançamentos (receita/despesa, `due_date`, `paid_on` nulo = em aberto). `categories` com `system_key` para as automáticas.
- RPCs: `sell_package` (gera parcelas), `ensure_plan_charges` (mensalidades até o mês seguinte), `commission_report` (comissão por sessão realizada).
- Cobranças: `/financeiro/cobrancas` (só como aba do Financeiro; a aba Cobranças do WhatsApp redireciona para lá): atrasadas, 7 dias, em aberto, pagas no mês; Cobrar (WhatsApp), Copiar Pix, Receber. Pix copia e cola estático gerado em `src/lib/pix.ts` (BR Code + CRC16) com a chave em `clinic_settings.pix_*`; aparece também na mensagem de cobrança e no link do aluno (`portal_charges`). Asaas depois só automatiza a baixa.
- Recepção vê e lança só receitas; despesas, resultado e comissões são de `admin`/`financeiro`.

## Prontuário, documentos e regras de estúdio
- `clinical_records` (avaliação/evolução/adendo, Res. COFFITO 414/2012): só admin e profissional que atende veem (`private.can_see_clinical`); assinatura por `sign_clinical_record` (hash + carimbo); assinado é imutável, correção = adendo; acessos em `record_access_log`. `scale_results` para escalas.
- `document_templates` / `patient_documents`: termo gerado com dados do paciente, assinatura desenhada na página pública `/assinar/[token]` (RPCs `get_document_by_token`, `sign_document_by_token`).
- `clinic_settings`: antecedência para desmarcar e validade da reposição. `makeup_credits`: crédito criado ao desmarcar no prazo, consumido ao entrar como reposição (`is_makeup`), devolvido com `release_makeup_credit`.
- `waitlist` (lista de espera por sessão), `freeze_package` (congelar: estende validade, pula mensalidade), `patients_at_risk` (2+ faltas em 30 dias ou 21+ dias sem vir).
- Exportação CSV em `/exportar/[tipo]` (pacientes, sessões, financeiro).
- Agendamento online, exercícios para casa com vídeo e relatórios visuais (ver seção abaixo).

## Portal do aluno e equipe
- `patients.portal_token`: link pessoal `/p/[token]` (sem login). RPCs `portal_get`, `portal_confirm`, `portal_cancel` (aplica a antecedência da clínica), `portal_book_makeup` (exige crédito). `rotate_portal_token` gera novo link.
- Convites: tabela `invites` (e-mail, papel, profissional opcional, 14 dias); página pública `/convite/[token]`; `accept_invite` cria o vínculo e liga o profissional; `clinic_members` lista a equipe com e-mail (só admin). Login/cadastro aceitam `?next=`.
- Cor do profissional (`professionals.color`, paleta em `src/lib/colors.ts`) usada na agenda. Resumo do dia e aniversariantes no topo da agenda de hoje.

## Agendamento online, exercícios e relatórios
- Agendamento online: `clinics.booking_slug/booking_enabled/booking_message`, `services.bookable`, `availability` (períodos por profissional e dia). Página pública `/agendar/[slug]`; RPCs `booking_info`, `booking_slots` (individual: horários livres na disponibilidade sem conflito), `booking_classes` (turmas com vaga), `booking_book`, `booking_book_class` (acha/cria paciente pelo WhatsApp; máx. 3 futuros online). `appointment_attendees.booked_online` mostra selo "online" na agenda. Config em `/ajustes/agendamento-online`.
- Exercícios para casa: `exercises` (biblioteca com vídeo, `/ajustes/exercicios`), `exercise_plans` + `exercise_plan_items` (por paciente, `/pacientes/[id]/exercicios`), `exercise_logs` ("Fiz hoje" + dor 0–10 no portal via `portal_exercises`/`portal_log_exercise`). Visível só para admin/profissional.
- Agenda no Google: `professionals.calendar_token` → feed `.ics` em `/cal/[token].ics` (RPC `calendar_feed`, só primeiro nome do paciente; `rotate_calendar_token`). Página `/ajustes/agenda-google`. É uma via só (Google lê).
- Financeiro visual: `src/components/finance-charts.tsx` (entrou × saiu 6 meses, ritmo do mês). Cores de gráfico `--color-chart-in` / `--color-chart-out` (validadas para daltonismo).
- Lista de pacientes: view `patient_services` (horário fixo ativo, pacote ativo ou sessão −60/+30 dias) → selos de serviço embaixo do nome e abas `?servico=`. `PatientPicker` mostra e busca por telefone.
- Renovação: view `packages_ending` (≤ 2 sessões ou vence em 7 dias) → aviso na agenda de hoje, selo na sessão, caixa "Avisar/Vender renovação" na ficha e aviso no portal.
- Satisfação: tabela `feedback` (0–10 + comentário); pergunta no portal após 3 sessões, 1x a cada 90 dias (`portal_feedback_due`, `portal_feedback`); nota 9–10 vê "Avaliar no Google" (`clinics.review_url`). NPS e comentários em `/financeiro/relatorios`.
- Evolução da aula: `session_evolutions` (nível 1–5 + o que foi trabalhado) e `patient_evolutions` (por aluno). RPC `save_session_evolution` (admin ou profissional da sessão) replica para quem veio (ou para os agendados, se ninguém foi marcado). Formulário na sessão; "Evolução nas aulas" na ficha (nível atual + histórico). Níveis em `src/lib/levels.ts`.
- Notas fiscais: `/financeiro/notas` (aba do Financeiro) com a Planilha do contador → `/exportar/contador` gera .xlsx (exceljs, `src/lib/accountant.ts`; abas Resumo, Entradas, Saídas, Caixa diário, Competência, A receber, Comissões; filtros mês/intervalo, profissional e forma de pagamento), atalho para o Carnê-Leão e NFS-e "em breve".
- Carnê-Leão: `/financeiro/carne-leao` gera o arquivo oficial de importação (`src/lib/carne-leao.ts`: `data;R01.001.001;ocupação;valor;;histórico;PF;CPF titular;CPF beneficiário`, ISO-8859-1, sem cabeçalho, até 1.000 linhas) via `/exportar/carne-leao?mes=`. Código de ocupação em `clinic_settings.carne_leao_ocupacao`. Recebimento sem CPF fica de fora e é listado.
- Wellhub/TotalPass: `clinic_settings.wellhub_*/totalpass_*` (ligado, ID, valor por check-in) em Minha clínica; `patients.access_via` ("Vem por"); selo na agenda/sessão; check-ins do mês × valor em Relatórios. Check-in automático depende de homologação como parceiro.
- Ficha do paciente (`/pacientes/[id]?aba=`): cabeçalho (idade, telefone), `patients.summary` (resumo de uma linha, editável, aparece na lista), cartões Consultas (pacote ativo) × Aulas (turmas fixas + plano), abas Geral, Clínico, Financeiro, Documentos, Linha do tempo (sessões, pagamentos, pacotes, documentos, prontuário), Cadastro.
- Avaliação: sinais vitais em `clinical_records` (`peso_kg`, `altura_cm`, `pressao`, `freq_cardiaca`, entram no hash da assinatura); IMC calculado na tela (`bmi`/`bmiLabel` em `src/lib/clinical.ts`); mapa de dor com boneco frente/costas (`src/components/body-map.tsx`) sobre as mesmas `PAIN_REGIONS`.
- Turmas têm nome próprio (`recurring_series.name`, no formulário de nova turma e na página da turma) usado na agenda, chamada e Catálogo. `/horarios`: barra com semana, busca, Dias/Serviço e visões Calendário (grade de horas, `WeekGrid variant="turmas"`), Colunas e Turmas fixas; cartão abre a aula em `/agenda?d=&s=`.
- Grade de horas `agenda/week-grid.tsx` (Hoje · Semana e Turmas): cartões por tipo, dias fechados listrados (`closed`), links configuráveis. Hoje · Semana tem resumo da semana à direita e + Agendar.
- Detalhe da sessão: aula = professor da turma, Fazer chamada/Fazer evolução, "Chamada · x/y vagas" com + Aluno (`#adicionar`); consulta = Abrir ficha / Realizar evolução, presença, cartão da sessão (serviço, status, evolução, profissional), Corrigir data (`rescheduleAppointment`) e Excluir agendamento.
- Turmas (`/horarios`): "Esta semana" em colunas (`week-columns.tsx`) com Veio/Faltou no card, "Todos vieram" (`markAllPresent`) e "Preencher vaga"; "Horários fixos" (`?v=fixos`) é a lista de turmas.
- Link único (`/agendar/[slug]`): duas portas — "Quero agendar" (fluxo de agendamento) e "Já sou paciente" (RPC `portal_login`: WhatsApp + data de nascimento → token do painel; limite de 5 erros/hora em `portal_login_attempts`). Identidade em `clinics.brand_color/contact_whatsapp/instagram/address/show_prices/waitlist_public` (config em `/ajustes/agendamento-online`). Turma cheia → `booking_full_classes` + `booking_join_waitlist`. `?p=token` pré-preenche nome/WhatsApp.
- Prazo de desmarcação por serviço: `services.cancel_notice_hours` (vazio = clínica), usado em `portal_cancel` (`private.notice_hours`) e no botão Desmarcou.
- Painel do aluno (`/p/[token]?aba=inicio|aulas|pagar|exercicios|perfil`): saudação + logo da clínica; o mais importante em destaque (próxima sessão com Confirmar/Não vou poder, ou sessões que restam + Agendar); avisos (pacote acabando, pagamento atrasado, pré-avaliação, documento); planos em cartões (restantes, vale até, horários fixos de `portal_get.fixed`, Em dia/Em aberto); Agendar; abas Início, Agenda, Pagar, Exercícios, Perfil (contato, Instagram, mapa).
- Pré-avaliação: `pre_assessment_forms` (por clínica e tipo consulta/aula: campos Pedir/Obrig. + até 10 perguntas próprias; catálogo e padrões em `src/lib/pre-assessment.ts`), `pre_assessments` (token, cópia do formulário, respostas; leitura só clínica). RPCs `request_pre_assessment`, `pre_assessment_status` (sem respostas, p/ recepção), `get_pre_assessment`/`submit_pre_assessment` (página pública `/pre/[token]`; completa só CPF/nascimento/e-mail vazios). Respostas na aba Clínico e ao abrir uma nova avaliação.
- Relatórios: RPC `report_overview` (admin/financeiro) → `/financeiro/relatorios` com `src/components/charts.tsx` (StatTile, ColumnChart, BarList; uma série por gráfico).

## Gestão (Etapa 4)
- Saúde do negócio: `/financeiro/saude` (aba do Financeiro, admin/financeiro) com RPC `business_health(clinic, de, até)` → caixa, Consultas (ocupação = sessões ÷ minutos de `availability`/50, valor médio do pacote, altas, "pararam no meio"), Aulas (vagas ocupadas, mensalidade média, entraram/saíram), sinais (novos contatos, faltas, NPS, confirmadas 7 dias), faltosos e atrasados. Metas em `clinic_goals` (chaves e padrões em `src/lib/goals.ts`, só admin edita). "Faça esta semana" sai desses números. Por profissional: gera × comissão × fica (`commission_report`).
- Fim do tratamento: `discharges` (`alta`/`pausa`/`abandono`), cartão "Fim do tratamento" na aba Geral da ficha; aparece na linha do tempo.
- Novos contatos (CRM): `leads` (admin/recepção), `/contatos` com colunas Novos → Em conversa → Avaliação marcada, abas Viraram pacientes / Não fecharam; "Virou paciente" (`convertLead`) cria/acha o paciente pelo WhatsApp. Quem marca pelo link pela 1ª vez entra sozinho como "Avaliação marcada" (`private.booking_patient`).
- Atendimentos realizados: `/atendimentos` (atalhos de período, filtros profissional/serviço/tipo/situação) e CSV `/exportar/atendimentos` com os mesmos filtros (`src/lib/attendances.ts`).
- Categorias do financeiro com cor (`categories.color`): `/financeiro/categorias`; bolinha da cor nos lançamentos. Automáticas (`system_key`) não podem ser guardadas.
- Feriados e dias fechados: `/ajustes/feriados` (feriados nacionais calculados em `src/lib/holidays.ts`) → `time_blocks` da clínica toda no dia.
- Configurações (`/ajustes`, último item do Mais): cartões por função (Clínica, Agenda, Financeiro, Equipe e conta), cada item com o estado atual e link para o destino. Seções antigas viraram páginas `/ajustes/[secao]` (clinica, equipe, profissionais, regras, pix, apps, documentos, conta). Horário e dados da clínica abrem o passo do assistente com `&so=1` (salva e volta para Configurações).
- Identidade da clínica: `/ajustes/identidade` (`brand-editor.tsx`): logo e foto de capa enviados pelo navegador ao Storage (bucket público `clinic-assets`, pasta = `clinic_id`, só admin grava; `src/lib/supabase/client.ts`), cor (paleta + qualquer cor), nome, frase (`clinics.tagline`), boas-vindas, WhatsApp e Instagram, com prévia ao vivo (página de agendamento, app do paciente, documento, pré-avaliação). `ClinicMark`/`BrandHeader` (`src/components/clinic-mark.tsx`) mostram a marca na página pública, no app do paciente, em `/assinar` e `/pre` (RPC `public_brand(token)`).
- Assistente "Configurar clínica": `/configurar?passo=1..8|fim` (só admin; `/comecar` leva para lá). Passos em `src/lib/setup.ts`: tipo (`clinics.practice_type` fisio/aulas/ambos), pacientes (planilha ou à mão), WhatsApp, horários (`clinic_hours` + `clinics.session_minutes`; profissional sem horário próprio recebe o da clínica em `availability`), serviços e valores (`services-editor.tsx`, sugestões conforme o tipo, vagas por turma), dados da clínica (`clinics.cep/address/cnpj/legal_responsible/responsible_crefito`), página da clínica (link) e equipe (convites). Concluir grava `setup_completed_at`; "Não preciso de ajuda" grava `setup_dismissed`. A barra `src/components/first-steps.tsx` na tela Hoje mostra "Configurar clínica · N de 8 · Continuar" até concluir/dispensar.

## Inteligência artificial
- `src/lib/ai.ts` → `askClaude({system, prompt, schema, effort})`: SDK `@anthropic-ai/sdk`, modelo `claude-opus-5-5`, saída estruturada com zod (`betaZodOutputFormat`), fallbacks do servidor ligados, erros em português. Chave em `ANTHROPIC_API_KEY` (env da Vercel; sem ela `aiEnabled()` é falso e as telas avisam). Nunca mandar nome/CPF de paciente para a IA.
- Resumo da semana com IA: cartão no topo de `/financeiro/saude` (`saude/ai-actions.ts` → `generateWeeklySummary`, números de `business_health` 7d × 7d anteriores + metas), guardado em `ai_summaries` (admin/financeiro, 1 por semana). Sem chave o cartão fica escondido.
- Prontuário por voz: `prontuario/voice-note.tsx` (ditado do navegador, pt-BR) + `prontuario/ai-actions.ts` → `organizeNote(kind, texto)` distribui nos campos da avaliação/evolução e na dor; sem IA, "Colocar no prontuário" cola o texto. Campos do `RecordForm` são controlados.

## Equipe
- `/equipe` (Mais → Equipe; admin e financeiro): profissionais com sessões/gerou/comissão do mês e Pagar (`payCommission`), demais logins, troca de função (`setMemberRole`, só admin, nunca a própria) e tabela "O que cada função vê". `/financeiro/comissoes` redireciona para lá; convites continuam em `/ajustes/equipe`.

## Conceitos do WhatsApp
- `whatsapp_settings` (1 por clínica): modo (`manual` agora; `automatico` quando conectar o provedor Zapster), textos `tpl_lembrete`, `tpl_cobranca`, `tpl_renovacao` com variáveis `{nome}`, `{dia}` etc. (`src/lib/messages.ts`).
- Avisos automáticos: `/whatsapp/avisos` — cartões por grupo (Agenda, Relacionamento, Satisfação, Pagamentos, Documentos) com Ligado/Desligado, "Desligar todos", quando sai, selo Equipe/Pela Central e texto editável com prévia. Catálogo dos avisos e textos padrão em `src/lib/automations.ts`; escolhas da clínica em `whatsapp_automations` (template nulo = padrão); horário de envio em `whatsapp_settings.send_from/send_to`. Lembrete, cobrança e renovação também gravam em `tpl_*` (usados pela Central). Os textos saíram de Minha clínica.
- Modo manual: a Central `/whatsapp` monta a mensagem e abre `wa.me` com o texto; `message_log` registra o envio (`WaSendButton`).
- Próximo passo: envio automático via Zapster (Edge Function + pg_cron), webhook para respostas 1/2.

## Interface (padrões)
- Cabeçalho das páginas (`PageHeader`): quando é o primeiro item vira faixa branca de ponta a ponta com linha embaixo e botão voltar quadrado (as colunas de conteúdo têm `overflow-x-clip`).
- Cor da clínica (`clinics.brand_color`, em `getContext().brandColor`) pinta o trilho do menu e o topo do celular; texto claro/escuro por contraste (`textOn` em `src/lib/colors.ts`); logo da clínica no topo se houver.
- Computador: trilho estreito à esquerda com os 5 itens. Telas em duas colunas (`data-split` no conteúdo tira o padding do `main`): tudo do Mais fica no route group `src/app/(app)/(mais)/` cujo layout mostra a lista do Mais à esquerda (`src/lib/mais-menu.ts` + `src/components/mais-nav.tsx`); Catálogo é lista + detalhe (`/catalogo?s=id|novo|geral&t=&q=`). Pacientes: `pacientes/layout.tsx` com a lista à esquerda (`patients-aside.tsx`: busca na hora, abas Todos/Consultas/Aulas/Arquivados, Aniversariantes do mês, Sem sessão) e a ficha à direita. No celular, lista e detalhe são telas separadas.
- Menu (igual no celular e no computador): Hoje (`/agenda`), Pacientes, Turmas (`/horarios`), Catálogo (`/catalogo`: serviços + pacotes/planos, Consultas × Aulas, aviso do que falta), Mais (`/mais`: Dinheiro · Pacientes e divulgação · Sua clínica, filtrado por papel). Financeiro (abas Resumo, Cobranças, Lançamentos, Saúde do negócio, Relatórios, Notas fiscais), Equipe, WhatsApp e Configurações (`/ajustes`) ficam dentro de Mais.
- Tela Hoje no computador: barra de filtros no topo (Dia/Semana, ‹ ›, Tudo/Consultas/Aulas, situação `st=agendados|confirmados|concluidas|vagos`, profissionais, Lista/Por profissional) e 3 colunas: esquerda (dia, Agendar, Bloquear, Experimental, Repor, linha do tempo), meio (sessão escolhida `?s=id` abre ali com `AppointmentDetail` de `agenda/[id]/detail.tsx`), direita (resumo do dia). No celular continua a lista.
- Formulários em aba lateral: rotas interceptadas em `src/app/(app)/@drawer/(.)…` (agenda/nova, agenda/bloquear, agenda/vagas, pacientes/novo, pacientes/[id]/vender, financeiro/novo, horarios/novo) abrem a mesma página dentro de `Drawer` (`src/components/drawer.tsx`) sem sair da tela; link direto abre a página normal. `[...catchAll]` fecha a aba ao navegar.
- Tela Hoje: visões Dia / Por profissional (`pro-grid.tsx`, toque no vazio abre `/agenda/nova?pro=&h=`) / Semana; filtros `t=consultas|aulas`, `pro=`, `f=chamada|evolucao|confirmar|risco`; selos Chamada pendente / Evolução pendente / Em risco (< 2h sem confirmar); resumo Consultas × Aulas e "Para fazer hoje". Cores: consultas `chart-in`, aulas `chart-out`. Atalhos: Agendar, Bloquear horário (`time_blocks`, respeitado no agendamento online), Aula experimental e Repor aula (`/agenda/vagas`).
- Textos em português simples, sem jargão ("Veio / Faltou / Desmarcou", não "presença/ausência").
- Componentes em `src/components/ui.tsx` (Card, Field, Input, Select, Badge, EmptyState, PageHeader…) e `forms.tsx` (`ActionForm` com mensagens amigáveis, `SubmitButton`, `ConfirmSubmit` para ações destrutivas).
- Toda lista vazia tem um `EmptyState` que diz o que fazer a seguir. Toda ação irreversível pede confirmação.
- Erros do banco passam por `friendlyError()`; nunca mostrar mensagem técnica.
- Mobile first: alvos de toque ≥ 44px, inputs com 16px (evita zoom no iPhone), barra inferior no celular e menu lateral no computador.

## Fases (ver especificação)
1. ✅ Fundação: login, clínica, profissionais, serviços, pacientes (importação), agenda, turmas, recorrência
2. ✅ Pacotes, planos e financeiro (caixa, contas a pagar/receber, comissões, previsão de saldo) + agenda em grade semanal
3. WhatsApp (lembrete, confirmação 1/2, remarcação, cobrança)
4. ✅ Prontuário + contrato com assinatura + LGPD; reposição com crédito, lista de espera, congelamento, alunos em risco, exportação
5. Asaas (Pix/cartão com baixa automática), reposição com regras, NFS-e
6. Virar SaaS: ✅ convites de equipe, ✅ portal do aluno; falta assinatura do SaaS e cadastro self-service com teste grátis

## Comandos
```bash
npm run dev      # desenvolvimento
npm run build    # build de produção
npx tsc --noEmit && npx eslint src
```
