-- O Dashboard de Produção (/relatorios/dashboard) lê de uma materialized
-- view (internal.mat_producao_powerbi), não direto das tabelas — por
-- isso mudanças no banco não aparecem lá até alguém rodar um REFRESH
-- manual. O botão "Atualizar" da tela só reconsulta essa view (que
-- pode estar desatualizada), não refaz o cálculo dela.
--
-- Rode isso sempre que os números do dashboard parecerem errados/
-- desatualizados depois de uma mudança grande nos dados (equipes,
-- backfill, correções, etc.) — já rodou uma vez antes (2026-08-26)
-- pelo mesmo motivo.

REFRESH MATERIALIZED VIEW internal.mat_producao_powerbi;
