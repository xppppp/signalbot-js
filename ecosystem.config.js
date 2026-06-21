module.exports = {
  apps : [{
    name   : "signalbot-js",
    script : "./bot.js",
    env: {
      "CONFIG": "localconfig.json"
    }
  }]
}
