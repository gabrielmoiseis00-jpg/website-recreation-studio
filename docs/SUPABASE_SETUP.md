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
- Validar o novo gerenciamento de usuários via funções de servidor e Supabase Auth; nunca usar `localStorage` para senhas.
- Provisionar a primeira conta Suporte após executar a migração multi-tenant.
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


## Multi-consultório e conta Suporte

A migração `20261106030000_multi_tenant_support.sql` adiciona:
- Tabela `clinics` e vínculo `clinic_id` em perfis, pacientes, agendamentos, evolução e financeiro.
- Papel `suporte`, com leitura/gestão global por políticas RLS.
- Isolamento de pacientes, agendamentos, evolução, financeiro e arquivos por consultório.
- Atribuição automática do consultório do usuário em novos registros clínicos feitos por médico/secretária.

A migração associa os dados já existentes ao primeiro consultório criado, desde que já exista um perfil médico. Revise os dados antes de executar. Não execute essa migração mais de uma vez sem revisar, pois ela cria políticas e gatilhos.

### Provisionar a primeira conta Suporte

1. Criar uma conta Auth dedicada em Supabase > Authentication > Users.
2. Copiar o UUID dessa conta.
3. Executar no SQL Editor, substituindo os dois valores:
```sql
insert into public.profiles (id, username, role, active, clinic_id)
values ('UUID_DA_CONTA_AUTH', 'suporte', 'suporte', true, null);
```
A conta Suporte é independente da conta Médico. Não converta a conta do médico em Suporte.

### Chave de serviço do servidor

As funções de gerenciamento de usuários usam a chave administrativa do Supabase somente no servidor. Configure no Netlify uma variável de ambiente chamada `SUPABASE_SERVICE_ROLE_KEY`, com o valor da chave secreta/service_role do projeto Supabase. Marque-a como sensível. Nunca use prefixo `VITE_`, nunca a coloque no GitHub e nunca a envie pelo chat. Depois de adicionar ou alterar essa variável, gere um novo deploy preview.

O gerenciamento permite que Suporte crie consultórios e médicos e que Médico crie secretárias/usuários de aplicação dentro do próprio consultório. Bloquear um usuário altera o perfil para inativo sem apagar os registros históricos.
