// Inline keyboards: the main menu and the alert-level picker.
const { Markup } = require('telegraf');
const { LEVELS, describeLevel } = require('./settings');

function mainMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📊 Status', 'menu:status')],
    [
      Markup.button.callback('🔔 Subscribe', 'menu:subscribe'),
      Markup.button.callback('🔕 Unsubscribe', 'menu:unsubscribe'),
    ],
    [
      Markup.button.callback('⚙️ Alert level', 'menu:level'),
      Markup.button.callback('❓ Help', 'menu:help'),
    ],
  ]);
}

function levelMenu(currentLevel) {
  const buttons = LEVELS.map((level) => {
    const mark = level === currentLevel ? '✅ ' : '';
    return [Markup.button.callback(`${mark}${level} — ${describeLevel(level)}`, `level:${level}`)];
  });
  buttons.push([Markup.button.callback('⬅️ Back to menu', 'menu:main')]);
  return Markup.inlineKeyboard(buttons);
}

module.exports = { mainMenu, levelMenu };
