# Benchmark de telas (sistema de referência enviado pelo usuário) — anotações para adaptar

Objetivo: inspiração de organização/fluxo. Não copiar marca, textos nem visual.

## 1. Estrutura geral
- Menu lateral estreito: Dia, Pacientes, Aulas, Catálogo, Mais (+ ajuda, sino de avisos com contador, configurações, avatar).
- "Mais" agrupado por assunto: Dinheiro & Fiscal (Financeiro, Receita Saúde, Notas fiscais); Pacientes & Captação (Link da Clínica, Documentos, CRM/funil de leads, Avisos automáticos) …
- Consultas (individual) × Aulas (grupo) separados por bolinha de cor em todas as telas.
- Guia "Configuração da clínica · 1 de 9 · Retomar →" sempre no rodapé (Faço sozinho / Esconder / Configurar pelo WhatsApp / Continuar).

## 2. Tela Dia
- 3 colunas: linha do tempo + botão Agendar + atalhos (Bloquear horário, Aula experimental, Repor aula) | detalhe abre no meio sem trocar de tela | Resumo do dia.
- Resumo: Consultas (sessões, realizadas, a confirmar, em risco ≤2h sem confirmar) e Aulas (aulas, alunos, ocupação %); "Ações de hoje": chamadas pendentes, evoluções pendentes.
- Filtros: Tudo/Consultas/Aulas · Agendados/Confirmados/Concluídas/Vagos · profissional · Lista/Por profissional.

## 3. Pacientes
- Master-detail; busca (atalho ⌘K); Todos/Consultas/Aulas/Arquivados; chips Aniversariantes do mês, Sem sessão; Recentes; selo AULAS/CONSULTAS; subtítulo com diagnóstico/plano.

## 4. Aulas
- Semana em colunas; card: ocupação, presença pendente, "0/1 confirmaram" (WhatsApp), Marcar todos como presentes, ✓/✗ por aluno, Preencher vaga · N livres; evolução disponível no dia.
- Topo: Lista de espera, Planos de aula, Nova matrícula, Aula experimental, Nova turma; visões Calendário/Colunas/Dia; filtros dias/serviço.

## 5. Catálogo
- Serviços agrupados Consultas/Aulas com preço avulso, nº de pacotes/planos/alunos, aviso "FALTA 1" quando incompleto.

## 6. Link da Clínica (um link, duas portas)
- Porta 1 (não paciente): página de agendamento. Porta 2 (WhatsApp já é paciente): painel do paciente.
- Config em lista com estado à direita + prévia ao vivo: logo/cor/capa; serviços online (do Catálogo); profissional sem horário (alerta); exibir preço; convênios; fila de espera (reserva 2h); botões WhatsApp/Instagram; boas-vindas; rodapé (modalidade, antecedência, contato, mapa).
- Painel: planos em cartões (usadas/restantes/vence, Comprar sessões, Mudar plano), aviso pacote acabando, Agendar/Agenda/Pagar/Documentos, abas Início/Agenda/Pagar/Tratamento/Perfil.
- Ajustes do painel: remarcar/cancelar sozinho (prazo por serviço), pagar pelo painel, documentos, marcar sessão nova/comprar/matricular/mudar plano, exercícios (eles: "futuro"), avisos.

## 7. Avisos automáticos (WhatsApp)
- Topo: status da conexão WhatsApp Business (Reconectar) + janela de envio (08h–20h; fora disso antecipa p/ véspera).
- Grupos com "N/M ativas" e "Desligar todos"; "quem recebe" por grupo; cards com ícone, Ativo/Inativo, descrição, gatilho (Imediato, 24h antes, 2h antes…), selo "Equipe" quando o aviso vai para a equipe.
- Agendamento: confirmação imediata, remarcação, confirmação do próximo dia (24h, responde 1/2), segundo toque (2h antes), liberar vaga sem confirmação (aula), novo agendamento online, pendência não confirmada (equipe, a cada 24h), fila de espera vaga aberta (consulta/aula), entrou na fila, resposta automática "1", matrícula confirmada.
- Relacionamento: aniversário, pós-sessão (após evolução), reativação de inativos (180 dias, abre lead no CRM), sumiço das aulas.
- Satisfação: pesquisa (CSAT + NPS), retorno ruim (equipe).
- Financeiro: cobrança/link de pagamento, renovação de pacote, lembrete 24h após link, lembrete antes do vencimento, aviso de vencimento, cobrança expirada (equipe), link "pagar depois", nota fiscal por WhatsApp, falha na cobrança automática.
- Documentos e avaliação: consentimento LGPD, contrato, autorização de imagem, declaração de comparecimento (PDF), convite pré-avaliação, avaliação/escala para o paciente preencher.

