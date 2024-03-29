#!/usr/bin/env node

'use strict';

var os = require('os');
var path = require('path');
var dotenv = require("dotenv");
var fs = require('fs');

var configPaths = [ path.join(os.homedir(), '.config', 'skyr-rpc-explorer.env'), path.join(process.cwd(), '.env') ];
configPaths.filter(fs.existsSync).forEach(path => {
	console.log('Loading env file:', path);
	dotenv.config({ path });
});

var express = require('express');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var session = require("express-session");
var csurf = require("csurf");
var config = require("./app/config.js");
var simpleGit = require('simple-git');
var utils = require("./app/utils.js");
var moment = require("moment");
var Decimal = require('decimal.js');
var bitcoinCore = require("bitcoin-core");
var pug = require("pug");
var momentDurationFormat = require("moment-duration-format");
var coins = require("./app/coins.js");
var request = require("request");
var qrcode = require("qrcode");
var electrumApi = require("./app/api/electrumApi.js");
var Influx = require("influx");
var coreApi = require("./app/api/coreApi.js");
var auth = require('./app/auth.js');

var crawlerBotUserAgentStrings = [ "Googlebot", "Bingbot", "Slurp", "DuckDuckBot", "Baiduspider", "YandexBot", "Sogou", "Exabot", "facebot", "ia_archiver" ];

var baseActionsRouter = require('./routes/baseActionsRouter');
var apiActionsRouter = require('./routes/apiRouter.js');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));

// ref: https://blog.stigok.com/post/disable-pug-debug-output-with-expressjs-web-app
app.engine('pug', (path, options, fn) => {
	options.debug = false;
	return pug.__express.call(null, path, options, fn);
});

app.set('view engine', 'pug');

// basic http authentication
if (process.env.BTCEXP_BASIC_AUTH_PASSWORD) {
	app.disable('x-powered-by');
	app.use(auth(process.env.BTCEXP_BASIC_AUTH_PASSWORD));
}

// uncomment after placing your favicon in /public
//app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(session({
	secret: config.cookieSecret,
	resave: false,
	saveUninitialized: false
}));

app.use(express.static(path.join(__dirname, 'public')));

process.on("unhandledRejection", (reason, p) => {
	console.log("Unhandled Rejection at: Promise", p, "reason:", reason, "stack:", (reason != null ? reason.stack : "null"));

	if (global.influxdb) {
		var points = [];
		points.push({
			measurement:`express.unhandled_rejection`,
			tags:{app:("skyr-rpc-explorer." + global.config.coin)},
			fields:{count:1}
		});

		global.influxdb.writePoints(points).catch(err => {
			console.error(`Error saving data to InfluxDB: ${err.stack}`);
		});
	}
});


function logNetworkStats() {
	if (global.influxdb) {
		var promises = [];

		promises.push(coreApi.getMempoolInfo());
		promises.push(coreApi.getMiningInfo());

		promises.push(coreApi.getBlockchainInfo());

		Promise.all(promises).then(function(promiseResults) {
			var mempoolInfo = promiseResults[0];
			var miningInfo = promiseResults[1];
			var blockchainInfo = promiseResults[2];

			//console.log("mempoolInfo: " + JSON.stringify(mempoolInfo));
			//console.log("miningInfo: " + JSON.stringify(miningInfo));
			//console.log("blockchainInfo: " + JSON.stringify(blockchainInfo));

			var points = [];

			var mempoolMapping = {size:"tx_count", bytes:"tx_vsize_total", usage:"total_memory_usage"};
			for (var key in mempoolInfo) {
				try {
					if (mempoolMapping[key]) {
						points.push({measurement:`${global.coinConfig.name.toLowerCase()}.mempool.${mempoolMapping[key]}`, fields:{value:mempoolInfo[key]}});
					}
				} catch(err) {
					console.error(`Error mapping mempool info for key '${key}': ${err.stack}`);
				}
			}

			var miningMapping = {
				difficulty:{
					name:"mining_difficulty",
					transform:function(rawval) {return parseFloat(rawval);}
				},
				networkhashps:{
					name:"networkhashps",
					transform:function(rawval) {return parseFloat(rawval);}
				}
			};

			for (var key in miningInfo) {
				try {
					if (miningMapping[key]) {
						points.push({measurement:`${global.coinConfig.name.toLowerCase()}.mining.${miningMapping[key].name}`, fields:{value:miningMapping[key].transform(miningInfo[key])}});
					}
				} catch(err) {
					console.error(`Error mapping mining info for key '${key}': ${err.stack}`);
				}
			}

			var blockchainMapping = {size_on_disk:"size_on_disk"};
			for (var key in blockchainInfo) {
				try {
					if (blockchainMapping[key]) {
						points.push({measurement:`${global.coinConfig.name.toLowerCase()}.blockchain.${blockchainMapping[key]}`, fields:{value:blockchainInfo[key]}});
					}
				} catch(err) {
					console.error(`Error mapping blockchain info for key '${key}': ${err.stack}`);
				}
			}

			//console.log("Points to send to InfluxDB: " + JSON.stringify(points, null, 4));

			global.influxdb.writePoints(points).catch(err => {
				console.error(`Error saving data to InfluxDB: ${err.stack}`);
			});
		}).catch(err => {
			console.log(`Error logging network stats: ${err}`);
		});
	}
}

