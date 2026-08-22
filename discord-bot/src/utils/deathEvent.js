import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  TextDisplayBuilder,
} from 'discord.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import prisma from '../database/client.js';

const DEATH_CHANNEL_ID = '1536533809049108560';
const EVENT_PREFIX = 'death_event:';
const IMAGE_PATH = join(dirname(fileURLToPath(import.meta.url)), '../assets/morte.jpg');
const EVENT_DELETE_DELAY_MS = 30 * 1000;
const DEATH_MARK_DURATION_MS = 10 * 60 * 1000;
const DEATH_PUNISHMENT_CHANCE = 0.2;
const FIRST_DELAY_MIN = 2 * 60 * 1000;
const FIRST_DELAY_MAX = 5 * 60 * 1000;
const NEXT_DELAY_MIN = 12 * 60 * 1000;
const NEXT_DELAY_MAX = 22 * 60 * 1000;

let activeEvent = null;
let scheduler = null;

const COIN_CHOICES = [
  { amount: 3_000, label: '3.000 moedas' },
];

const DEATH_LINES = [
  'A Morte atravessou o véu e está procurando alguém corajoso.',
  'O silêncio acabou. A Morte escolheu este chat para fazer uma proposta.',
  'Uma sombra vermelha surgiu no chat... e ela trouxe uma chance única.',
  'A foice foi erguida. Quem será o primeiro a desafiar o destino?',
];

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function eventButtons({ disabled = false, initial = false } = {}) {
  if (initial) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${EVENT_PREFIX}start`)
        .setLabel('Conversar com a Morte')
        .setEmoji('☠️')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled),
    );
  }

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${EVENT_PREFIX}coins`)
      .setLabel('Aceitar moedas')
      .setEmoji('🪙')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`${EVENT_PREFIX}random`)
      .setLabel('Desafiar o destino')
      .setEmoji('🎲')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );
}

function eventContainer({ result = null, expired = false } = {}) {
  const description =
      result
        ? result.description
        : expired
          ? '🌫️ **Ninguém foi rápido o bastante.**\n\nA Morte recolheu a proposta e desapareceu entre as sombras. Na próxima aparição, talvez o destino seja seu.'
        : `*${pick(DEATH_LINES)}*\n\n` +
          '**Você só tem uma chance.**\n' +
          'Escolha suas moedas ou arrisque tudo por um prêmio aleatório da loja.\n\n' +
          '> Apenas a primeira pessoa a clicar será escolhida pela Morte.';
  const footer = expired
        ? 'A oportunidade se perdeu nas sombras.'
        : result
          ? 'O destino já foi selado.'
          : 'A aparição desaparece em 90 segundos.';
  const container = new ContainerBuilder();
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `## ${result ? '☠️ A Morte fez sua escolha' : '☠️ Uma visita do outro lado'}\n\n` +
      `${description}\n\n` +
      `-# ${footer}`,
  ));
  container.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL('attachment://morte.jpg'),
    ),
  );
  return container;
}

async function addCoins(userId, guildId, amount) {
  await prisma.economy.upsert({
    where: { userId_guildId: { userId, guildId } },
    create: { userId, guildId, balance: amount },
    update: { balance: { increment: amount } },
  });
}

async function punishDeathChallenge(interaction) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const economy = await prisma.economy.upsert({
    where: { userId_guildId: { userId, guildId } },
    create: { userId, guildId },
    update: {},
  });
  const coinsTaken = Math.min(economy.balance, 1_000);

  if (coinsTaken > 0) {
    await prisma.economy.update({
      where: { userId_guildId: { userId, guildId } },
      data: { balance: { decrement: coinsTaken } },
    });
  }

  const member = await interaction.guild.members.fetch(userId).catch(() => null);
  const botMember = interaction.guild.members.me
    ?? await interaction.guild.members.fetchMe().catch(() => null);
  let deathMark = interaction.guild.roles.cache.find(role => role.name === 'Marcado pela Morte');

  if (!deathMark && botMember?.permissions.has('ManageRoles')) {
    deathMark = await interaction.guild.roles.create({
      name: 'Marcado pela Morte',
      reason: 'Punição temporária do evento da Morte',
    }).catch(() => null);
  }

  if (member && deathMark && deathMark.position < (botMember?.roles.highest.position ?? 0)) {
    await member.roles.add(deathMark, 'Punição temporária do evento da Morte').catch(() => {});
    setTimeout(() => member.roles.remove(deathMark, 'Fim da marca temporária da Morte').catch(() => {}), DEATH_MARK_DURATION_MS);
  }

  return {
    description: `☠️ **${interaction.user}** desafiou a Morte, mas ela rejeitou sua aposta e levou **${coinsTaken.toLocaleString('pt-BR')} moedas**.\n\n> Você foi marcado pela Morte por 10 minutos. Talvez pensar duas vezes seja uma boa ideia.`,
  };
}

