const fs = require("fs");

var Decimal = require("decimal.js");
var request = require("request");
var qrcode = require("qrcode");

var config = require("./config.js");
var coins = require("./coins.js");
var coinConfig = coins[config.coin];
var redisCache = require("./redisCache.js");

const ecc = require('tiny-secp256k1');
const { BIP32Factory } = require('bip32');

// You must wrap a tiny-secp256k1 compatible implementation
const bip32 = BIP32Factory(ecc);

const bitcoinjs = require('bitcoinjs-lib');

var exponentScales = [
	{val:1000000000000000000000000000000000, name:"?", abbreviation:"V", exponent:"33"},
	{val:1000000000000000000000000000000, name:"?", abbreviation:"W", exponent:"30"},
	{val:1000000000000000000000000000, name:"?", abbreviation:"X", exponent:"27"},
	{val:1000000000000000000000000, name:"yotta", abbreviation:"Y", exponent:"24"},
	{val:1000000000000000000000, name:"zetta", abbreviation:"Z", exponent:"21"},
	{val:1000000000000000000, name:"exa", abbreviation:"E", exponent:"18"},
	{val:1000000000000000, name:"peta", abbreviation:"P", exponent:"15"},
	{val:1000000000000, name:"tera", abbreviation:"T", exponent:"12"},
	{val:1000000000, name:"giga", abbreviation:"G", exponent:"9"},
	{val:1000000, name:"mega", abbreviation:"M", exponent:"6"},
	{val:1000, name:"kilo", abbreviation:"K", exponent:"3"}
];

var ipMemoryCache = {};
var ipCache = {
	get:function(key) {
		return new Promise(function(resolve, reject) {
			if (ipMemoryCache[key] != null) {
				resolve({key:key, value:ipMemoryCache[key]});

				return;
			}

			if (redisCache.active) {
				redisCache.get("ip-" + key).then(function(redisResult) {
					if (redisResult != null) {
						resolve({key:key, value:redisResult});

						return;
					}

					resolve({key:key, value:null});
				});

			} else {
				resolve({key:key, value:null});
			}
		});
	},
	set:function(key, value, expirationMillis) {
		ipMemoryCache[key] = value;

		if (redisCache.active) {
			redisCache.set("ip-" + key, value, expirationMillis);
		}
	}
};



function redirectToConnectPageIfNeeded(req, res) {
	if (!req.session.host) {
		req.session.redirectUrl = req.originalUrl;
		
		res.redirect("/");
		res.end();
		
		return true;
	}
	
	return false;
}

function hex2ascii(hex) {
	var str = "";
	for (var i = 0; i < hex.length; i += 2) {
		str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
	}
	
	return str;
}

function splitArrayIntoChunks(array, chunkSize) {
	var j = array.length;
	var chunks = [];
	
	for (var i = 0; i < j; i += chunkSize) {
		chunks.push(array.slice(i, i + chunkSize));
	}

	return chunks;
}

function getRandomString(length, chars) {
    var mask = '';
	
    if (chars.indexOf('a') > -1) {
		mask += 'abcdefghijklmnopqrstuvwxyz';
	}
	
    if (chars.indexOf('A') > -1) {
		mask += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
	}
	
    if (chars.indexOf('#') > -1) {
		mask += '0123456789';
	}
    
	if (chars.indexOf('!') > -1) {
		mask += '~`!@#$%^&*()_+-={}[]:";\'<>?,./|\\';
	}
	
    var result = '';
    for (var i = length; i > 0; --i) {
		result += mask[Math.floor(Math.random() * mask.length)];
	}
	
	return result;
}

var formatCurrencyCache = {};

function getCurrencyFormatInfo(formatType) {
	if (formatCurrencyCache[formatType] == null) {
		for (var x = 0; x < coins[config.coin].currencyUnits.length; x++) {
			var currencyUnit = coins[config.coin].currencyUnits[x];

			for (var y = 0; y < currencyUnit.values.length; y++) {
				var currencyUnitValue = currencyUnit.values[y];

				if (currencyUnitValue == formatType) {
					formatCurrencyCache[formatType] = currencyUnit;
				}
			}
		}
	}

	if (formatCurrencyCache[formatType] != null) {
		return formatCurrencyCache[formatType];
	}

	return null;
}