## 8. Como vai a clínica (metas e diagnóstico)
- Topo: mês (setas) · Mês/Semestre/Ano · Tudo/Consultas/Aulas · botão "Definir metas".
- Dois "mundos" com indicadores próprios, cada um com realizado × meta (barra de progresso, cor conforme atingido):
  - Consultas (episódio finito: pacote → sessão → alta): ticket médio do pacote, ocupação da agenda do fisio, altas no mês ("sucesso", meta de fluxo — alta não é churn), churn clínico (pacote venceu incompleto sem alta nem renovação; meta máx.).
  - Aulas/Studio (recorrente: matrícula → mensalidade → frequência): ticket médio da mensalidade, lotação das turmas, novas matrículas (meta de fluxo), churn de matrícula (cancelou mensalidade; meta máx.).
- Diagnóstico mensal gerado por IA: frase-resumo, Foi bem / Travou / Ação, "Faça esta semana" priorizado (a receber, faltas, leads), botão Gerar diagnóstico, aviso "revise antes de compartilhar".
- Sinais que antecipam (cartões clicáveis): leads novos, taxa de confirmação (alvo 85%), ocupação consultas, lotação aulas, no-show (alvo <5%), satisfação.
- Resultado do caixa (lagging) com atalho ao Financeiro.
- Por profissional: realizadas, gera (receita), custa (comissão/custo fixo), sobra; folha do período em % do recebido com selo (Saudável).
- Reincidentes: mais faltas no mês; pagamento atrasado (dias).
- No "Mais": seção "A clínica" — Como vai a clínica, Atendimentos realizados (por profissional), Equipe, Wiki & Suporte, Configurações.

## 9. Configurações (só admin)
- Página de cartões por função, cada um com lista de itens e o estado atual em cinza:
  - Clínica: dados, identidade (logo, cor, banner, textos — herdados por documentos, app do paciente, página pública, pré-avaliação), horário de funcionamento (Seg–Sex 07–21, Sáb 07–12), salas e recursos, prontuário · campos da clínica.
  - Agenda: Link da Clínica, lembretes e avisos, fila de espera (aulas: recepção escolhe · aluno entra pelo app · vaga reservada 2h), pré-avaliação (perguntas próprias por consulta/aula).
  - Financeiro: recebimento (conta própria via Asaas — receber, sacar, cobrar), pagamento online (no agendamento / existente), NFS-e (R$ 0,99 por nota, sem mensalidade), categorias financeiras, convênios e parceiros (planos de saúde e Wellhub/TotalPass — fechamento e prazo).
  - Conta & plataforma: plano e faturamento (assinatura), termos e privacidade (LGPD), exportar dados (pacientes, agenda, prontuário, aulas, financeiro), integrações (Wellhub check-in automático), segurança.

## 10. CRM · Funil de leads
- Kanban: Novo → Contato → Avaliação → Efetivado → Perdido (etapas editáveis), arrastar cards; detalhe abre à direita (mover etapa, criar tarefas, mandar WhatsApp).
- Card: nome, telefone, nota ("Veio pelo anúncio de Pilates"), origem colorida (Instagram, WhatsApp, Indicação, Google), quando entrou, bolinha de temperatura.
- Topo: "N leads · N tarefas abertas", busca, Filtros, Editar etapas, R$ (valor do funil); chips Todos, Precisa de você, Meus leads, Quentes.
- Integra com: agendamento online, reativação de inativos (abre lead), "Faça esta semana".

## 11. Ficha do paciente
- Faixa no topo do app: "Teste grátis · faltam 7 dias · Assinar agora →".
- Master-detail: lista à esquerda, ficha à direita.
- Cabeçalho: avatar, nome, idade · telefone, sino (avisos do paciente); botões Nova avaliação / Nova evolução (evolução bloqueada sem pacote/sessão).
- "Resumo" de uma linha (diagnóstico/queixa) editável — aparece também na lista de pacientes.
- "Vínculos" em 2 cartões lado a lado:
  - Pacote · Consultas: estado (Em tratamento / Sem pacote), "Sessão de fisioterapia · 2/10 · 8 restantes", barra, "Próxima: Qui 19/11 15:00 · vence 15/04/2027", Gerir ▾; vazio: "Venda um pacote pra abrir sessões e evolução" + Vender pacote.
  - Matrícula · Aulas: estado (Mensalista), "Pilates · Grupo · 2×/sem", "Próxima: Qua 18/11 07:00 · R$ 480/mês", Gerir ▾; vazio: "Sem matrícula em aulas" + Matricular em aulas.
