# Durique — roteiro (onde estamos e o que vem)

Atualizado em 16/11/2026. Detalhes técnicos de cada parte em `CLAUDE.md`. Referência de telas analisadas (sistema concorrente, só inspiração — nada de copiar nomes, textos ou visual) em `research_notes/benchmark-telas.md`. Pesquisa de mercado em `reports/`.

## Pronto e no ar (durique.vercel.app)
- Agenda (Hoje com resumo Consultas × Aulas, "Para fazer hoje", por profissional, semana), bloqueio de horário, turmas em colunas com chamada, evolução da aula.
- Pacientes com abas, resumo de uma linha, vínculos, linha do tempo; prontuário COFFITO com sinais vitais, IMC e mapa de dor; exercícios para casa.
- Catálogo (serviços, pacotes, planos, prazo de desmarcação por serviço).
- Financeiro: resumo com gráficos, cobranças com Pix copia e cola, lançamentos, comissões, relatórios (NPS, Wellhub/TotalPass), Carnê-Leão.
- Link único da clínica (agendar + "Já sou paciente"), painel do aluno com abas, pré-avaliação configurável, pesquisa de satisfação, documentos com assinatura, agenda no Google.
- Menu: Hoje · Pacientes · Turmas · Catálogo · Mais.

## Etapa 4 — Gestão (próxima)
1. "Saúde do negócio": indicadores separados Consultas × Aulas, metas (realizado × meta), "Faça esta semana", por profissional gera × custa × sobra.
2. Registrar **alta** do paciente (base para medir altas × abandono de tratamento).
3. Funil de contatos (CRM): Novo → Contato → Avaliação → Efetivado → Perdido, origem, tarefas, WhatsApp.
4. Atendimentos realizados com filtros (período, profissional, serviço, tipo) e planilha.
5. Equipe junto com comissões (botão Pagar comissão) e categorias financeiras editáveis com cor.
6. Configurações em cartões por assunto, horário de funcionamento e feriados.
7. Primeiros passos guiado (barra "1 de N · Continuar").

## Depende de terceiros
- WhatsApp automático (Zapster — confirmar se é API oficial): avisos em cartões por grupo (agendamento, relacionamento, satisfação, financeiro, documentos), janela de envio, fila automática.
- Asaas: Pix/cartão com baixa automática, pagar pelo painel, NFS-e.
- Assinatura do Durique (SaaS) e cadastro com teste grátis.

## Pendências menores
- Logo e capa da clínica + anexos na ficha (precisam de armazenamento de arquivos).
- Botão "Remarcar" direto no painel do aluno.
- Validar com advogado a assinatura desenhada (contrato/prontuário) e confirmar código de ocupação do Carnê-Leão.