async function grantRandomReward(interaction) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  // O prêmio máximo é raro, mas possível.
  const roll = Math.random();
  if (roll < 0.01) {
    await addCoins(userId, guildId, 1_000_000);
    return {
      title: '🏆 SUPER PRÊMIO',
      description: `🏆 **${interaction.user}** foi escolhido pela Morte e ganhou o **SUPER PRÊMIO de 1.000.000 moedas**!\n\n> Nem a própria Morte esperava por esse resultado.`,
    };
  }
  if (roll < DEATH_PUNISHMENT_CHANCE) {
    return punishDeathChallenge(interaction);
  }

  const [roles, banners] = await Promise.all([
    prisma.shopRole.findMany({ where: { guildId, active: true } }).catch(() => []),
    prisma.customBanner.findMany({ where: { guildId, active: true } }).catch(() => []),
  ]);

  const rewards = [
    { type: 'coins', amount: 5_000, label: '5.000 moedas' },
    { type: 'coins', amount: 12_500, label: '12.500 moedas' },
    { type: 'coins', amount: 35_000, label: '35.000 moedas' },
    { type: 'coins', amount: 100_000, label: '100.000 moedas' },
    ...roles.map(role => ({ type: 'role', role, label: `cargo **${role.name}**` })),
    ...banners.map(banner => ({ type: 'banner', banner, label: `banner **${banner.name}**` })),
  ];

  const reward = pick(rewards);
  if (reward.type === 'coins') {
    await addCoins(userId, guildId, reward.amount);
    return {
      description: `🎲 **${interaction.user}** desafiou o destino e ganhou **${reward.label}**!\n\n> A Morte sorriu... desta vez, ela trouxe sorte.`,
    };
  }

  if (reward.type === 'banner') {
    await prisma.userPurchase.upsert({
      where: { userId_itemType_itemRef: { userId, itemType: 'banner', itemRef: reward.banner.key } },
      create: { userId, guildId, itemType: 'banner', itemRef: reward.banner.key },
      update: {},
    });
    return {
      description: `🎲 **${interaction.user}** desafiou o destino e ganhou o ${reward.label}!\n\n> Uma nova relíquia foi adicionada à sua coleção.`,
    };
  }

  const member = await interaction.guild.members.fetch(userId).catch(() => null);
  const botMember = interaction.guild.members.me
    ?? await interaction.guild.members.fetchMe().catch(() => null);
  const role = interaction.guild.roles.cache.get(reward.role.roleId)
    ?? await interaction.guild.roles.fetch(reward.role.roleId).catch(() => null);

  if (member && role && !role.managed && role.position < (botMember?.roles.highest.position ?? 0)) {
    await member.roles.add(role).catch(() => {});
    await prisma.userPurchase.upsert({
      where: { userId_itemType_itemRef: { userId, itemType: 'role', itemRef: role.id } },
      create: { userId, guildId, itemType: 'role', itemRef: role.id },
      update: {},
    });
    return {
      description: `🎲 **${interaction.user}** desafiou o destino e ganhou o ${reward.label}!\n\n> A Morte concedeu o prêmio com as próprias mãos.`,
    };
  }

  // Se o cargo ficou inválido ou acima do bot entre o sorteio e a entrega,
  // nunca deixa o vencedor sem prêmio.
  await addCoins(userId, guildId, 15_000);
  return {
    description: `🎲 **${interaction.user}** desafiou o destino e ganhou **15.000 moedas**!\n\n> O prêmio original se perdeu nas sombras, mas a Morte compensou você.`,
  };
}