function logBlockStats() {
	if (global.influxdb) {
		if (global.blockStatsStatus == null) {
			global.blockStatsStatus = {currentBlock:-1};
		}

		coreApi.getBlockchainInfo().then(function(getblockchaininfo) {
			var blockHeights = [];
			if (getblockchaininfo.blocks) {
				for (var i = 0; i < 5; i++) {
					blockHeights.push(getblockchaininfo.blocks - i);
				}
			}
			
			coreApi.getBlocksByHeight(blockHeights).then(function(blocks) {
				var points = [];

				for (var i = 0; i < blocks.length; i++) {
					var block = blocks[i];

					var totalfees = new Decimal(parseFloat(block.totalFees));
					var blockreward = new Decimal(parseFloat(global.coinConfig.blockRewardFunction(block.height)));
					var timestamp = new Date(block.time * 1000);

					var blockInfo = {
						strippedsize:block.strippedsize,
						size:block.size,
						weight:block.weight,
						version:block.version,
						nonce:block.nonce,
						txcount:block.nTx,
						totalfees:totalfees.toNumber(),
						avgfee:(block.totalFees / block.nTx),
						avgfeeperweight:(block.totalFees / block.weight),
						avgfeepersize:(block.totalFees / block.size),
						avgtxsize:(block.size / block.nTx),
						avgtxweight:(block.weight / block.nTx),
						blockreward:blockreward.toNumber(),
						timemediantimediff:(block.time - block.mediantime),
						witnessdatasize:(block.size - block.strippedsize),
						feeratio:totalfees.dividedBy(totalfees.plus(blockreward)).toNumber()
					};

					for (var key in blockInfo) {
						points.push({measurement:`${global.coinConfig.name.toLowerCase()}.blocks.${key}`, fields:{value:blockInfo[key]}, timestamp:timestamp});
					}

					//console.log("block: " + block.height + ": " + JSON.stringify(blockInfo, null, 4));
					//console.log("points: " + JSON.stringify(points, null, 4));
				}

				global.influxdb.writePoints(points).catch(err => {
					console.error(`Error saving data to InfluxDB: ${err.stack}`);
				});
			});
		}).catch(function(err) {
			console.log(`Error logging block stats: ${err}`);
		});
	}
}

function loadMiningPoolConfigs() {
	global.miningPoolsConfigs = [];

	var miningPoolsConfigDir = path.join(__dirname, "public", "txt", "mining-pools-configs", global.coinConfig.ticker);

	fs.readdir(miningPoolsConfigDir, function(err, files) {
		if (err) {
			return console.log(`Unable to scan directory: ${err}`);
		}

		files.forEach(function(file) {
			var filepath = path.join(miningPoolsConfigDir, file);

			var contents = fs.readFileSync(filepath, 'utf8');

			global.miningPoolsConfigs.push(JSON.parse(contents));
		});
	});

	for (var i = 0; i < global.miningPoolsConfigs.length; i++) {
		for (var x in global.miningPoolsConfigs[i].payout_addresses) {
			if (global.miningPoolsConfigs[i].payout_addresses.hasOwnProperty(x)) {
				global.specialAddresses[x] = {type:"minerPayout", minerInfo:global.miningPoolsConfigs[i].payout_addresses[x]};
			}
		}
	}
}

