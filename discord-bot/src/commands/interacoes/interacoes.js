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
    gif:          ['kiss', 'love', 'blush'],
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
    gif:          ['kiss', 'love', 'happy'],
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
    gif:          ['hug', 'cuddle', 'love'],
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
    gif:          ['slap', 'smack', 'angrystare'],
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
    gif:          ['punch', 'brofist', 'smack'],
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
    gif:          ['poke', 'tickle', 'stare'],
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
    gif:          ['bite', 'nom', 'nuzzle'],
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
    gif:          ['pat', 'nuzzle', 'cuddle'],
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
    gif:          ['punch', 'smack', 'stare'],
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
    // OtakuGIFs não possui uma categoria "kill"; estas opções mantêm a cena
    // dramática sem repetir sempre o mesmo GIF de punch.
    gif:          ['punch', 'slap', 'smack', 'angrystare'],
    desc:         '🗡️ Mata alguém em uma cena de anime',
    msg:          (a, b) => `**${a}** mata **${b}** em uma cena dramática de anime 🗡️`,
    counter:      (to, n) => `*${to} foi derrotado ${n} ${n === 1 ? 'vez' : 'vezes'}.*`,
    btnLabel:     'Revidar',
    retMsg:       (a, b) => `**${a}** revida e derrota **${b}**! 🗡️`,
    mutualVerb:   (n) => `se derrotaram **${n}** ${n === 1 ? 'vez' : 'vezes'}`,
  },
};

export const REJECTION_GIFS = ['no', 'stop', 'sorry', 'pout', 'sad'];

const fallbackUrls = {
  kiss: [
    'https://cdn.otakugifs.xyz/gifs/kiss/736a111d8ed929b2.gif',
    'https://cdn.otakugifs.xyz/gifs/kiss/a2cff2325e17c674.gif',
    'https://cdn.otakugifs.xyz/gifs/kiss/e34493aac9970d50.gif',
    'https://cdn.otakugifs.xyz/gifs/kiss/06c217107318c1d6.gif',
  ],
  love: [
    'https://cdn.otakugifs.xyz/gifs/love/adc831819611cd4f.gif',
    'https://cdn.otakugifs.xyz/gifs/love/953e43f154b3d1ec.gif',
    'https://cdn.otakugifs.xyz/gifs/love/9d47a61cc07ae787.gif',
    'https://cdn.otakugifs.xyz/gifs/love/4fa4d3db1f354994.gif',
  ],
  blush: [
    'https://cdn.otakugifs.xyz/gifs/blush/IsQveBoWJk.gif',
    'https://cdn.otakugifs.xyz/gifs/blush/101feac622d97739.gif',
  ],
  hug: [
    'https://cdn.otakugifs.xyz/gifs/hug/408915119268a454.gif',
    'https://cdn.otakugifs.xyz/gifs/hug/KFmkV0jiwI.gif',
    'https://cdn.otakugifs.xyz/gifs/hug/7a2404aa8760a665.gif',
    'https://cdn.otakugifs.xyz/gifs/hug/68ed8177a3a022d8.gif',
  ],
  cuddle: [
    'https://cdn.otakugifs.xyz/gifs/cuddle/ba935ce7bc897ed0.gif',
    'https://cdn.otakugifs.xyz/gifs/cuddle/ebc3e23450a4dcba.gif',
    'https://cdn.otakugifs.xyz/gifs/cuddle/872a8e26d9ec4790.gif',
  ],
  happy: [
    'https://cdn.otakugifs.xyz/gifs/happy/2870bb4a1b4dbf7a.gif',
    'https://cdn.otakugifs.xyz/gifs/happy/vhplowmpdJ.gif',
    'https://cdn.otakugifs.xyz/gifs/happy/95bf8e31d13a9449.gif',
  ],
  slap: [
    'https://cdn.otakugifs.xyz/gifs/slap/2215a625136a1cda.gif',
    'https://cdn.otakugifs.xyz/gifs/slap/YZVDKmmik2.gif',
    'https://cdn.otakugifs.xyz/gifs/slap/0d82850a623b04f6.gif',
    'https://cdn.otakugifs.xyz/gifs/slap/d3ac2534c0a5f1c4.gif',
  ],
  smack: [
    'https://cdn.otakugifs.xyz/gifs/smack/78c956974f371f70.gif',
    'https://cdn.otakugifs.xyz/gifs/smack/bd269a201834e64c.gif',
    'https://cdn.otakugifs.xyz/gifs/smack/Xhxvcdkcfx.gif',
  ],
  angrystare: [
    'https://cdn.otakugifs.xyz/gifs/angrystare/1c7da8ee7b14ed62.gif',
    'https://cdn.otakugifs.xyz/gifs/angrystare/15f8fb748ad949c5.gif',
    'https://cdn.otakugifs.xyz/gifs/angrystare/599214b14d6b402e.gif',
  ],
  punch: [
    'https://cdn.otakugifs.xyz/gifs/punch/lQbYrpwHpz.gif',
    'https://cdn.otakugifs.xyz/gifs/punch/8zgYvNjmtMnD.gif',
    'https://cdn.otakugifs.xyz/gifs/punch/6a071f4273b6c06d.gif',
    'https://cdn.otakugifs.xyz/gifs/punch/7iu27NtD3W57.gif',
  ],
  brofist: [
    'https://cdn.otakugifs.xyz/gifs/brofist/0qEaIcvowz.gif',
    'https://cdn.otakugifs.xyz/gifs/brofist/47cdea3ee11ea46d.gif',
    'https://cdn.otakugifs.xyz/gifs/brofist/86ac6d7fcd6aa037.gif',
  ],
  poke: [
    'https://cdn.otakugifs.xyz/gifs/poke/0fac7376e78ccfe4.gif',
    'https://cdn.otakugifs.xyz/gifs/poke/YeRuyxXPKp.gif',
    'https://cdn.otakugifs.xyz/gifs/poke/b6969ba7388c3327.gif',
    'https://cdn.otakugifs.xyz/gifs/poke/6a4d4d0a7a39bfb9.gif',
  ],
  tickle: [
    'https://cdn.otakugifs.xyz/gifs/tickle/fd7c62aa65f67fc4.gif',
    'https://cdn.otakugifs.xyz/gifs/tickle/TzBF26ci3U.gif',
  ],
  stare: [
    'https://cdn.otakugifs.xyz/gifs/stare/eb8b8a83da023242.gif',
    'https://cdn.otakugifs.xyz/gifs/stare/RJcZBNkYAO.gif',
    'https://cdn.otakugifs.xyz/gifs/stare/aMYP3z4fmG.gif',
    'https://cdn.otakugifs.xyz/gifs/stare/4e4a55ad571e9b5f.gif',
  ],
  bite: [
    'https://cdn.otakugifs.xyz/gifs/bite/ba4dffc1a8ba6e4d.gif',
    'https://cdn.otakugifs.xyz/gifs/bite/qSQsCXHTRi.gif',
    'https://cdn.otakugifs.xyz/gifs/bite/912cdb636d8dcae1.gif',
    'https://cdn.otakugifs.xyz/gifs/bite/39880e1cae9bd963.gif',
  ],
  nom: [
    'https://cdn.otakugifs.xyz/gifs/nom/K2jtCbWOJC.gif',
    'https://cdn.otakugifs.xyz/gifs/nom/5fe4e3c23dfc5a16.gif',
    'https://cdn.otakugifs.xyz/gifs/nom/4f80e1761fdcd687.gif',
  ],
  nuzzle: [
    'https://cdn.otakugifs.xyz/gifs/nuzzle/8d4759fdfb1066ef.gif',
    'https://cdn.otakugifs.xyz/gifs/nuzzle/6807c3928b3c7a8f.gif',
  ],
  pat: [
    'https://cdn.otakugifs.xyz/gifs/pat/XCNHCmIs1w.gif',
    'https://cdn.otakugifs.xyz/gifs/pat/sXhIDsqPO6.gif',
    'https://cdn.otakugifs.xyz/gifs/pat/a2f5902d10f68ae5.gif',
    'https://cdn.otakugifs.xyz/gifs/pat/ea4737750a0447bb.gif',
  ],
  no: [
    'https://cdn.otakugifs.xyz/gifs/no/119a49e8c1ddc292.gif',
    'https://cdn.otakugifs.xyz/gifs/no/ee25f56bc4044ce9.gif',
    'https://cdn.otakugifs.xyz/gifs/no/qhOOLFgZyb.gif',
  ],
  stop: [
    'https://cdn.otakugifs.xyz/gifs/stop/4CVjzJCwjO.gif',
    'https://cdn.otakugifs.xyz/gifs/stop/83e6c4b9528aafc1.gif',
  ],
  sorry: [
    'https://cdn.otakugifs.xyz/gifs/sorry/f7e0112f007e126a.gif',
    'https://cdn.otakugifs.xyz/gifs/sorry/fb8d88fd132147eb.gif',
  ],
  pout: [
    'https://cdn.otakugifs.xyz/gifs/pout/57410f3547ffa6bd.gif',
    'https://cdn.otakugifs.xyz/gifs/pout/e35ced6a22738bbf.gif',
    'https://cdn.otakugifs.xyz/gifs/pout/782aff8db3655739.gif',
  ],
  sad: [
    'https://cdn.otakugifs.xyz/gifs/sad/a0cfe9c9354c1c28.gif',
    'https://cdn.otakugifs.xyz/gifs/sad/ec27498de0911184.gif',
    'https://cdn.otakugifs.xyz/gifs/sad/74da5bbeb48d14e2.gif',
  ],
};