function scheduleNext(client, first = false) {
  clearTimeout(scheduler);
  const delay = first
    ? randomBetween(FIRST_DELAY_MIN, FIRST_DELAY_MAX)
    : randomBetween(NEXT_DELAY_MIN, NEXT_DELAY_MAX);
  scheduler = setTimeout(() => spawnDeathEvent(client).catch(err => {
    console.error('[MORTE] Erro ao criar evento:', err);
    scheduleNext(client);
  }), delay);
}

function armEventDeletion(message, client) {
  if (!activeEvent || activeEvent.messageId !== message.id) return;
  clearTimeout(activeEvent.deleteTimer);
  activeEvent.deleteTimer = setTimeout(async () => {
    if (!activeEvent || activeEvent.messageId !== message.id) return;
    await message.delete().catch(() => {});
    activeEvent = null;
    scheduleNext(client);
  }, EVENT_DELETE_DELAY_MS);
}

async function spawnDeathEvent(client) {
  if (activeEvent) return scheduleNext(client);

  const channel = await client.channels.fetch(DEATH_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased()) return scheduleNext(client);

  const message = await channel.send({
    components: [eventContainer(), eventButtons({ initial: true })],
    files: [new AttachmentBuilder(IMAGE_PATH, { name: 'morte.jpg' })],
    flags: MessageFlags.IsComponentsV2,
  }).catch(err => {
    console.error('[MORTE] Não consegui enviar no canal geral:', err.message);
    return null;
  });
  if (!message) return scheduleNext(client);

  activeEvent = { messageId: message.id, claimed: false };
  armEventDeletion(message, client);
}

export function startDeathEventScheduler(client) {
  if (scheduler) return;
  scheduleNext(client, true);
  console.log('[MORTE] Evento aleatório agendado para o canal geral.');
}

export function isDeathEventInteraction(interaction) {
  return interaction.customId?.startsWith(EVENT_PREFIX);
}

export async function handleDeathEventInteraction(interaction, client) {
  if (!isDeathEventInteraction(interaction)) return false;
  if (!activeEvent || activeEvent.messageId !== interaction.message.id) {
    await interaction.reply({ content: '🌫️ Essa aparição já desapareceu.', ephemeral: true }).catch(() => {});
    return true;
  }
  if (activeEvent.claimed) {
    await interaction.reply({ content: '💀 A Morte já escolheu outra pessoa.', ephemeral: true }).catch(() => {});
    return true;
  }

  if (interaction.customId === `${EVENT_PREFIX}start`) {
    armEventDeletion(interaction.message, client);
    await interaction.update({
      components: [eventContainer(), eventButtons()],
      flags: MessageFlags.IsComponentsV2,
    }).catch(() => {});
    return true;
  }

  // Reserva o evento antes de qualquer await: somente o primeiro clique vence.
  activeEvent.claimed = true;
  await interaction.deferUpdate().catch(() => {});

  let result;
  try {
    if (interaction.customId === `${EVENT_PREFIX}coins`) {
      const choice = pick(COIN_CHOICES);
      await addCoins(interaction.user.id, interaction.guildId, choice.amount);
      result = {
        description: `🪙 **${interaction.user}** escolheu o caminho seguro e recebeu **${choice.label}**!\n\n> Às vezes, sobreviver já é uma grande vitória.`,
      };
    } else {
      result = await grantRandomReward(interaction);
    }
  } catch (err) {
    console.error('[MORTE] Erro ao entregar prêmio:', err);
    await addCoins(interaction.user.id, interaction.guildId, 5_000).catch(() => {});
    result = {
      description: `🪙 **${interaction.user}** recebeu **5.000 moedas** como compensação.\n\n> O destino falhou em se decidir, mas a Morte honrou a promessa.`,
    };
  }

  await interaction.editReply({
    components: [eventContainer({ result }), eventButtons({ disabled: true })],
    flags: MessageFlags.IsComponentsV2,
  }).catch(() => {});
  clearTimeout(activeEvent.deleteTimer);
  activeEvent.deleteTimer = setTimeout(async () => {
    if (!activeEvent || activeEvent.messageId !== interaction.message.id) return;
    await interaction.message.delete().catch(() => {});
    activeEvent = null;
    scheduleNext(client);
  }, EVENT_DELETE_DELAY_MS);
  return true;
}