function getSourcecodeProjectMetadata() {
	var options = {
		url: "https://api.github.com/repos/horizontalsystems/block-explorer",
		headers: {
			'User-Agent': 'request'
		}
	};

	request(options, function(error, response, body) {
		if (error == null && response && response.statusCode && response.statusCode == 200) {
			var responseBody = JSON.parse(body);

			global.sourcecodeProjectMetadata = responseBody;

		} else {
			console.log(`Error 3208fh3ew7eghfg: ${error}, StatusCode: ${response.statusCode}, Response: ${JSON.stringify(response)}`);
		}
	});
}


app.runOnStartup = function() {
	global.config = config;
	global.coinConfig = coins[config.coin];
	global.coinConfigs = coins;

	console.log(`Running RPC Explorer for ${global.coinConfig.name}`);

	var rpcCred = config.credentials.rpc;
	console.log(`Connecting via RPC to node at ${rpcCred.host}:${rpcCred.port}`);

	global.client = new bitcoinCore({
		host: rpcCred.host,
		port: rpcCred.port,
		username: rpcCred.username,
		password: rpcCred.password,
		timeout: 5000
	});

	if (config.credentials.influxdb.active) {
		global.influxdb = new Influx.InfluxDB(config.credentials.influxdb);

		console.log(`Connected to InfluxDB: ${config.credentials.influxdb.host}:${config.credentials.influxdb.port}/${config.credentials.influxdb.database}`);
	}

	coreApi.getNetworkInfo().then(function(getnetworkinfo) {
		console.log(`Connected via RPC to node. Basic info: version=${getnetworkinfo.version}, subversion=${getnetworkinfo.subversion}, protocolversion=${getnetworkinfo.protocolversion}, services=${getnetworkinfo.localservices}`);

		coreApi.getBlockchainInfo().then(function(getblockchaininfo) {
			var blockHeights = [];
			if (getblockchaininfo.blocks) {
				global.activeBlockchain = getblockchaininfo.chain;
			}
		});
			
		if (global.influxdb != null) {
			logNetworkStats();
			setInterval(logNetworkStats, 1 * 60000);

			logBlockStats();
			setInterval(logBlockStats, 5 * 60000);
		}
	}).catch(function(err) {
		console.log("Error 923grf20fge: " + err + ", error json: " + JSON.stringify(err));
	});

	if (config.donations.addresses) {
		var getDonationAddressQrCode = function(coinId) {
			qrcode.toDataURL(config.donations.addresses[coinId].address, function(err, url) {
				global.donationAddressQrCodeUrls[coinId] = url;
			});
		};

		global.donationAddressQrCodeUrls = {};

		config.donations.addresses.coins.forEach(function(item) {
			getDonationAddressQrCode(item);
		});
	}

	global.specialTransactions = {};
	global.specialBlocks = {};
	global.specialAddresses = {};

	if (config.donations.addresses && config.donations.addresses[coinConfig.ticker]) {
		global.specialAddresses[config.donations.addresses[coinConfig.ticker].address] = {type:"donation"};
	}

	if (global.coinConfig.historicalData) {
		global.coinConfig.historicalData.forEach(function(item) {
			if (item.type == "blockheight") {
				global.specialBlocks[item.blockHash] = item;

			} else if (item.type == "tx") {
				global.specialTransactions[item.txid] = item;

			} else if (item.type == "address") {
				global.specialAddresses[item.address] = {type:"fun", addressInfo:item};
			}
		});
	}

	if (config.electrumXServers && config.electrumXServers.length > 0) {
		electrumApi.connectToServers().then(function() {
			console.log("Live with ElectrumX API.");

			global.electrumApi = electrumApi;

		}).catch(function(err) {
			console.log("Error 31207ugf4e0fed: " + err + ", while initializing ElectrumX API");
		});
	}

	loadMiningPoolConfigs();

	if (global.sourcecodeVersion == null && fs.existsSync('.git')) {
		simpleGit(".").log(["-n 1"], function(err, log) {
			if (err) {
				return console.error(`Error accessing git repo: ${err}`);
			}

			global.sourcecodeVersion = log.all[0].hash.substring(0, 10);
			global.sourcecodeDate = log.all[0].date.substring(0, "0000-00-00".length);
		});
	}

	if (config.demoSite) {
		getSourcecodeProjectMetadata();
		setInterval(getSourcecodeProjectMetadata, 3600000);
	}

	if (global.exchangeRates == null) {
		utils.refreshExchangeRates();
	}

	// refresh exchange rate periodically
	setInterval(utils.refreshExchangeRates, 1800000);

	utils.logAppStats();
	setInterval(utils.logAppStats, 5000);

	utils.logMemoryUsage();
	setInterval(utils.logMemoryUsage, 5000);
};