- Abas: Avaliação, Evoluções, Escalas, Financeiro, Anexos, Documentos, Cadastro, Linha do tempo.
- Avaliação: cartão "Pré-avaliação — queixa, dor e histórico pelo celular antes da consulta" + Pedir no WhatsApp; avaliação "Inicial · atual · 17/10/2026 · Dor 6/10" expansível com cartões de sinais (Dor EVA, peso, altura, IMC calculado, PA, FC) e campos (queixa, mobilidade/ADM, força, diagnóstico fisioterapêutico, objetivos, plano/recursos, prognóstico); ações Editar, Imprimir, Ver completa, Enviar ao paciente, Excluir.
- Mapa de dor ao lado: boneco frente/costas com pontos marcados e legenda (Lombar E 6/10 · Muscular).

## 12. Agenda (Dia / Por profissional / Semana)
- Linha do tempo do dia com selo de pendência por item: "Chamada pendente" (aula), "Evolução pendente" (consulta atendida sem evolução).
- Visão "Por profissional": coluna por profissional com horas; clicar num horário vazio (+) para agendar; item mostra estado (Atendida) e selo "Evol. !".
- Semana: grade com cores Consultas × Aulas, ocupação no card de aula ("1/7 ocupadas" + mini barra), estado (Confirmado/Atendida), feriado marcado no cabeçalho do dia ("feriado · aberta"), botão Agendar no topo.
- Resumo da semana à direita (mesmos cartões do dia, no período): sessões, realizadas, a confirmar, atrasadas; aulas, alunos, ocupação; "Ações da semana": Confirmar presença · semana (WhatsApp), Chamadas pendentes, Evoluções pendentes.

## 13. Atendimentos realizados (relatório)
- Atalhos de período (Este mês, Este ano, Últimos 12 meses, Ano passado) + De/Até + filtros Profissional, Serviço, Tipo (Consultas e aulas).
- Cartões: atendimentos, consultas (1:1), aulas (turma), pessoas atendidas (sem repetir), recebido no período, valor dos atendimentos (convênio, particular e pacote).
- Lista: quando, paciente, profissional, serviço, tipo, valor (origem: Pacote/Avulsa). "Baixar planilha".

## 14. Equipe
- Cartões: pessoas, atendem, admins; filtros Ativos/Inativos/Todos; botão Convidar membro.
- Lista: membro, papel, repasse %, "Atende"; texto explicando papéis (admin vê tudo; profissional vê a própria agenda e seus pacientes; recepção marca consultas e caixa).
- Comissões no mesmo lugar: regra por profissional (% do atendimento ou R$ por aula dada), "R$ X a pagar", botão Pagar.

## 15. Categorias financeiras (modal)
- Lista com bolinha de cor, selo Despesa/Receita, editar; nova categoria com tipo e cor.

## 16. Convênios e parceiros (modal)
- Três tipos de pagador: plano de saúde (por sessão, com guia, tabela por código), parceiro por check-in (Wellhub/TotalPass, valor fixo por presença), SUS (produção mensal). No Catálogo liga/desliga por serviço.

## 17. Pré-avaliação (configuração)
- Dois formulários independentes: Consulta (individual) e Aula (pilates/turma/estúdio). Na ficha, ao pedir, escolhe qual mandar.
- Cada campo com dois interruptores: Pedir (mostra) e Obrigatória (trava envio sem resposta). "Ligar/Desligar todos" por grupo.
- Regra: só preenche campos vazios da ficha; divergências ficam para a recepção conferir.
- Grupos: Seus dados (nome, CPF, nascimento, telefone, estado civil, e-mail, convênio, carteirinha) · Endereço (CEP, número, endereço, complemento, bairro, cidade, UF) — se tudo desligado o passo some · Sua dor agora (queixa principal [obrig.], dor 0–10, local/região, histórico) · Sua saúde (alergias, medicamentos, cirurgias, doenças/comorbidades, histórico familiar …) · Estilo de vida (objetivo, atividade física semanal, hábitos, como conheceu a clínica) · Contato de emergência (nome, parentesco, telefone) · Perguntas próprias (até 10).

## 18. Fila de espera (configuração)
- Consultas: quem é avisado tem a vaga por N horas (ex.: 2) — depois passa para o próximo da fila.
- Aulas · quando abre vaga (avisado tem 30 min para responder): "A recepção escolhe" (ninguém é avisado sozinho) ou "Automático para o 1º da fila" (WhatsApp; recusou/não respondeu → próximo).
- Interruptor "Aluno entra sozinho na fila pelo app": turma cheia aparece no app com lista de espera (reposição daquela data e vaga fixa); desligado, turma cheia não aparece e a fila é só da recepção.
