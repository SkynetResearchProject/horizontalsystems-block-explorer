var btc = require("./coins/btc.js");
var bch = require("./coins/bch.js");
var ltc = require("./coins/ltc.js");
var skyr = require("./coins/skyr.js");

module.exports = {
	"BTC": btc,
	"LTC": ltc,
	"BCH": bch,
	"SKYR": skyr,

	"coins":["BTC", "LTC", "BCH", "SKYR"]
};