app.use(function(req, res, next) {
	req.startTime = Date.now();
	req.startMem = process.memoryUsage().heapUsed;

	next();
});

app.use(function(req, res, next) {
	// make session available in templates
	res.locals.session = req.session;

	if (config.credentials.rpc && req.session.host == null) {
		req.session.host = config.credentials.rpc.host;
		req.session.port = config.credentials.rpc.port;
		req.session.username = config.credentials.rpc.username;
	}

	var userAgent = req.headers['user-agent'];
	for (var i = 0; i < crawlerBotUserAgentStrings.length; i++) {
		if (userAgent.indexOf(crawlerBotUserAgentStrings[i]) != -1) {
			res.locals.crawlerBot = true;
		}
	}

	res.locals.config = global.config;
	res.locals.coinConfig = global.coinConfig;

	res.locals.host = req.session.host;
	res.locals.port = req.session.port;

	res.locals.genesisBlockHash = coreApi.getGenesisBlockHash();
	res.locals.genesisCoinbaseTransactionId = coreApi.getGenesisCoinbaseTransactionId();


	// currency format type
	if (!req.session.currencyFormatType) {
		var cookieValue = req.cookies['user-setting-currencyFormatType'];

		if (cookieValue) {
			req.session.currencyFormatType = cookieValue;

		} else {
			req.session.currencyFormatType = "";
		}
	}

	// theme
	if (!req.session.uiTheme) {
		var cookieValue = req.cookies['user-setting-uiTheme'];

		if (cookieValue) {
			req.session.uiTheme = cookieValue;

		} else {
			req.session.uiTheme = "";
		}
	}

	// homepage banner
	if (!req.session.hideHomepageBanner) {
		var cookieValue = req.cookies['user-setting-hideHomepageBanner'];

		if (cookieValue) {
			req.session.hideHomepageBanner = cookieValue;

		} else {
			req.session.hideHomepageBanner = "false";
		}
	}

	// electrum trust warnings on address pages
	if (!req.session.hideElectrumTrustWarnings) {
		var cookieValue = req.cookies['user-setting-hideElectrumTrustWarnings'];

		if (cookieValue) {
			req.session.hideElectrumTrustWarnings = cookieValue;

		} else {
			req.session.hideElectrumTrustWarnings = "false";
		}
	}

	res.locals.currencyFormatType = req.session.currencyFormatType;


	if (!["/", "/connect"].includes(req.originalUrl)) {
		if (utils.redirectToConnectPageIfNeeded(req, res)) {
			return;
		}
	}

	if (req.session.userMessage) {
		res.locals.userMessage = req.session.userMessage;

		if (req.session.userMessageType) {
			res.locals.userMessageType = req.session.userMessageType;

		} else {
			res.locals.userMessageType = "warning";
		}

		req.session.userMessage = null;
		req.session.userMessageType = null;
	}

	if (req.session.query) {
		res.locals.query = req.session.query;

		req.session.query = null;
	}

	// make some var available to all request
	// ex: req.cheeseStr = "cheese";

	next();
});

app.use(csurf(), (req, res, next) => {
	res.locals.csrfToken = req.csrfToken();
	next();
});

app.use('/', baseActionsRouter);
app.use('/' + 'api/', apiActionsRouter);


app.use(function(req, res, next) {
	var time = Date.now() - req.startTime;
	var memdiff = process.memoryUsage().heapUsed - req.startMem;

	if (global.influxdb) {
		var points = [];
		points.push({
			measurement:`express.request`,
			tags:{app:("skyr-rpc-explorer." + global.config.coin), host:req.hostname, path:req.path, userAgent:req.headers['user-agent']},
			fields:{count:1, duration:time, memdiff:memdiff}
		});

		global.influxdb.writePoints(points).catch(err => {
			console.error(`Error saving data to InfluxDB: ${err.stack}`);
		});
	}
});

/// catch 404 and forwarding to error handler
app.use(function(req, res, next) {
	var err = new Error('Not Found');
	err.status = 404;
	next(err);
});

/// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
	app.use(function(err, req, res, next) {
		res.status(err.status || 500);
		res.render('error', {
			message: err.message,
			error: err
		});
	});
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
	res.status(err.status || 500);
	res.render('error', {
		message: err.message,
		error: {}
	});
});

app.locals.moment = moment;
app.locals.Decimal = Decimal;
app.locals.utils = utils;



module.exports = app;