function formatCurrencyAmountWithForcedDecimalPlaces(amount, formatType, forcedDecimalPlaces) {
	var formatInfo = getCurrencyFormatInfo(formatType);
	if (formatInfo != null) {
		var dec = new Decimal(amount);

		var decimalPlaces = formatInfo.decimalPlaces;
		if (decimalPlaces == 0 && dec < 1) {
			decimalPlaces = 5;
		}

		if (forcedDecimalPlaces >= 0) {
			decimalPlaces = forcedDecimalPlaces;
		}

		if (formatInfo.type == "native") {
			dec = dec.times(formatInfo.multiplier);

			return addThousandsSeparators(dec.toDecimalPlaces(decimalPlaces)) + " " + formatInfo.name;

		} else if (formatInfo.type == "exchanged") {
			if (global.exchangeRates != null && global.exchangeRates[formatInfo.multiplier] != null) {
				dec = dec.times(global.exchangeRates[formatInfo.multiplier]);

				return formatInfo.symbol + addThousandsSeparators(dec.toDecimalPlaces(decimalPlaces));
			}
		}
	}
	
	return amount;
}

function formatCurrencyAmount(amount, formatType) {
	return formatCurrencyAmountWithForcedDecimalPlaces(amount, formatType, -1);
}

function formatCurrencyAmountInSmallestUnits(amount, forcedDecimalPlaces) {
	return formatCurrencyAmountWithForcedDecimalPlaces(amount, coins[config.coin].baseCurrencyUnit.name, forcedDecimalPlaces);
}

// ref: https://stackoverflow.com/a/2901298/673828
function addThousandsSeparators(x) {
	var parts = x.toString().split(".");
	parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");

	return parts.join(".");
}

function formatExchangedCurrency(amount, exchangeType) {
	if (global.exchangeRates != null && global.exchangeRates[exchangeType.toLowerCase()] != null) {
		var dec = new Decimal(amount);
		dec = dec.times(global.exchangeRates[exchangeType.toLowerCase()]);

		return "$" + addThousandsSeparators(dec.toDecimalPlaces(2));
	}

	return "";
}

function seededRandom(seed) {
    var x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
}

function seededRandomIntBetween(seed, min, max) {
	var rand = seededRandom(seed);
	return (min + (max - min) * rand);
}

function logAppStats() {
	if (global.influxdb) {
		var points = [];

		points.push({
			measurement:`app.memory_usage`,
			tags:{app:("skyr-rpc-explorer." + global.config.coin)},
			fields:process.memoryUsage()
		});

		points.push({
			measurement:`app.uptime`,
			tags:{app:("skyr-rpc-explorer." + global.config.coin)},
			fields:{value:Math.floor(process.uptime())}
		});

		global.influxdb.writePoints(points).catch(err => {
			console.error(`Error saving data to InfluxDB: ${err.stack}`);
		});
	}
}

function logMemoryUsage() {
	var mbUsed = process.memoryUsage().heapUsed / 1024 / 1024;
	mbUsed = Math.round(mbUsed * 100) / 100;

	var mbTotal = process.memoryUsage().heapTotal / 1024 / 1024;
	mbTotal = Math.round(mbTotal * 100) / 100;

	//console.log("memoryUsage: heapUsed=" + mbUsed + ", heapTotal=" + mbTotal + ", ratio=" + parseInt(mbUsed / mbTotal * 100));
}

