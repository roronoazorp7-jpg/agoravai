import { SlashCommandBuilder } from 'discord.js';
import prisma from '../../database/client.js';
import { FISH, FISHING_BAITS, RODS } from './pescaria.js';
import { CARD_DEFS } from '../../utils/cardData.js';
import { BUSINESS_MAX_LEVEL, getBusiness } from '../../utils/businessData.js';

const BOT_OWNER_ID = '1538243891155705877';
const MAX_INT = 2_147_483_647;
const DEFAULT_ROD_KEY = 'bambu';

const ECONOMY_FIELDS = {
  carteira: 'balance',
  banco: 'bank',
  xp: 'xp',
  nivel: 'level',
  mensagens: 'messageCount',
  minutos: 'callMinutes',
};

const RECORD_FIELDS = {
  divida: 'debt',
  prisoes: 'arrests',
  crimes: 'crimes',
};

const RESOURCE_LABELS = {
  carteira: 'coins na carteira',
  banco: 'coins no banco',
  xp: 'XP',
  nivel: 'nível',
  reputacao: 'pontos de reputação',
  mensagens: 'mensagens contabilizadas',
  minutos: 'minutos em chamadas',
  divida: 'coins de dívida criminal',
  prisoes: 'prisões na ficha criminal',
  crimes: 'crimes na ficha criminal',
  empresa: 'empresa',
  peixe: 'peixes',
  isca: 'iscas',
  vara: 'vara de pesca equipada',
  compra: 'item comprado',
  carta: 'cartas',
};

function formatNumber(value) {
  return Number(value).toLocaleString('pt-BR');
}

function errorText(text) {
  return `❌ ${text}`;
}

function ownerOnly(userId) {
  return userId === BOT_OWNER_ID;
}

function parsePositiveInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 && number <= MAX_INT ? number : null;
}

function findResource(resource, itemRef) {
  if (resource === 'peixe') {
    const fish = FISH.find(entry => entry.key === itemRef);
    return fish ? { key: fish.key, name: fish.name } : null;
  }
  if (resource === 'isca') {
    const bait = FISHING_BAITS.find(entry => entry.key === itemRef);
    return bait ? { key: bait.key, name: bait.name } : null;
  }
  if (resource === 'vara') {
    const rod = RODS.find(entry => entry.key === itemRef);
    return rod ? { key: rod.key, name: rod.name } : null;
  }
  if (resource === 'carta') {
    const card = CARD_DEFS.find(entry => entry.key === itemRef);
    return card ? { key: card.key, name: card.name } : null;
  }
  return null;
}

function parsePurchaseRef(value) {
  if (!value) return null;
  const separator = value.indexOf(':');
  if (separator <= 0 || separator === value.length - 1) return null;
  const itemType = value.slice(0, separator).trim().toLowerCase();
  const itemRef = value.slice(separator + 1).trim();
  if (!itemType || !itemRef || itemType.length > 40 || itemRef.length > 200) return null;
  return { itemType, itemRef };
}

function operationValue(action, quantity) {
  return action === 'adicionar' ? quantity : action === 'remover' ? -quantity : quantity;
}

function actionLabel(action) {
  if (action === 'adicionar') return 'adicionados';
  if (action === 'remover') return 'removidos';
  return 'definidos';
}

async function updateNumericResource(tx, { userId, guildId, resource, action, quantity }) {
  const field = ECONOMY_FIELDS[resource];
  const current = await tx.economy.upsert({
    where: { userId_guildId: { userId, guildId } },
    create: { userId, guildId },
    update: {},
  });
  const oldValue = current[field];
  const nextValue = action === 'definir' ? quantity : oldValue + operationValue(action, quantity);

  const minimum = resource === 'nivel' ? 1 : 0;
  if (nextValue < minimum) {
    return { ok: false, reason: 'insufficient', current: oldValue };
  }
  if (nextValue > MAX_INT) {
    return { ok: false, reason: 'overflow' };
  }

  await tx.economy.update({
    where: { userId_guildId: { userId, guildId } },
    data: { [field]: nextValue },
  });
  return { ok: true, oldValue, nextValue };
}

