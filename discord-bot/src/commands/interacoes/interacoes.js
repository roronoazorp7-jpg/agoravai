import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import prisma from '../../database/client.js';
import { v2Payload, v2Rich, v2Simple } from '../../utils/embed.js';

export const ACTIONS = {
  kiss: {
    aliases:      ['k', 'bj', 'beijo', 'beijar'],
    emoji:        '💋',
    gif:          'kiss',
    desc:         '💋 Dá um beijo em alguém',
    msg:          (a, b) => `**${a}** beija **${b}** 💋`,
    counter:      (to, n) => `*${to} recebeu ${n} ${n === 1 ? 'beijo' : 'beijos'}.*`,
    btnLabel:     'Beijar de volta',
    retMsg:       (a, b) => `**${a}** beija **${b}** de volta! 💋`,
    mutualVerb:   (n) => `se beijaram **${n}** ${n === 1 ? 'vez' : 'vezes'}`,
  },
  gf: {
    aliases:      ['crush', 'romance', 'namoro'],
    emoji:        '💞',
    gif:          'kiss',
    desc:         '💞 Cria um clima de romance com alguém',
    msg:          (a, b) => `${a} fez GF com ${b}.`,
    counter:      (to, n) => `Streak ${n}x • +18 XP para cada um`,
    btnLabel:     'Continuar GF',
    retMsg:       (a, b) => `${a} fez GF com ${b}.`,
    mutualVerb:   (n) => `trocaram **${n}** ${n === 1 ? 'momento romântico' : 'momentos românticos'}`,
  },
  hug: {
    aliases:      ['h', 'abraco', 'abracar'],
    emoji:        '🤗',
    gif:          'hug',
    desc:         '🤗 Abraça alguém',
    msg:          (a, b) => `**${a}** abraça **${b}** 🤗`,
    counter:      (to, n) => `*${to} recebeu ${n} ${n === 1 ? 'abraço' : 'abraços'}.*`,
    btnLabel:     'Abraçar de volta',
    retMsg:       (a, b) => `**${a}** abraça **${b}** de volta! 🤗`,
    mutualVerb:   (n) => `se abraçaram **${n}** ${n === 1 ? 'vez' : 'vezes'}`,
  },
  slap: {
    aliases:      ['s', 'tapa', 'esbofetear'],
    emoji:        '👋',
    gif:          'slap',
    desc:         '👋 Dá um tapa em alguém',
    msg:          (a, b) => `**${a}** esbofeteia **${b}** 👋`,
    counter:      (to, n) => `*${to} recebeu ${n} ${n === 1 ? 'tapa' : 'tapas'}.*`,
    btnLabel:     'Dar tapa de volta',
    retMsg:       (a, b) => `**${a}** esbofeteia **${b}** de volta! 👋`,
    mutualVerb:   (n) => `se esbofetearam **${n}** ${n === 1 ? 'vez' : 'vezes'}`,
  },
  punch: {
    aliases:      ['p', 'soco', 'murro'],
    emoji:        '👊',
    gif:          'punch',
    desc:         '👊 Dá um soco em alguém',
    msg:          (a, b) => `**${a}** soca **${b}** 👊`,
    counter:      (to, n) => `*${to} recebeu ${n} ${n === 1 ? 'soco' : 'socos'}.*`,
    btnLabel:     'Dar soco de volta',
    retMsg:       (a, b) => `**${a}** soca **${b}** de volta! 👊`,
    mutualVerb:   (n) => `se socaram **${n}** ${n === 1 ? 'vez' : 'vezes'}`,
  },
  poke: {
    aliases:      ['pk', 'cutucar', 'cutuca'],
    emoji:        '👉',
    gif:          'poke',
    desc:         '👉 Cutuca alguém',
    msg:          (a, b) => `**${a}** cutuca **${b}** 👉`,
    counter:      (to, n) => `*${to} recebeu ${n} ${n === 1 ? 'cutucada' : 'cutucadas'}.*`,
    btnLabel:     'Cutucar de volta',
    retMsg:       (a, b) => `**${a}** cutuca **${b}** de volta! 👉`,
    mutualVerb:   (n) => `se cutucaram **${n}** ${n === 1 ? 'vez' : 'vezes'}`,
  },
  bite: {
    aliases:      ['b', 'morder', 'morde'],
    emoji:        '😬',
    gif:          'bite',
    desc:         '😬 Morde alguém',
    msg:          (a, b) => `**${a}** morde **${b}** 😬`,
    counter:      (to, n) => `*${to} recebeu ${n} ${n === 1 ? 'mordida' : 'mordidas'}.*`,
    btnLabel:     'Morder de volta',
    retMsg:       (a, b) => `**${a}** morde **${b}** de volta! 😬`,
    mutualVerb:   (n) => `se mordem **${n}** ${n === 1 ? 'vez' : 'vezes'}`,
  },
  pat: {
    aliases:      ['pa', 'carinho'],
    emoji:        '🥰',
    gif:          'pat',
    desc:         '🥰 Faz carinho em alguém',
    msg:          (a, b) => `**${a}** faz carinho em **${b}** 🥰`,
    counter:      (to, n) => `*${to} recebeu ${n} ${n === 1 ? 'carinho' : 'carinhos'}.*`,
    btnLabel:     'Dar carinho de volta',
    retMsg:       (a, b) => `**${a}** faz carinho em **${b}** de volta! 🥰`,
    mutualVerb:   (n) => `se fizeram carinho **${n}** ${n === 1 ? 'vez' : 'vezes'}`,
  },
  push: {
    aliases:      ['pu', 'empurrar', 'empurra'],
    emoji:        '😤',
    // OtakuGIFs não possui a categoria "kick"; punch é o fallback visual
    // mais próximo para a ação de empurrar.
    gif:          'punch',
    desc:         '😤 Empurra alguém',
    msg:          (a, b) => `**${a}** empurra **${b}** 😤`,
    counter:      (to, n) => `*${to} recebeu ${n} ${n === 1 ? 'empurrão' : 'empurrões'}.*`,
    btnLabel:     'Empurrar de volta',
    retMsg:       (a, b) => `**${a}** empurra **${b}** de volta! 😤`,
    mutualVerb:   (n) => `se empurraram **${n}** ${n === 1 ? 'vez' : 'vezes'}`,
  },
  kill: {
    aliases:      ['matar'],
    emoji:        '🗡️',
    gif:          'kill',
    desc:         '🗡️ Mata alguém em uma cena de anime',
    msg:          (a, b) => `**${a}** mata **${b}** em uma cena dramática de anime 🗡️`,
    counter:      (to, n) => `*${to} foi derrotado ${n} ${n === 1 ? 'vez' : 'vezes'}.*`,
    btnLabel:     'Revidar',
    retMsg:       (a, b) => `**${a}** revida e derrota **${b}**! 🗡️`,
    mutualVerb:   (n) => `se derrotaram **${n}** ${n === 1 ? 'vez' : 'vezes'}`,
  },
};

