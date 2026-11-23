import Link from "next/link";
import { TERMS_UPDATED } from "@/lib/legal";

export const metadata = { title: "Termos de uso" };

export default function TermosPage() {
  return (
    <>
      <h1>Termos de uso</h1>
      <p className="text-[14px] text-muted">Atualizado em {TERMS_UPDATED}</p>
      <p>
        Estes termos explicam como funciona o uso do Durique, um sistema de agenda, pacotes, financeiro, prontuário e comunicação para clínicas de
        fisioterapia e estúdios de pilates. Ao criar uma conta, você concorda com eles.
      </p>

      <h2>1. O que é o Durique</h2>
      <p>
        O Durique é uma ferramenta online. A clínica (ou o profissional) que cria a conta usa o sistema para organizar o próprio trabalho: agenda, turmas,
        pacientes, cobranças, prontuário, documentos e o link de agendamento para os pacientes.
      </p>

      <h2>2. Sua conta</h2>
      <ul>
        <li>Você é responsável pelo seu e-mail e senha. Não compartilhe o acesso; convide cada pessoa da equipe com o próprio login.</li>
        <li>O administrador da clínica decide quem entra e o que cada pessoa vê (administrador, profissional, recepção, financeiro).</li>
        <li>As informações cadastradas precisam ser verdadeiras.</li>
      </ul>

      <h2>3. Responsabilidade pelos dados dos pacientes</h2>
      <ul>
        <li>
          Os dados dos pacientes pertencem à clínica. A clínica é a <b>controladora</b> desses dados (decide o que cadastrar e para quê) e o Durique é o{" "}
          <b>operador</b> (guarda e processa os dados em nome da clínica), como prevê a Lei Geral de Proteção de Dados (LGPD).
        </li>
        <li>
          A clínica é responsável por ter o consentimento ou outra base legal para tratar os dados dos pacientes, inclusive os de saúde, e por cumprir as
          regras da sua profissão (como as do COFFITO sobre prontuário).
        </li>
        <li>O Durique não usa os dados dos pacientes para nenhum outro fim e não os vende nem os compartilha com terceiros para publicidade.</li>
      </ul>

      <h2>4. Uso correto</h2>
      <ul>
        <li>Não use o sistema para enviar mensagens indesejadas (spam) ou para fins ilegais.</li>
        <li>Não tente acessar dados de outras clínicas nem burlar a segurança do sistema.</li>
      </ul>

      <h2>5. Disponibilidade e mudanças</h2>
      <p>
        Trabalhamos para o sistema ficar sempre no ar e seguro, mas podem ocorrer instabilidades e manutenções. Funções novas podem ser incluídas e
        funções existentes podem mudar. Mudanças importantes nestes termos serão avisadas no próprio sistema.
      </p>

      <h2>6. Cancelamento</h2>
      <p>
        A clínica pode parar de usar o Durique quando quiser. Antes, pode baixar os dados em planilha em Ajustes › Sua conta. Depois do cancelamento, os
        dados são apagados num prazo razoável, menos o que a lei obrigar a guardar.
      </p>

      <h2>7. Contato</h2>
      <p>Dúvidas sobre estes termos podem ser enviadas pelo suporte do Durique.</p>

      <p className="text-[14px] text-muted">
        Veja também a <Link href="/privacidade" className="font-medium text-accent">Política de privacidade</Link>.
      </p>
    </>
  );
}