async function updateReputation(tx, { userId, guildId, action, quantity }) {
  const current = await tx.userProfile.upsert({
    where: { userId },
    create: { userId, guildId },
    update: {},
  });
  const oldValue = current.reps;
  const nextValue = action === 'definir' ? quantity : oldValue + operationValue(action, quantity);

  if (nextValue < 0) return { ok: false, reason: 'insufficient', current: oldValue };
  if (nextValue > MAX_INT) return { ok: false, reason: 'overflow' };

  await tx.userProfile.update({
    where: { userId },
    data: { reps: nextValue },
  });
  return { ok: true, oldValue, nextValue };
}

async function updateCriminalRecord(tx, { userId, guildId, resource, action, quantity }) {
  const field = RECORD_FIELDS[resource];
  const current = await tx.criminalRecord.upsert({
    where: { userId_guildId: { userId, guildId } },
    create: { userId, guildId },
    update: {},
  });
  const oldValue = current[field];
  const nextValue = action === 'definir' ? quantity : oldValue + operationValue(action, quantity);

  if (nextValue < 0) return { ok: false, reason: 'insufficient', current: oldValue };
  if (nextValue > MAX_INT) return { ok: false, reason: 'overflow' };

  await tx.criminalRecord.update({
    where: { userId_guildId: { userId, guildId } },
    data: { [field]: nextValue },
  });
  return { ok: true, oldValue, nextValue };
}

async function updateFishingQuantity(tx, { userId, guildId, resource, itemRef, action, quantity }) {
  const model = resource === 'peixe' ? 'fishingCatch' : 'fishingItem';
  const keyName = resource === 'peixe' ? 'fishKey' : 'itemKey';
  const uniqueWhere = resource === 'peixe'
    ? { userId_guildId_fishKey: { userId, guildId, fishKey: itemRef } }
    : { userId_guildId_itemKey: { userId, guildId, itemKey: itemRef } };
  const current = await tx[model].findUnique({ where: uniqueWhere });
  const oldValue = current?.quantity ?? 0;
  const nextValue = action === 'definir' ? quantity : oldValue + operationValue(action, quantity);

  if (nextValue < 0) return { ok: false, reason: 'insufficient', current: oldValue };
  if (nextValue > MAX_INT) return { ok: false, reason: 'overflow' };

  if (nextValue === 0 && current) {
    await tx[model].delete({ where: { id: current.id } });
  } else if (current) {
    await tx[model].update({ where: { id: current.id }, data: { quantity: nextValue } });
  } else if (nextValue > 0) {
    await tx[model].create({
      data: { userId, guildId, [keyName]: itemRef, quantity: nextValue },
    });
  }
  return { ok: true, oldValue, nextValue };
}

async function updateRod(tx, { userId, guildId, action, itemRef }) {
  const current = await tx.fishingProfile.upsert({
    where: { userId_guildId: { userId, guildId } },
    create: { userId, guildId },
    update: {},
  });
  const nextKey = action === 'remover' ? DEFAULT_ROD_KEY : itemRef;
  await tx.fishingProfile.update({
    where: { userId_guildId: { userId, guildId } },
    data: { rodKey: nextKey },
  });
  return { ok: true, oldValue: current.rodKey, nextValue: nextKey };
}

async function updateBusiness(tx, { userId, guildId, action, itemRef, quantity }) {
  const definition = getBusiness(itemRef);
  if (!definition) return { ok: false, reason: 'invalidBusiness' };

  const where = {
    userId_guildId_businessKey: { userId, guildId, businessKey: itemRef },
  };
  const current = await tx.business.findUnique({ where });

  if (action === 'remover') {
    if (!current) return { ok: false, reason: 'missingBusiness' };
    await tx.business.delete({ where });
    return { ok: true, oldValue: current.level, nextValue: 0, item: definition };
  }

  const nextLevel = action === 'definir'
    ? quantity
    : (current?.level ?? 0) + quantity;
  if (nextLevel > BUSINESS_MAX_LEVEL) return { ok: false, reason: 'maxLevel' };

  if (current) {
    await tx.business.update({ where, data: { level: nextLevel } });
  } else {
    await tx.business.create({
      data: { userId, guildId, businessKey: itemRef, level: nextLevel },
    });
  }
  return { ok: true, oldValue: current?.level ?? 0, nextValue: nextLevel, item: definition };
}

