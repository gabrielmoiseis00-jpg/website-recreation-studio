# Integração Supabase — Consultório Dr. Ricardo

## Estado desta etapa

Esta branch prepara a estrutura do banco. Ela **não ativa ainda a integração no site** e não deve ser publicada como versão de produção até a implementação e os testes da autenticação e das telas.

## Estrutura proposta

- `profiles`: vínculo entre usuário do Supabase Auth, nome de usuário e papel.
- `patients`: cadastro de pacientes.
- `appointments`: consultas, datas, horários, observações e status.
- `patient_weekly_progress`: acompanhamento semanal e medicamentos.
- `appointment_finances`: valores, pagamentos e comprovantes.

## Matriz de acesso inicial

- Médico: acesso administrativo e clínico.
- Secretária: pacientes, agendamentos, progresso clínico e financeiro.
- Aplicação: pacientes e agendamentos; sem financeiro ou progresso clínico.

Confirme essa matriz com o responsável pelo consultório antes de usar dados reais.

## Aplicar a migração

1. Abra o projeto correto no Supabase.
2. Entre em **SQL Editor**.
3. Abra `supabase/migrations/20261106000000_initial_schema.sql` no GitHub.
4. Copie o conteúdo completo e cole no SQL Editor.
5. Revise o projeto selecionado e clique em **Run**.
6. Confira se as cinco tabelas foram criadas em **Table Editor**.

Não execute em outro projeto. Não compartilhe a senha do banco nem a chave `service_role`.

## Variáveis do site

Na hospedagem, configure:
- `VITE_SUPABASE_URL`: Project URL.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: Publishable key.

Essas variáveis públicas não substituem as políticas RLS. Nunca coloque `service_role`, senha do Postgres ou segredo de servidor no navegador, no GitHub ou em variáveis `VITE_*`.

## Próximas etapas obrigatórias

1. Adicionar o cliente Supabase compatível com TanStack Start.
2. Migrar login para Supabase Auth e remover senhas locais/de demonstração.
3. Implementar provisionamento de contas por função de servidor segura (não pelo navegador com chave administrativa).
4. Migrar operações de pacientes, agendamentos, progresso e financeiro para consultas assíncronas.
5. Configurar armazenamento privado de fotos e comprovantes.
6. Testar cada papel, políticas RLS, build e deploy com dados fictícios.
7. Planejar backup, retenção, consentimento e conformidade LGPD antes de dados reais.

## Aviso

O projeto original continha credenciais de demonstração fixas no código. Como o repositório foi tornado público, trate essas credenciais como expostas: não as reutilize, remova-as do fluxo de login e não use contas reais com essas senhas. Tornar o repositório privado não apaga o histórico público.
