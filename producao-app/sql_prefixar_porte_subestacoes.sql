-- ============================================================
-- Prefixa o nome das subestações com o porte, ex: "SE ABADIANIA"
-- vira "[P] SE ABADIANIA" — pra aparecer no dropdown de lançamento
-- (Subestação) sem precisar mexer no componente genérico
-- CampoDinamico.jsx (que é compartilhado por todos os campos
-- dinâmicos dropdown do sistema).
--
-- Idempotente: só prefixa quem ainda não tem o prefixo certo, então
-- pode rodar de novo sem duplicar "[P] [P] SE ...".
--
-- Limitação: isso é uma correção pontual dos dados de hoje. Uma
-- subestação nova cadastrada depois (ou com o porte editado) pela
-- tela de Subestações NÃO ganha o prefixo automaticamente — teria
-- que digitar o "[P] " manualmente no campo Nome, ou rodar este
-- script de novo. Se quiser algo automático (trigger que mantém o
-- prefixo sempre em sincronia com o porte), é só pedir.
-- ============================================================

UPDATE d_subestacoes
SET nome = '[' || porte || '] ' || nome
WHERE contrato_id = 21
  AND nome NOT LIKE '[' || porte || '] %';