async function updatePurchase(tx, { userId, guildId, action, itemRef, quantity }) {
  const purchase = parsePurchaseRef(itemRef);
  if (!purchase) return { ok: false, reason: 'invalidPurchase' };

  const where = {
    userId_itemType_itemRef: {
      userId,
      itemType: purchase.itemType,
      itemRef: purchase.itemRef,
    },
  };
  const current = await tx.userPurchase.findUnique({ where });

  if (action === 'remover' || (action === 'definir' && quantity === 0)) {
    if (!current) return { ok: false, reason: 'missing' };
    await tx.userPurchase.delete({ where });
    return { ok: true, oldValue: 1, nextValue: 0, item: purchase };
  }

  if (!current) {
    await tx.userPurchase.create({
      data: { userId, guildId, itemType: purchase.itemType, itemRef: purchase.itemRef },
    });
  }
  return { ok: true, oldValue: current ? 1 : 0, nextValue: 1, item: purchase };
}

async function updateCard(tx, { userId, itemRef, action, quantity }) {
  const where = { userId_cardKey: { userId, cardKey: itemRef } };
  const current = await tx.cardCollection.findUnique({ where });
  const oldValue = current?.quantity ?? 0;
  const nextValue = action === 'definir' ? quantity : oldValue + operationValue(action, quantity);

  if (nextValue < 0) return { ok: false, reason: 'insufficient', current: oldValue };
  if (nextValue > MAX_INT) return { ok: false, reason: 'overflow' };

  if (nextValue === 0 && current) {
    await tx.cardCollection.delete({ where });
  } else if (current) {
    await tx.cardCollection.update({ where, data: { quantity: nextValue } });
  } else if (nextValue > 0) {
    await tx.cardCollection.create({ data: { userId, cardKey: itemRef, quantity: nextValue } });
  }
  return { ok: true, oldValue, nextValue };
}

async function applyOperatorAction({ userId, guildId, action, resource, itemRef, quantity }) {
  return prisma.$transaction(async tx => {
    if (ECONOMY_FIELDS[resource]) {
      return updateNumericResource(tx, { userId, guildId, resource, action, quantity });
    }
    if (RECORD_FIELDS[resource]) {
      return updateCriminalRecord(tx, { userId, guildId, resource, action, quantity });
    }
    if (resource === 'reputacao') {
      return updateReputation(tx, { userId, guildId, action, quantity });
    }
    if (resource === 'peixe' || resource === 'isca') {
      return updateFishingQuantity(tx, { userId, guildId, resource, itemRef, action, quantity });
    }
    if (resource === 'vara') {
      return updateRod(tx, { userId, guildId, action, itemRef });
    }
    if (resource === 'empresa') {
      return updateBusiness(tx, { userId, guildId, action, itemRef, quantity });
    }
    if (resource === 'compra') {
      return updatePurchase(tx, { userId, guildId, action, itemRef, quantity });
    }
    return updateCard(tx, { userId, itemRef, action, quantity });
  });
}

function invalidInput(resource, itemRef) {
  if (resource === 'compra') {
    return 'Para uma compra, informe o item no formato `tipo:referência`, por exemplo `banner:chave-do-banner`, `pet:raposa`, `weapon:faca` ou `role:ID_DO_CARGO`.';
  }
  if (resource === 'vara') {
    return `Essa vara não existe. Use uma destas: ${RODS.map(rod => `\`${rod.key}\``).join(', ')}.`;
  }
  if (resource === 'peixe') {
    return `Esse peixe não existe. Use uma chave válida, como ${FISH.slice(0, 4).map(fish => `\`${fish.key}\``).join(', ')}.`;
  }
  if (resource === 'isca') {
    return `Essa isca não existe. Use uma destas: ${FISHING_BAITS.map(bait => `\`${bait.key}\``).join(', ')}.`;
  }
  if (resource === 'carta') {
    return `Essa carta não existe. Use a chave exibida no sistema de cartas, como \`${CARD_DEFS[0].key}\`.`;
  }
  if (resource === 'empresa') {
    return 'Essa empresa não existe. Use `/empresa loja` para ver as chaves: `barraca`, `cafeteria`, `oficina`, `agencia` ou `startup`.';
  }
  return `O recurso \`${resource}\` não é válido.`;
}

