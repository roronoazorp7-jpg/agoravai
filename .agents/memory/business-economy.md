---
name: Empresas e renda passiva
description: Regra de consistência para empresas, upgrades e lucro acumulado.
---

O lucro acumulado de uma empresa deve ser calculado e liquidado usando o nível antigo antes de qualquer upgrade ou mudança de taxa.

**Why:** aplicar a taxa nova sobre todo o tempo desde a última coleta transforma um upgrade em lucro retroativo e permite exploração da economia.

**How to apply:** faça a coleta dentro da mesma transação da alteração de nível/taxa; mantenha também um limite de acúmulo para evitar ganhos ilimitados offline.