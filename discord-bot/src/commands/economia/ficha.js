import { SlashCommandBuilder } from 'discord.js';
import prisma from '../../database/client.js';
import { spendCoins, totalCoins } from '../../utils/economyFunds.js';
import { buildUtilityV2 } from '../../utils/utilityV2.js';
import { getRobberyWeapon } from '../../utils/robberyData.js';

async function getRecord(userId, guildId) {
  return prisma.criminalRecord.upsert({
    where: { userId_guildId: { userId, guildId } },
    create: { userId, guildId },
    update: {},
  });
}

async function getWeapon(userId) {
  const purchases = await prisma.userPurchase.findMany({
    where: { userId, itemType: 'weapon' },
  });
  return purchases
    .map(purchase => getRobberyWeapon(purchase.itemRef))
    .sort((a, b) => b.stealMultiplier - a.stealMultiplier)[0] ?? getRobberyWeapon('faca');
}

function card(user, record, weapon) {
  const status = record.debt > 0
    ? `🚔 PRESO — multa pendente de **${record.debt.toLocaleString('pt-BR')} coins**`
    : '✅ Livre para novos roubos';
  return buildUtilityV2({
    text:
      `## 🪪 Ficha Criminal\n\n` +
      `**${user}**\n\n` +
      `💰 **Dívida:** ${record.debt.toLocaleString('pt-BR')} coins\n` +
      `🔒 **Status:** ${status}\n` +
      `🚔 **Prisões:** ${record.arrests}\n` +
      `⚠️ **Crimes:** ${record.crimes}\n` +
      `🔫 **Arma em uso:** ${weapon.name}\n\n` +
      (record.debt > 0
        ? 'Use `/ficha pagar` ou `savage ficha pagar` para quitar a multa.'
        : 'Você não possui multas pendentes.'),
    thumbnailUrl: user.displayAvatarURL({ extension: 'png', size: 256 }),
  });
}

async function payFine(userId, guildId) {
  return prisma.$transaction(async tx => {
    const record = await tx.criminalRecord.upsert({
      where: { userId_guildId: { userId, guildId } },
      create: { userId, guildId },
      update: {},
    });
    if (!record.debt) return { ok: false, reason: 'clear' };

    const eco = await tx.economy.upsert({
      where: { userId_guildId: { userId, guildId } },
      create: { userId, guildId },
      update: {},
    });
    const balance = totalCoins(eco);
    if (balance < record.debt) {
      return { ok: false, reason: 'funds', debt: record.debt, balance };
    }

    const spent = await spendCoins(tx, { userId, guildId, amount: record.debt });
    if (!spent.ok) {
      return { ok: false, reason: 'funds', debt: record.debt, balance };
    }

    await tx.criminalRecord.update({
      where: { userId_guildId: { userId, guildId } },
      data: { debt: 0 },
    });
    return { ok: true, amount: record.debt };
  });
}

async function executeFicha({ user, guildId, action = 'ver', target = user, reply }) {
  if (action === 'pagar') {
    const result = await payFine(user.id, guildId);
    if (result.reason === 'clear') return reply(buildUtilityV2({ text: '## ✅ Ficha Criminal\n\nVocê não possui nenhuma multa pendente.' }));
    if (result.reason === 'funds') {
      return reply(buildUtilityV2({
        text: `## 🚔 Multa não paga\n\nVocê precisa de **${result.debt.toLocaleString('pt-BR')} coins**, mas possui apenas **${result.balance.toLocaleString('pt-BR')} coins**.`,
      }));
    }
    return reply(buildUtilityV2({ text: `## ✅ Liberdade concedida\n\nVocê pagou **${result.amount.toLocaleString('pt-BR')} coins** e já pode voltar a roubar.` }));
  }
  const [record, weapon] = await Promise.all([getRecord(target.id, guildId), getWeapon(target.id)]);
  return reply(card(target, record, weapon));
}

export default {
  data: new SlashCommandBuilder()
    .setName('ficha')
    .setDescription('Veja sua ficha criminal e pague multas')
    .addStringOption(option => option
      .setName('acao')
      .setDescription('Consultar ou pagar a ficha')
      .addChoices(
        { name: 'Consultar', value: 'ver' },
        { name: 'Pagar multa', value: 'pagar' },
      ))
    .addUserOption(option => option
      .setName('usuario')
      .setDescription('Ficha de outro membro')),
  name: 'ficha',
  aliases: ['fichacriminal', 'criminal'],

  async execute(interaction) {
    const action = interaction.options.getString('acao') ?? 'ver';
    const target = interaction.options.getUser('usuario') ?? interaction.user;
    if (action === 'pagar' && target.id !== interaction.user.id) {
      return interaction.reply(buildUtilityV2({ text: '❌ Você só pode pagar a própria multa.' }));
    }
    return executeFicha({
      user: interaction.user,
      guildId: interaction.guildId,
      action,
      target,
      reply: payload => interaction.reply(payload),
    });
  },

  async executePrefix(message, args) {
    const action = ['pagar', 'pago', 'quitar'].includes(args[0]?.toLowerCase()) ? 'pagar' : 'ver';
    const target = action === 'ver' ? (message.mentions.users.first() ?? message.author) : message.author;
    return executeFicha({
      user: message.author,
      guildId: message.guildId,
      action,
      target,
      reply: payload => message.reply(payload),
    });
  },
};