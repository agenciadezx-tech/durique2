import Link from "next/link";
import { TERMS_UPDATED } from "@/lib/legal";

export const metadata = { title: "Política de privacidade" };

export default function PrivacidadePage() {
  return (
    <>
      <h1>Política de privacidade</h1>
      <p className="text-[14px] text-muted">Atualizado em {TERMS_UPDATED}</p>
      <p>Esta política explica, em palavras simples, quais dados o Durique guarda, para quê e como eles são protegidos, conforme a LGPD (Lei 13.709/2018).</p>

      <h2>1. Quais dados guardamos</h2>
      <ul>
        <li>
          <b>De quem usa o sistema</b> (clínica e equipe): nome, e-mail, telefone, função e registros de acesso.
        </li>
        <li>
          <b>Dos pacientes</b>, cadastrados pela clínica ou pelo próprio paciente no link de agendamento: nome, WhatsApp, data de nascimento, CPF quando
          informado, agenda, pagamentos, documentos assinados e, quando a clínica usa o prontuário, dados de saúde (avaliações, evoluções, dor).
        </li>
      </ul>

      <h2>2. Para que usamos</h2>
      <ul>
        <li>Para o sistema funcionar: agenda, lembretes, cobranças, prontuário, documentos e o app do paciente.</li>
        <li>Para segurança: saber quem acessou o quê (por exemplo, o registro de acesso ao prontuário).</li>
        <li>Não vendemos dados e não os usamos para publicidade.</li>
      </ul>

      <h2>3. Quem vê os dados</h2>
      <ul>
        <li>Cada clínica só vê os próprios dados. A separação entre clínicas é feita no banco de dados.</li>
        <li>Dentro da clínica, cada pessoa vê o que a sua função permite. O prontuário só é visto pelo administrador e pelo profissional que atende.</li>
        <li>
          Usamos fornecedores para hospedar o sistema e o banco de dados (com servidores no Brasil). Eles só processam os dados para fazer o Durique
          funcionar.
        </li>
      </ul>

      <h2>4. Como protegemos</h2>
      <ul>
        <li>Conexão criptografada (HTTPS), senhas protegidas e acesso por função.</li>
        <li>Prontuário assinado não pode ser alterado; correções viram adendo, com data e autor.</li>
        <li>Links de paciente (app, assinatura e pré-avaliação) são pessoais e podem ser trocados pela clínica.</li>
      </ul>

      <h2>5. Seus direitos</h2>
      <p>
        Pela LGPD, você pode pedir para ver, corrigir, levar ou apagar seus dados. <b>Se você é paciente</b>, fale com a sua clínica: ela é a responsável
        pelos seus dados e faz o pedido no sistema. <b>Se você usa o sistema</b>, fale com o administrador da sua clínica ou com o suporte do Durique.
      </p>

      <h2>6. Por quanto tempo guardamos</h2>
      <p>
        Enquanto a clínica usar o Durique. O prontuário segue o prazo de guarda exigido pelas normas da profissão. Quando a clínica cancela, os dados são
        apagados num prazo razoável, menos o que a lei obrigar a guardar.
      </p>

      <h2>7. Cookies</h2>
      <p>Usamos apenas o necessário para manter você conectado e lembrar preferências simples. Não usamos cookies de propaganda.</p>

      <h2>8. Contato</h2>
      <p>Pedidos e dúvidas sobre privacidade podem ser enviados pelo suporte do Durique.</p>

      <p className="text-[14px] text-muted">
        Veja também os <Link href="/termos" className="font-medium text-accent">Termos de uso</Link>.
      </p>
    </>
  );
}
