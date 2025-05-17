const fs = require('fs');
const file = 'dist/game.js';
if (fs.existsSync(file)) {
  let text = fs.readFileSync(file, 'utf8');
  text = text.replace(/\.js\.js/g, '.js');
  text = text.replace(/\.\/gfx\/render(?!(\.js))/g, './gfx/render.js');
  text = text.replace(/\.\/persist(?!(\.js))/g, './persist.js');
  text = text.replace(/\.\/gfx\/ui(?!(\.js))/g, './gfx/ui.js');
  text = text.replace(/\.\/config(?!(\.js))/g, './config.js');
  fs.writeFileSync(file, text);
}
