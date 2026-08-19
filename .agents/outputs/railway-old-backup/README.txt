BACKUP DO BANCO DO BOT DISCORD

Este pacote contém:
- data/: exportação CSV de todas as tabelas do banco antigo
- manifest.tsv: tabelas e quantidade de registros exportados
- schema.prisma: estrutura correspondente ao banco do bot

O banco original é PostgreSQL 18.4. A restauração deve ser feita em um banco novo,
com a estrutura criada a partir de schema.prisma antes da importação dos CSVs.
Não publique este arquivo: a tabela UserQuestToken pode conter dados sensíveis.