function buildResult(target, resource, action, quantity, result, item) {
  const label = RESOURCE_LABELS[resource];
  const purchaseLabel = result.item
    ? ` **${result.item.itemType}:${result.item.itemRef}**`
    : '';
  const itemLabel = item?.name ? ` **${item.name}**` : purchaseLabel;
  const oldValue = result.oldValue === undefined ? null : formatNumber(result.oldValue);
  const nextValue = result.nextValue === undefined ? null : formatNumber(result.nextValue);
  const valueText = nextValue === null
    ? `**${actionLabel(action)}**`
    : `de **${oldValue}** para **${nextValue}**`;

  return (
    `## ✅ Economia atualizada\n\n` +
    `**${target}** recebeu uma alteração em **${label}${itemLabel}**.\n` +
    `> Ação: **${action}** · Quantidade: **${formatNumber(quantity)}**\n` +
    `> Resultado: ${valueText}`
  );
}

async function executeOperator({ actorId, target, member, guildId, action, resource, itemRef, quantity, reply }) {
  if (!ownerOnly(actorId)) {
    return reply(errorText('Este comando é exclusivo do dono do bot.'));
  }
  if (!guildId) {
    return reply(errorText('Este comando só pode ser usado dentro de um servidor.'));
  }

  const parsedQuantity = parsePositiveInteger(quantity);
  if (!parsedQuantity) {
    return reply(errorText('A quantidade deve ser um número inteiro positivo.'));
  }
  if ((resource === 'vara' || resource === 'compra') && parsedQuantity !== 1) {
    return reply(errorText('Esse recurso é único por usuário. Use quantidade `1` para dar, definir ou remover.'));
  }

  let item = null;
  if (resource === 'empresa') {
    item = getBusiness(itemRef?.trim().toLowerCase());
    if (!item) return reply(errorText(invalidInput(resource)));
  } else if (['peixe', 'isca', 'vara', 'carta'].includes(resource)) {
    if (resource === 'vara' && action === 'remover' && !itemRef) {
      item = { key: DEFAULT_ROD_KEY, name: 'Vara de bambu' };
    } else {
      item = findResource(resource, itemRef?.trim().toLowerCase());
    }
    if (!item) return reply(errorText(invalidInput(resource, itemRef)));
  }
  if (resource === 'compra' && !parsePurchaseRef(itemRef)) {
    return reply(errorText(invalidInput(resource, itemRef)));
  }
  if (resource === 'empresa' && !getBusiness(itemRef?.trim().toLowerCase())) {
    return reply(errorText(invalidInput(resource)));
  }

  const result = await applyOperatorAction({
    userId: target.id,
    guildId,
    action,
    resource,
    itemRef: resource === 'compra' ? itemRef.trim() : item?.key,
    quantity: parsedQuantity,
  }).catch(error => {
    console.error('[ECONOMIA OPERADOR]', error);
    return { ok: false, reason: 'database' };
  });

  if (!result.ok) {
    if (result.reason === 'insufficient') {
      return reply(errorText(`Não é possível remover essa quantidade. O valor atual é **${formatNumber(result.current)}**.`));
    }
    if (result.reason === 'overflow') {
      return reply(errorText('O resultado ultrapassaria o limite máximo permitido.'));
    }
    if (result.reason === 'missing') {
      return reply(errorText('Esse usuário não possui esse item comprado.'));
    }
    if (result.reason === 'missingBusiness') {
      return reply(errorText('Esse usuário não possui essa empresa.'));
    }
    if (result.reason === 'invalidBusiness') {
      return reply(errorText(invalidInput('empresa')));
    }
    if (result.reason === 'maxLevel') {
      return reply(errorText(`A empresa não pode ultrapassar o nível ${BUSINESS_MAX_LEVEL}.`));
    }
    if (result.reason === 'invalidPurchase') {
      return reply(errorText(invalidInput('compra')));
    }
    return reply(errorText('Não foi possível atualizar a economia. Verifique os dados informados.'));
  }

  if (resource === 'compra' && result.item?.itemType === 'role' && member) {
    const roleChange = action === 'remover'
      ? member.roles.remove(result.item.itemRef)
      : member.roles.add(result.item.itemRef);
    await roleChange.catch(error => {
      console.warn('[ECONOMIA OPERADOR] não foi possível sincronizar o cargo:', error.message);
    });
  }

  return reply(buildResult(target, resource, action, parsedQuantity, result, item));
}

