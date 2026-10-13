const path = require('node:path');
module.exports = {
  cacheDirectory: path.join(__dirname, '.runtime', 'browser'),
  chrome: { skipDownload: true },
  'chrome-headless-shell': { skipDownload: false },
  firefox: { skipDownload: true },
};
