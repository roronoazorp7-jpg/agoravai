import { SlashCommandBuilder } from 'discord.js';
import { buildUtilityV2 } from '../../utils/utilityV2.js';

const MAX_EXPRESSION_LENGTH = 200;

function tokenize(expression) {
  const tokens = [];
  let index = 0;

  while (index < expression.length) {
    const char = expression[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (/[0-9.]/.test(char)) {
      const start = index;
      let dots = 0;
      while (index < expression.length && /[0-9.]/.test(expression[index])) {
        if (expression[index] === '.') dots += 1;
        index += 1;
      }

      const rawNumber = expression.slice(start, index);
      if (dots > 1 || rawNumber === '.') {
        throw new Error('número inválido');
      }
      tokens.push({ type: 'number', value: Number(rawNumber) });
      continue;
    }

    if ('+-*/%^()'.includes(char)) {
      tokens.push({ type: char, value: char });
      index += 1;
      continue;
    }

    throw new Error(`caractere inválido: ${char}`);
  }

  return tokens;
}

function parseExpression(expression) {
  const tokens = tokenize(expression);
  let index = 0;

  function peek() {
    return tokens[index];
  }

  function consume(type) {
    if (peek()?.type !== type) {
      throw new Error('expressão incompleta');
    }
    index += 1;
  }

  function parsePrimary() {
    const token = peek();
    if (token?.type === 'number') {
      index += 1;
      return token.value;
    }
    if (token?.type === '(') {
      index += 1;
      const value = parseAdditive();
      consume(')');
      return value;
    }
    throw new Error('número esperado');
  }

  function parsePower() {
    const left = parsePrimary();
    if (peek()?.type !== '^') return left;

    index += 1;
    const right = parseUnary();
    return left ** right;
  }

  function parseUnary() {
    if (peek()?.type === '+') {
      index += 1;
      return parseUnary();
    }
    if (peek()?.type === '-') {
      index += 1;
      return -parseUnary();
    }
    return parsePower();
  }

  function parseMultiplicative() {
    let value = parseUnary();

    while (['*', '/', '%'].includes(peek()?.type)) {
      const operator = peek().type;
      index += 1;
      const right = parseUnary();

      if ((operator === '/' || operator === '%') && right === 0) {
        throw new Error('não é possível dividir por zero');
      }
      if (operator === '*') value *= right;
      if (operator === '/') value /= right;
      if (operator === '%') value %= right;
    }

    return value;
  }

  function parseAdditive() {
    let value = parseMultiplicative();

    while (['+', '-'].includes(peek()?.type)) {
      const operator = peek().type;
      index += 1;
      const right = parseMultiplicative();
      value = operator === '+' ? value + right : value - right;
    }

    return value;
  }

  const result = parseAdditive();
  if (index !== tokens.length) throw new Error('operador ou parêntese inválido');
  if (!Number.isFinite(result)) throw new Error('o resultado ficou grande demais');
  return result;
}

function calculate(expression) {
  const normalized = expression.replace(/,/g, '.').trim();
  if (!normalized) throw new Error('informe uma expressão');
  if (normalized.length > MAX_EXPRESSION_LENGTH) throw new Error('a expressão é muito longa');
  return parseExpression(normalized);
}

function formatResult(value) {
  const safeValue = Object.is(value, -0) ? 0 : value;
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 10 }).format(safeValue);
}

function payload(expression, result) {
  return buildUtilityV2({
    text: `## Calculadora\n\n\`${expression}\` = **${formatResult(result)}**`,
  });
}

function errorMessage(error) {
  return `❌ Não consegui calcular: ${error.message}. Use números, parênteses e os operadores \`+ - * / % ^\`.`;
}

export default {
  data: new SlashCommandBuilder()
    .setName('calculadora')
    .setDescription('Faz uma conta com segurança')
    .addStringOption(option =>
      option
        .setName('expressao')
        .setDescription('Exemplo: (12 + 8) / 2^2')
        .setMaxLength(MAX_EXPRESSION_LENGTH)
        .setRequired(true),
    ),
  name: 'calculadora',
  aliases: ['calcular', 'calc'],

  async execute(interaction) {
    const expression = interaction.options.getString('expressao');
    try {
      return interaction.reply(payload(expression, calculate(expression)));
    } catch (error) {
      return interaction.reply({ content: errorMessage(error), ephemeral: true });
    }
  },

  async executePrefix(message, args) {
    const expression = args.join(' ');
    try {
      return message.reply(payload(expression, calculate(expression)));
    } catch (error) {
      return message.reply(errorMessage(error));
    }
  },
};