# Integração Supabase — Consultório Dr. Ricardo

## Estado atual

A integração está em desenvolvimento na branch `feature/supabase-foundation`. O build de produção passou na última revisão, mas isso não equivale a um teste funcional completo nem autoriza uso com dados reais.

### Já integrado no código
- Login com Supabase Auth e leitura do perfil ativo.
- Lista, criação, edição e exclusão de agendamentos usando Supabase.
- Atualização de status dos agendamentos.
- Acompanhamento semanal usando a tabela `patient_weekly_progress`.
- Dados financeiros usando `appointment_finances`.
- Upload de comprovantes em bucket privado `appointment-receipts`.
- Upload de fotos de pacientes em bucket privado `patient-photos`.
- URLs assinadas de curta duração para visualizar arquivos privados.
- Build automático no GitHub Actions.

### Ainda pendente
- Substituir a tela de usuários que ainda guarda senhas em `localStorage` por provisionamento seguro no Supabase Auth. Esta etapa foi deixada para o final, conforme combinado.
- Remover credenciais locais/de demonstração e rotinas antigas de autenticação do armazenamento local.
- Validar os fluxos completos de cada papel (médico, secretária e aplicação) com contas de teste.
- Revisar e testar as políticas RLS e as políticas do Storage em cada papel.
- Configurar e validar o adaptador oficial do Netlify para TanStack Start; o projeto usa TanStack Start, não Next.js.
- Testar deploy preview, variáveis de ambiente, autenticação e navegação após publicação.
- Planejar backups, retenção, consentimento e conformidade LGPD.

## Estrutura do banco

- `profiles`: vínculo entre usuário do Supabase Auth e papel.
- `patients`: cadastro de pacientes.
- `appointments`: consultas, datas, horários, observações e status.
- `patient_weekly_progress`: acompanhamento semanal e medicamentos.
- `appointment_finances`: valores, pagamentos e caminhos dos comprovantes.

## Migrações SQL

As migrações aplicadas manualmente no projeto Supabase são:
1. `20261106000000_initial_schema.sql` — tabelas, índices, funções e políticas RLS.
2. `20261106010000_private_receipts_storage.sql` — bucket privado para comprovantes.
3. `20261106020000_private_patient_photos.sql` — bucket privado para fotos.

Para uma nova instalação, execute os arquivos em ordem no **SQL Editor** do projeto correto. Não execute novamente a migração inicial sem revisar se as políticas já existem, pois ela cria políticas sem `IF NOT EXISTS`.

## Variáveis de ambiente

Na hospedagem, configure:
- `VITE_SUPABASE_URL`: Project URL.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: Publishable key.

Essas variáveis são usadas pelo cliente do navegador e não substituem as políticas RLS. Nunca coloque `service_role`, senha do Postgres ou segredo administrativo no navegador, em código versionado ou em variáveis com prefixo `VITE_`.

## Perfis e permissões propostas

- Médico: administração e acesso clínico/financeiro.
- Secretária: pacientes, agendamentos, progresso clínico e financeiro.
- Aplicação: pacientes e agendamentos; sem progresso clínico ou financeiro.

A matriz deve ser confirmada pelo responsável do consultório. As permissões efetivas dependem das políticas RLS, não apenas da interface.

## Segurança e dados

O repositório foi público. Credenciais antigas de demonstração devem ser consideradas expostas e não podem ser reutilizadas. Tornar o repositório privado não apaga o histórico público.

Não inserir dados reais de pacientes até concluir autenticação/provisionamento, revisão de RLS e Storage, testes por perfil, deploy seguro, backup e avaliação LGPD. Usar exclusivamente dados fictícios durante a validação.