export async function fetchGif(category) {
  const fallbackUrls = {
    kiss:  'https://cdn.otakugifs.xyz/gifs/kiss/736a111d8ed929b2.gif',
    hug:   'https://cdn.otakugifs.xyz/gifs/hug/408915119268a454.gif',
    slap:  'https://cdn.otakugifs.xyz/gifs/slap/2215a625136a1cda.gif',
    punch: 'https://cdn.otakugifs.xyz/gifs/punch/lQbYrpwHpz.gif',
    poke:  'https://cdn.otakugifs.xyz/gifs/poke/0fac7376e78ccfe4.gif',
    bite:  'https://cdn.otakugifs.xyz/gifs/bite/ba4dffc1a8ba6e4d.gif',
    pat:   'https://cdn.otakugifs.xyz/gifs/pat/XCNHCmIs1w.gif',
    kill:  'https://cdn.otakugifs.xyz/gifs/punch/lQbYrpwHpz.gif',
  };

  try {
    const response = await fetch(`https://api.otakugifs.xyz/gif?reaction=${encodeURIComponent(category)}`, {
      headers: { 'User-Agent': 'SlowBot/1.0', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (response.ok) {
      const data = await response.json();
      if (typeof data.url === 'string' && data.url.startsWith('https://')) {
        return { url: data.url, anime: null };
      }
    }
  } catch (error) {
    console.warn(`[INTERACAO] API de GIF indisponível (${category}): ${error.message}`);
  }

  return { url: fallbackUrls[category] ?? null, anime: null };
}

async function incrementCount(type, fromId, toId) {
  const row = await prisma.interaction.upsert({
    where:  { type_fromId_toId: { type, fromId, toId } },
    update: { count: { increment: 1 } },
    create: { type, fromId, toId, count: 1 },
  });
  return row.count;
}

async function getMutualCount(type, userAId, userBId) {
  const rows = await prisma.interaction.findMany({
    where: {
      type,
      OR: [
        { fromId: userAId, toId: userBId },
        { fromId: userBId, toId: userAId },
      ],
    },
  });
  return rows.reduce((sum, r) => sum + r.count, 0);
}

const COMBO_MSGS = {
  kiss: [
    { min: 100, fn: (a, b) => `💖 **${a} e ${b} são inseparáveis! Amor eterno! 👑**` },
    { min: 50,  fn: (a, b) => `💗 **${a} e ${b} estão completamente apaixonados! 💋**` },
    { min: 20,  fn: (a, b) => `💘 *${a} e ${b} não conseguem parar de se beijar! 🔥*` },
    { min: 10,  fn: (a, b) => `💞 *${a} e ${b} estão viciados um no outro!*` },
    { min: 5,   fn: (a, b) => `💕 *${a} e ${b} estão criando algo especial...*` },
  ],
  gf: [
    { min: 100, fn: (a, b) => `💞 **${a} e ${b} viraram o casal mais comentado do servidor! 👑**` },
    { min: 50,  fn: (a, b) => `💗 **${a} e ${b} têm química de sobra!**` },
    { min: 20,  fn: (a, b) => `🔥 *${a} e ${b} estão deixando o clima cada vez mais intenso...*` },
    { min: 10,  fn: (a, b) => `💘 *${a} e ${b} não conseguem disfarçar esse clima!*` },
    { min: 5,   fn: (a, b) => `💕 *${a} e ${b} estão quase assumindo esse romance...*` },
  ],
  hug: [
    { min: 100, fn: (a, b) => `🫂 **${a} e ${b} têm o abraço mais famoso do servidor! 👑**` },
    { min: 50,  fn: (a, b) => `💛 **${a} e ${b} são melhores amigos para sempre!**` },
    { min: 20,  fn: (a, b) => `🤗 *${a} e ${b} se abraçam com tudo que têm! 💪*` },
    { min: 10,  fn: (a, b) => `☀️ *${a} e ${b} se aquecem mutuamente!*` },
    { min: 5,   fn: (a, b) => `🌟 *${a} e ${b} têm uma amizade especial...*` },
  ],
  slap: [
    { min: 100, fn: (a, b) => `😵 **${a} e ${b} travaram uma guerra épica de tapas! 👑**` },
    { min: 50,  fn: (a, b) => `🥊 **${a} e ${b} brigam como campeões!**` },
    { min: 20,  fn: (a, b) => `💢 *${a} e ${b} não conseguem parar de se esbofetear! 😤*` },
    { min: 10,  fn: (a, b) => `😠 *${a} e ${b} estão numa rivalidade intensa!*` },
    { min: 5,   fn: (a, b) => `⚡ *${a} e ${b} desenvolveram uma rivalidade...*` },
  ],
  punch: [
    { min: 100, fn: (a, b) => `💥 **${a} e ${b} são os lutadores lendários do servidor! 👑**` },
    { min: 50,  fn: (a, b) => `🥋 **${a} e ${b} travam batalhas épicas!**` },
    { min: 20,  fn: (a, b) => `👊 *${a} e ${b} estão numa guerra de socos! 💢*` },
    { min: 10,  fn: (a, b) => `⚡ *${a} e ${b} não conseguem parar de se bater!*` },
    { min: 5,   fn: (a, b) => `🔥 *${a} e ${b} estão num duelo acirrado...*` },
  ],
  pat: [
    { min: 100, fn: (a, b) => `🥰 **${a} e ${b} partilham o carinho mais puro do servidor! 👑**` },
    { min: 50,  fn: (a, b) => `💝 **${a} e ${b} são a dupla mais carinhosa!**` },
    { min: 20,  fn: (a, b) => `🌸 *${a} e ${b} se cuidam como ninguém! 💖*` },
    { min: 10,  fn: (a, b) => `🌷 *${a} e ${b} têm uma ligação especial!*` },
    { min: 5,   fn: (a, b) => `✨ *${a} e ${b} estão se aproximando...*` },
  ],
  default: [
    { min: 100, fn: (a, b) => `👑 **${a} e ${b} têm 100+ interações lendárias!**` },
    { min: 50,  fn: (a, b) => `🌟 **${a} e ${b} interagem como veteranos!**` },
    { min: 20,  fn: (a, b) => `🔥 *${a} e ${b} interagem sem parar!*` },
    { min: 10,  fn: (a, b) => `⚡ *${a} e ${b} estão ficando próximos!*` },
    { min: 5,   fn: (a, b) => `✨ *${a} e ${b} começam uma tradição...*` },
  ],
};

function getComboMsg(type, mutualCount, fromName, toName) {
  const list = COMBO_MSGS[type] ?? COMBO_MSGS.default;
  for (const entry of list) {
    if (mutualCount >= entry.min) return entry.fn(fromName, toName);
  }
  return null;
}

function mentionUser(user) {
  const id = user?.id ?? user?.user?.id;
  return id ? `<@${id}>` : `@${user?.displayName ?? user?.username ?? 'Alguém'}`;
}

function buildGfPayload(fromUser, toUser, gifUrl, streak, includeButton = true) {
  const fromMention = mentionUser(fromUser);
  const toMention = mentionUser(toUser);
  const text =
    `## GF\n` +
    `${fromMention} fez GF com ${toMention}.\n` +
    `Streak ${streak}x • +18 XP para cada um\n` +
    `GF ${streak}x. A sala ficou pronta para a cena pós-ending de anime.\n\n` +
    `**Sequência**\n` +
    `A cada 10x seguidas esse par ganha bônus extra de XP social.`;

  const container = v2Rich({ text, imageUrl: gifUrl });
  if (!includeButton) return v2Payload(container);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`int_r_gf_${fromUser?.id ?? fromUser?.user?.id}_${toUser?.id ?? toUser?.user?.id}`)
      .setLabel('Continuar GF')
      .setStyle(ButtonStyle.Secondary),
  );

  return v2Payload(container, row);
}

export async function buildInteractionEmbed(
  type,
  fromUser,
  toUser,
  isRetribution = false,
  includeButton = !isRetribution,
) {
  const action   = ACTIONS[type];
  const fromName = fromUser.displayName ?? fromUser.username ?? 'Alguém';
  const toName   = toUser.displayName   ?? toUser.username   ?? 'Alguém';
  const fromId   = fromUser.id ?? fromUser.user?.id;
  const toId     = toUser.id ?? toUser.user?.id;

  const [gifData, count, mutualCount] = await Promise.all([
    fetchGif(action.gif),
    incrementCount(type, fromId, toId),
    getMutualCount(type, fromId, toId),
  ]);

  if (type === 'gf') {
    return buildGfPayload(
      fromUser,
      toUser,
      gifData.url,
      Math.max(1, mutualCount + 1),
      includeButton,
    );
  }

  let description;
  if (isRetribution) {
    const comboMsg = getComboMsg(type, mutualCount, fromName, toName);
    description = `${action.retMsg(fromName, toName)}\n*${fromName} e ${toName} ${action.mutualVerb(mutualCount)}.*`;
    if (comboMsg) description += `\n\n${comboMsg}`;
  } else {
    description = `${action.msg(fromName, toName)}\n${action.counter(toName, count)}`;
    if (mutualCount >= 5) {
      const comboMsg = getComboMsg(type, mutualCount, fromName, toName);
      if (comboMsg) description += `\n\n${comboMsg}`;
    }
  }

  const text = gifData.anime
    ? `${description}\n\n*Anime: ${gifData.anime}*`
    : description;

  if (!includeButton) {
    return v2Payload(v2Rich({ text, imageUrl: gifData.url }));
  }

  // Botões: voltar (só o alvo pode clicar) + Rejeitar
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`int_r_${type}_${fromId}_${toId}`)
      .setEmoji(action.emoji)
      .setLabel(action.btnLabel)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`int_rej_${type}_${toId}`)
      .setEmoji('✖️')
      .setLabel('Rejeitar')
      .setStyle(ButtonStyle.Danger),
  );

  return v2Payload(
    v2Rich({ text, imageUrl: gifData.url }),
    row,
  );
}