function getMinerFromCoinbaseTx(tx) {
	if (tx == null || tx.vin == null || tx.vin.length == 0) {
		return null;
	}
	
	if (global.miningPoolsConfigs) {
		for (var i = 0; i < global.miningPoolsConfigs.length; i++) {
			var miningPoolsConfig = global.miningPoolsConfigs[i];

			for (var payoutAddress in miningPoolsConfig.payout_addresses) {
				if (miningPoolsConfig.payout_addresses.hasOwnProperty(payoutAddress)) {
					if (tx.vout && tx.vout.length > 0 && tx.vout[0].scriptPubKey && tx.vout[0].scriptPubKey.addresses && tx.vout[0].scriptPubKey.addresses.length > 0) {
						if (tx.vout[0].scriptPubKey.addresses[0] == payoutAddress) {
							var minerInfo = miningPoolsConfig.payout_addresses[payoutAddress];
							minerInfo.identifiedBy = "payout address " + payoutAddress;

							return minerInfo;
						}
					}
				}
			}

			for (var coinbaseTag in miningPoolsConfig.coinbase_tags) {
				if (miningPoolsConfig.coinbase_tags.hasOwnProperty(coinbaseTag)) {
					if (hex2ascii(tx.vin[0].coinbase).indexOf(coinbaseTag) != -1) {
						var minerInfo = miningPoolsConfig.coinbase_tags[coinbaseTag];
						minerInfo.identifiedBy = "coinbase tag '" + coinbaseTag + "'";

						return minerInfo;
					}
				}
			}
		}
	}

	return null;
}

function getTxTotalInputOutputValues(tx, txInputs, blockHeight) {
	var totalInputValue = new Decimal(0);
	var totalOutputValue = new Decimal(0);

	try {
		for (var i = 0; i < tx.vin.length; i++) {
			if (tx.vin[i].coinbase) {
				totalInputValue = totalInputValue.plus(new Decimal(coinConfig.blockRewardFunction(blockHeight)));

			} else {
				var txInput = txInputs[i];

				if (txInput) {
					try {
						var vout = txInput.vout[tx.vin[i].vout];
						if (vout.value) {
							totalInputValue = totalInputValue.plus(new Decimal(vout.value));
						}
					} catch (err) {
						console.log("Error getting tx.totalInputValue: err=" + err + ", txid=" + tx.txid + ", index=tx.vin[" + i + "]");
					}
				}
			}
		}
		
		for (var i = 0; i < tx.vout.length; i++) {
			totalOutputValue = totalOutputValue.plus(new Decimal(tx.vout[i].value));
		}
	} catch (err) {
		console.log("Error computing total input/output values for tx: err=" + err + ", tx=" + JSON.stringify(tx) + ", txInputs=" + JSON.stringify(txInputs) + ", blockHeight=" + blockHeight);
	}

	return {input:totalInputValue, output:totalOutputValue};
}

function getBlockTotalFeesFromCoinbaseTxAndBlockHeight(coinbaseTx, blockHeight) {
	if (coinbaseTx == null) {
		return 0;
	}

	var blockReward = coinConfig.blockRewardFunction(blockHeight);

	var totalOutput = new Decimal(0);
	for (var i = 0; i < coinbaseTx.vout.length; i++) {
		var outputValue = coinbaseTx.vout[i].value;
		if (outputValue > 0) {
			totalOutput = totalOutput.plus(new Decimal(outputValue));
		}
	}

	return totalOutput.minus(new Decimal(blockReward));
}

function estimatedSupply(height) {
	const checkpoint = coinConfig.utxoSetCheckpointsByNetwork[global.activeBlockchain];

	let checkpointHeight = 0;
	let checkpointSupply = new Decimal(50);

	if (checkpoint && checkpoint.height <= height) {
		//console.log("using checkpoint");
		checkpointHeight = checkpoint.height;
		checkpointSupply = new Decimal(checkpoint.total_amount);
	}

	let halvingBlockInterval = coinConfig.halvingBlockIntervalsByNetwork[global.activeBlockchain];

	let supply = checkpointSupply;

	let i = checkpointHeight;
	while (i < height) {
		let nextHalvingHeight = halvingBlockInterval * Math.floor(i / halvingBlockInterval) + halvingBlockInterval;
		
		if (height < nextHalvingHeight) {
			let heightDiff = height - i;

			//console.log(`adding(${heightDiff}): ` + new Decimal(heightDiff).times(coinConfig.blockRewardFunction(i, global.activeBlockchain)));
			return supply.plus(new Decimal(heightDiff).times(coinConfig.blockRewardFunction(i, global.activeBlockchain)));
		}

		let heightDiff = nextHalvingHeight - i;

		supply = supply.plus(new Decimal(heightDiff).times(coinConfig.blockRewardFunction(i, global.activeBlockchain)));
		
		i += heightDiff;
	}

	return supply;
}

