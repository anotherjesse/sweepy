const fs = require('fs');
const files = ['dist/game.js', 'dist/input/gamepad.js'];
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  let text = fs.readFileSync(file, 'utf8');
  text = text.replace(/\.js\.js/g, '.js');
  text = text.replace(/\.\/gfx\/render(?!(\.js))/g, './gfx/render.js');
  text = text.replace(/\.\/persist(?!(\.js))/g, './persist.js');
  text = text.replace(/\.\/gfx\/ui(?!(\.js))/g, './gfx/ui.js');
  text = text.replace(/\.\/config(?!(\.js))/g, './config.js');
  text = text.replace(/\.\/input\/gamepad(?!(\.js))/g, './input/gamepad.js');
  text = text.replace(/\.\.\/players(?!(\.js))/g, '../players.js');
  text = text.replace(/\.\/eventBus(?!(\.js))/g, './eventBus.js');
  fs.writeFileSync(file, text);
}