async function runAction(type, actor, target, replyFn) {
  const actorId  = actor.id ?? actor.user?.id;
  const targetId = target.id ?? target.user?.id;

  if (target.bot ?? target.user?.bot)
    return replyFn({ ...v2Simple('❌ Você não pode interagir com um bot.'), ephemeral: true });

  if (targetId === actorId)
    return replyFn({ ...v2Simple('❌ Você não pode interagir consigo mesmo.'), ephemeral: true });

  const payload = await buildInteractionEmbed(type, actor, target);
  return replyFn(payload);
}

// ─── Slash command único /interacao com subcomandos ──────────────────────────
const builder = new SlashCommandBuilder()
  .setName('interacao')
  .setDescription('💕 Interações com outros membros do servidor');

for (const [type, action] of Object.entries(ACTIONS)) {
  builder.addSubcommand(sub =>
    sub.setName(type)
      .setDescription(action.desc)
      .addUserOption(o => o.setName('usuario').setDescription('Usuário alvo').setRequired(true)),
  );
}

// Todos os aliases de todas as ações (para prefix: savage kiss @u, savage hug @u…)
const allAliases = Object.entries(ACTIONS).flatMap(([type, action]) => [type, ...action.aliases]);

export default [{
  data: builder,
  name: 'interacao',
  aliases: allAliases,

  async execute(interaction) {
    const type   = interaction.options.getSubcommand();
    await interaction.deferReply();
    const target = interaction.options.getUser('usuario');
    const member = await interaction.guild.members.fetch(target.id).catch(() => target);
    await runAction(type, interaction.member ?? interaction.user, member, opts => interaction.editReply(opts));
  },

  // Prefix: "savage kiss @user", "savage hug @user", etc.
  // commandName = o alias usado (kiss, hug, slap…)
  async executePrefix(message, args, client, commandName) {
    // Resolve o tipo real a partir do commandName (pode ser alias)
    const type = Object.keys(ACTIONS).find(t =>
      t === commandName || ACTIONS[t].aliases.includes(commandName),
    );
    if (!type) return;
    const action = ACTIONS[type];
    const target = message.mentions.users.first();
    if (!target) {
      return message.reply(v2Simple(`❌ Mencione o usuário. Ex: \`savage ${type} @user\``));
    }
    const member = await message.guild.members.fetch(target.id).catch(() => target);
    await runAction(type, message.member ?? message.author, member, opts => message.reply(opts));
  },
}];
