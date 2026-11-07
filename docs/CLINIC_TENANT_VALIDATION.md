# Validação de isolamento entre clínicas

## Migração de perfil institucional

Depois de atualizar o branch `feature/supabase-foundation`, abra o Supabase do projeto correto e execute no SQL Editor o arquivo:

`supabase/migrations/20261107020000_clinic_individual_profile.sql`

A migração adiciona CNPJ, e-mail, telefone, endereço, URL HTTPS do logotipo, fuso horário e duração padrão da consulta. Também permite que um usuário da clínica altere somente os dados institucionais da própria clínica, desde que tenha a permissão `settings.edit`. O Suporte mantém o gerenciamento global.

Não execute novamente migrações antigas que já constem como aplicadas no histórico do Supabase. Faça backup antes de qualquer alteração no banco de produção.

## Teste funcional com duas clínicas

Use somente dados fictícios. Crie duas clínicas de teste (Clínica Alfa e Clínica Beta) e um usuário Médico para cada uma. Crie também uma Secretária em cada clínica.

1. Entre como Médico da Clínica Alfa. Cadastre um paciente, um agendamento, um prontuário e um lançamento financeiro fictícios.
2. Saia e entre como Médico da Clínica Beta. Confirme que nenhum dos quatro registros da Alfa aparece.
3. Tente abrir pela URL o identificador de um paciente/prontuário da Alfa enquanto estiver autenticado na Beta. O registro não deve ser retornado nem editável.
4. Repita o teste com as contas de Secretária, respeitando as permissões configuradas.
5. Anexe um comprovante e uma foto fictícios em cada clínica. Confirme que os caminhos dos arquivos começam pelo UUID da clínica e que uma clínica não consegue gerar URL assinada nem excluir arquivos da outra.
6. Altere nome, CNPJ, contato, endereço e logotipo da Alfa. Confirme que a Beta permanece inalterada.
7. Entre como Suporte, alterne a clínica selecionada e confirme que a interface mostra a identidade correspondente.

## Teste offline

1. Entre online em cada conta de teste e aguarde o cache ser preparado.
2. Desconecte a internet e confirme que a conta da Alfa só vê os registros previamente armazenados para o usuário da Alfa; repita na Beta.
3. Crie um registro fictício offline, reconecte e confirme a sincronização no tenant correto.
4. Confira a fila de sincronização e os arquivos enviados antes de apagar os dados de teste.

## Limites que precisam de validação operacional

- O cache offline é criptografado no IndexedDB e vinculado ao usuário/dispositivo; ele não é uma cópia central do banco.
- A revogação de uma conta enquanto o dispositivo permanece offline não pode ser conhecida pelo dispositivo até a próxima conexão. Não trate o modo offline como revogação instantânea.
- Não usar dados reais de pacientes nos testes de isolamento.
- A migração só estará ativa quando for executada no projeto Supabase correto. O commit no GitHub, por si só, não altera o banco.