function refreshExchangeRates() {
	if (!config.queryExchangeRates || config.privacyMode) {
		return;
	}

	if (coins[config.coin].exchangeRateData) {
		request(coins[config.coin].exchangeRateData.jsonUrl, function(error, response, body) {
			if (error == null && response && response.statusCode && response.statusCode == 200) {
				var responseBody = JSON.parse(body);

				var exchangeRates = coins[config.coin].exchangeRateData.responseBodySelectorFunction(responseBody);
				if (exchangeRates != null) {
					global.exchangeRates = exchangeRates;
					global.exchangeRatesUpdateTime = new Date();

					if (global.influxdb) {
						var points = [];
						for (var key in exchangeRates) {
							points.push({
								measurement: `exchange_rates.${coins[config.coin].ticker.toLowerCase()}_${key.toLowerCase()}`,
								fields:{value:parseFloat(exchangeRates[key])}
							});
						}

						//console.log("pts: " + JSON.stringify(points));

						global.influxdb.writePoints(points).catch(err => {
							console.error(`Error saving data to InfluxDB: ${err.stack}`)
						});
					}

					console.log("Using exchange rates: " + JSON.stringify(global.exchangeRates) + " starting at " + global.exchangeRatesUpdateTime);

				} else {
					console.log("Unable to get exchange rate data");
				}
			} else {
				console.log(`Error 39r7h2390fgewfgds: ${error}, StatusCode: ${(response != null) ? response.statusCode : ""}, Response: ${JSON.stringify(response)}`);
			}
		});
	}
}

// Uses ipstack.com API
function geoLocateIpAddresses(ipAddresses, provider) {
	return new Promise(function(resolve, reject) {
		if (config.privacyMode) {
			resolve({});

			return;
		}

		var ipDetails = {ips:ipAddresses, detailsByIp:{}};

		var promises = [];
		for (var i = 0; i < ipAddresses.length; i++) {
			var ipStr = ipAddresses[i];
			
			promises.push(new Promise(function(resolve2, reject2) {
				ipCache.get(ipStr).then(function(result) {
					if (result.value == null) {
						var apiUrl = "http://api.ipstack.com/" + result.key + "?access_key=" + config.credentials.ipStackComApiAccessKey;
						
						console.log("Requesting IP-geo: " + apiUrl);

						request(apiUrl, function(error, response, body) {
							if (error) {
								reject2(error);

							} else {
								resolve2({needToProcess:true, response:response});
							}
						});

					} else {
						ipDetails.detailsByIp[result.key] = result.value;

						resolve2({needToProcess:false});
					}
				});
			}));
		}

		Promise.all(promises).then(function(results) {
			for (var i = 0; i < results.length; i++) {
				if (results[i].needToProcess) {
					var res = results[i].response;
					if (res != null && res["statusCode"] == 200) {
						var resBody = JSON.parse(res["body"]);
						var ip = resBody["ip"];

						ipDetails.detailsByIp[ip] = resBody;

						ipCache.set(ip, resBody, 1000 * 60 * 60 * 24 * 365);
					}
				}
			}

			resolve(ipDetails);

		}).catch(function(err) {
			console.log("Error 80342hrf78wgehdf07gds: " + err);

			reject(err);
		});
	});
}

function parseExponentStringDouble(val) {
	var [lead,decimal,pow] = val.toString().split(/e|\./);
	return +pow <= 0 
		? "0." + "0".repeat(Math.abs(pow)-1) + lead + decimal
		: lead + ( +pow >= decimal.length ? (decimal + "0".repeat(+pow-decimal.length)) : (decimal.slice(0,+pow)+"."+decimal.slice(+pow)));
}

