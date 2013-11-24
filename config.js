if (process.env.LOG_PATH)
  var LOG_PATH = require('fs').createWriteStream(process.env.LOG_PATH);

module.exports = {
  bunyan : {
    name   : process.env.LOG_NAME  || 'init',
    level  : process.env.LOG_LEVEL || 'warn',
    stream : LOG_PATH              || process.stdout
  }
}