const recentGifUrls = [];
const MAX_RECENT_GIFS = 24;

function normalizeGifCategories(category) {
  return (Array.isArray(category) ? category : [category])
    .filter(item => typeof item === 'string' && item.length > 0);
}

function rememberGif(url) {
  const previousIndex = recentGifUrls.indexOf(url);
  if (previousIndex !== -1) recentGifUrls.splice(previousIndex, 1);
  recentGifUrls.push(url);
  if (recentGifUrls.length > MAX_RECENT_GIFS) recentGifUrls.shift();
}

function chooseUnusedGif(urls) {
  const available = urls.filter(url => !recentGifUrls.includes(url));
  const pool = available.length > 0 ? available : urls;
  return pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : null;
}

export async function fetchGif(category) {
  const categories = normalizeGifCategories(category);

  for (let attempt = 0; attempt < 2; attempt++) {
    const reaction = categories[Math.floor(Math.random() * categories.length)];
    if (!reaction) break;

    try {
      const response = await fetch(`https://api.otakugifs.xyz/gif?reaction=${encodeURIComponent(reaction)}`, {
        headers: { 'User-Agent': 'SlowBot/1.0', 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (response.ok) {
        const data = await response.json();
        if (typeof data.url === 'string' && data.url.startsWith('https://') &&
            !recentGifUrls.includes(data.url)) {
          rememberGif(data.url);
          return { url: data.url, anime: null };
        }
      }
    } catch (error) {
      console.warn(`[INTERACAO] API de GIF indisponível (${reaction}): ${error.message}`);
    }
  }

  const fallbackPool = categories.flatMap(item => fallbackUrls[item] ?? []);
  const url = chooseUnusedGif(fallbackPool);
  if (url) rememberGif(url);
  return { url, anime: null };
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