function formatLargeNumber(n, decimalPlaces) {
	for (var i = 0; i < exponentScales.length; i++) {
		var item = exponentScales[i];

		var fraction = new Decimal(n / item.val);
		if (fraction >= 1) {
			return [fraction.toDecimalPlaces(decimalPlaces), item];
		}
	}

	return [new Decimal(n).toDecimalPlaces(decimalPlaces), {}];
}

function rgbToHsl(r, g, b) {
    r /= 255, g /= 255, b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, l = (max + min) / 2;

    if(max == min){
        h = s = 0; // achromatic
    }else{
        var d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch(max){
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    return {h:h, s:s, l:l};
}

function colorHexToRgb(hex) {
    // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
    var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, function(m, r, g, b) {
        return r + r + g + g + b + b;
    });

    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

function colorHexToHsl(hex) {
	var rgb = colorHexToRgb(hex);
	return rgbToHsl(rgb.r, rgb.g, rgb.b);
}

function logError(errorId, err, optionalUserData = null) {
	console.log("Error " + errorId + ": " + err + ", json: " + JSON.stringify(err) + (optionalUserData != null ? (", userData: " + optionalUserData) : ""));
}

function buildQrCodeUrls(strings) {
	return new Promise(function(resolve, reject) {
		var promises = [];
		var qrcodeUrls = {};

		for (var i = 0; i < strings.length; i++) {
			promises.push(new Promise(function(resolve2, reject2) {
				buildQrCodeUrl(strings[i], qrcodeUrls).then(function() {
					resolve2();

				}).catch(function(err) {
					reject2(err);
				});
			}));
		}

		Promise.all(promises).then(function(results) {
			resolve(qrcodeUrls);

		}).catch(function(err) {
			reject(err);
		});
	});
}

function buildQrCodeUrl(str, results) {
	return new Promise(function(resolve, reject) {
		qrcode.toDataURL(str, function(err, url) {
			if (err) {
				utils.logError("2q3ur8fhudshfs", err, str);

				reject(err);

				return;
			}

			results[str] = url;

			resolve();
		});
	});
}

function asHash(value) {
	return value.replace(/[^a-f0-9]/gi, "");
}

const fileCache = (cacheDir, cacheName, cacheVersion=1) => {
	const filename = (version) => { return ((version > 1) ? [cacheName, `v${version}`].join("-") : cacheName) + ".json"; };
	const filepath = `${cacheDir}/${filename(cacheVersion)}`;

	if (cacheVersion > 1) {
		// remove old versions
		for (let i = 1; i < cacheVersion; i++) {
			if (fs.existsSync(`${cacheDir}/${filename(i)}`)) {
				fs.unlinkSync(`${cacheDir}/${filename(i)}`);
			}
		}
	}

	return {
		tryLoadJson: () => {
			if (fs.existsSync(filepath)) {
				let rawData = fs.readFileSync(filepath);

				try {
					return JSON.parse(rawData);

				} catch (e) {
					logError("378y43edewe", e);

					fs.unlinkSync(filepath);

					return null;
				}
			}

			return null;
		},
		writeJson: (obj) => {
			if (!fs.existsSync(cacheDir)) {
				fs.mkdirSync(cacheDir);
			}

			fs.writeFileSync(filepath, JSON.stringify(obj, null, 4));
		}
	};
};

const bs58check = require("bs58check");

const xpubPrefixes = new Map([
	['xpub', '0488b21e'],
	['ypub', '049d7cb2'],
	['Ypub', '0295b43f'],
	['zpub', '04b24746'],
	['Zpub', '02aa7ed3'],
	['tpub', '043587cf'],
	['upub', '044a5262'],
	['Upub', '024289ef'],
	['vpub', '045f1cf6'],
	['Vpub', '02575483'],
]);

const bip32TestnetNetwork = {
	messagePrefix: '\x18Bitcoin Signed Message:\n',
	bech32: 'tb',
	bip32: {
		public: 0x043587cf,
		private: 0x04358394,
	},
	pubKeyHash: 0x6f,
	scriptHash: 0xc4,
	wif: 0xEF,
};

// ref: https://github.com/ExodusMovement/xpub-converter/blob/master/src/index.js
function xpubChangeVersionBytes(xpub, targetFormat) {
	if (!xpubPrefixes.has(targetFormat)) {
		throw new Error("Invalid target version");
	}

	// trim whitespace
	xpub = xpub.trim();

	let data = bs58check.decode(xpub);
	data = data.slice(4);
	data = Buffer.concat([Buffer.from(xpubPrefixes.get(targetFormat), 'hex'), data]);

	return bs58check.encode(data);
}

// HD wallet addresses
function bip32Addresses(extPubkey, addressType, account, limit=10, offset=0) {
	let network = null;
	if (!extPubkey.match(/^(xpub|ypub|zpub|Ypub|Zpub).*$/)) {
		network = bip32TestnetNetwork;
	}

	let bip32object = bip32.fromBase58(extPubkey, network);

	let addresses = [];
	for (let i = offset; i < (offset + limit); i++) {
		let bip32Child = bip32object.derive(account).derive(i);
		let publicKey = bip32Child.publicKey;

		if (process.env.BTCEXP_COIN_TYPE != "POS"){
			if (addressType == "p2pkh") {
				addresses.push(bitcoinjs.payments.p2pkh({ pubkey: publicKey, network: network }).address);

			} else if (addressType == "p2sh(p2wpkh)") {
				addresses.push(bitcoinjs.payments.p2sh({ redeem: bitcoinjs.payments.p2wpkh({ pubkey: publicKey, network: network })}).address);

			} else if (addressType == "p2wpkh") {
				addresses.push(bitcoinjs.payments.p2wpkh({ pubkey: publicKey, network: network }).address);

			} else {
				throw new Error(`Unknown address type: "${addressType}" (should be one of ["p2pkh", "p2sh(p2wpkh)", "p2wpkh"])`)
			}
		}
		else{
			let address = bitcoinjs.payments.p2pkh({ pubkey: publicKey, network: network }).address;
			let data = bs58check.decode(address);
			//console.log (data);
			data = data.slice(1);
			//console.log (data);
			data = Buffer.concat([Buffer.from('19', 'hex'), data]);
			address = bs58check.encode(data);
			addresses.push(address);			
		}
	}

	return addresses;
}

module.exports = {
	redirectToConnectPageIfNeeded: redirectToConnectPageIfNeeded,
	hex2ascii: hex2ascii,
	splitArrayIntoChunks: splitArrayIntoChunks,
	getRandomString: getRandomString,
	getCurrencyFormatInfo: getCurrencyFormatInfo,
	formatCurrencyAmount: formatCurrencyAmount,
	formatCurrencyAmountWithForcedDecimalPlaces: formatCurrencyAmountWithForcedDecimalPlaces,
	formatExchangedCurrency: formatExchangedCurrency,
	addThousandsSeparators: addThousandsSeparators,
	formatCurrencyAmountInSmallestUnits: formatCurrencyAmountInSmallestUnits,
	seededRandom: seededRandom,
	seededRandomIntBetween: seededRandomIntBetween,
	logAppStats: logAppStats,
	logMemoryUsage: logMemoryUsage,
	getMinerFromCoinbaseTx: getMinerFromCoinbaseTx,
	getBlockTotalFeesFromCoinbaseTxAndBlockHeight: getBlockTotalFeesFromCoinbaseTxAndBlockHeight,
	refreshExchangeRates: refreshExchangeRates,
	parseExponentStringDouble: parseExponentStringDouble,
	formatLargeNumber: formatLargeNumber,
	geoLocateIpAddresses: geoLocateIpAddresses,
	getTxTotalInputOutputValues: getTxTotalInputOutputValues,
	rgbToHsl: rgbToHsl,
	colorHexToRgb: colorHexToRgb,
	colorHexToHsl: colorHexToHsl,
	logError: logError,
	buildQrCodeUrls: buildQrCodeUrls,
	
	asHash: asHash,
	fileCache: fileCache,
	xpubChangeVersionBytes: xpubChangeVersionBytes,
	bip32Addresses: bip32Addresses,
	bip32TestnetNetwork: bip32TestnetNetwork
};