const cmdEconomiaOperador = {
  data: new SlashCommandBuilder()
    .setName('economia')
    .setDescription('Ferramentas administrativas da economia')
    .addSubcommand(sub => sub
      .setName('operador')
      .setDescription('Dê, remova ou defina recursos de um usuário')
      .addUserOption(option => option
        .setName('usuario')
        .setDescription('Usuário que receberá a alteração')
        .setRequired(true))
      .addStringOption(option => option
        .setName('acao')
        .setDescription('Operação que será aplicada')
        .setRequired(true)
        .addChoices(
          { name: 'Adicionar / dar', value: 'adicionar' },
          { name: 'Remover', value: 'remover' },
          { name: 'Definir valor', value: 'definir' },
        ))
      .addStringOption(option => option
        .setName('recurso')
        .setDescription('Recurso que será alterado')
        .setRequired(true)
        .addChoices(
          { name: 'Carteira (coins)', value: 'carteira' },
          { name: 'Banco (coins)', value: 'banco' },
          { name: 'XP', value: 'xp' },
          { name: 'Nível', value: 'nivel' },
          { name: 'Reputação', value: 'reputacao' },
          { name: 'Peixes', value: 'peixe' },
          { name: 'Iscas', value: 'isca' },
          { name: 'Vara de pesca', value: 'vara' },
          { name: 'Item comprado', value: 'compra' },
          { name: 'Carta', value: 'carta' },
          { name: 'Mensagens contabilizadas', value: 'mensagens' },
          { name: 'Minutos em chamadas', value: 'minutos' },
          { name: 'Dívida criminal', value: 'divida' },
          { name: 'Prisões', value: 'prisoes' },
          { name: 'Crimes', value: 'crimes' },
          { name: 'Empresa', value: 'empresa' },
        ))
      .addIntegerOption(option => option
        .setName('quantidade')
        .setDescription('Quantidade ou novo valor')
        .setMinValue(1)
        .setMaxValue(MAX_INT)
        .setRequired(true))
      .addStringOption(option => option
        .setName('item')
        .setDescription('Chave do peixe/isca/vara/carta ou tipo:referência da compra')
        .setRequired(false))),
  name: 'economia',
  aliases: [],

  async execute(interaction) {
    if (interaction.options.getSubcommand() !== 'operador') return;
    const resource = interaction.options.getString('recurso');
    const itemRef = interaction.options.getString('item');
    const target = interaction.options.getUser('usuario');
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    return executeOperator({
      actorId: interaction.user.id,
      target,
      member,
      guildId: interaction.guildId,
      action: interaction.options.getString('acao'),
      resource,
      itemRef,
      quantity: interaction.options.getInteger('quantidade'),
      reply: payload => interaction.reply({ content: payload, ephemeral: true }),
    });
  },

  async executePrefix(message, args) {
    const subcommand = args[0]?.toLowerCase();
    if (subcommand !== 'operador' && subcommand !== 'admin') {
      return message.reply(
        'Uso: `savage economia operador <adicionar|remover|definir> <recurso> @usuário <quantidade> [item]`',
      );
    }

    const action = args[1]?.toLowerCase();
    const resource = args[2]?.toLowerCase();
    const mentioned = message.mentions.users.first();
    const targetToken = args[3];
    const targetId = mentioned?.id ?? targetToken?.replace(/[<@!>]/g, '');
    const target = targetId ? await message.client.users.fetch(targetId).catch(() => null) : null;
    const member = target ? await message.guild?.members.fetch(target.id).catch(() => null) : null;
    const quantity = args[4];
    const itemRef = args.slice(5).join(' ').trim() || null;

    const normalizedAction = {
      dar: 'adicionar',
      adicionar: 'adicionar',
      add: 'adicionar',
      remover: 'remover',
      remove: 'remover',
      definir: 'definir',
      set: 'definir',
    }[action];

    if (!normalizedAction || !RESOURCE_LABELS[resource] || !target) {
      return message.reply(
        'Uso: `savage economia operador <adicionar|remover|definir> <recurso> @usuário <quantidade> [item]`',
      );
    }

    return executeOperator({
      actorId: message.author.id,
      target,
      member,
      guildId: message.guildId,
      action: normalizedAction,
      resource,
      itemRef,
      quantity,
      reply: payload => message.reply(payload),
    });
  },
};

export default cmdEconomiaOperador;