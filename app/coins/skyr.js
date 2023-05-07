var Decimal = require("decimal.js");
Decimal8 = Decimal.clone({ precision:8, rounding:8 });

var currencyUnits = [
	{
		type:"native",
		name:"SKYR",
		multiplier:1,
		default:true,
		values:["", "skyr", "SKYR"],
		decimalPlaces:8
	},
	{
		type:"native",
		name:"mSKYR",
		multiplier:1000,
		values:["mskyr"],
		decimalPlaces:5
	},
	{
		type:"native",
		name:"bits",
		multiplier:1000000,
		values:["bits"],
		decimalPlaces:2
	},
	{
		type:"native",
		name:"sat",
		multiplier:100000000,
		values:["sat", "satoshi"],
		decimalPlaces:0
	},
	{
		type:"exchanged",
		name:"USD",
		multiplier:"usd",
		values:["usd"],
		decimalPlaces:2,
		symbol:"$"
	},
	{
		type:"exchanged",
		name:"EUR",
		multiplier:"eur",
		values:["eur"],
		decimalPlaces:2,
		symbol:"€"
	},
];

module.exports = {
	name:"SkynetResearch",
	ticker:"SKYR",
	logoUrl:"/img/logo/skyr.png",
	siteTitle:"SkynetResearch Explorer",
	siteDescriptionHtml:"<b>SkynetResearch Explorer</b> is <a href='https://github.com/skynetResearchProject/horizontalsystems-block-explorer). If you run your own [SkynetResearch Full Node](https://sexplorer.kynet-coin.com), **SKYR Explorer** can easily run alongside it, communicating via RPC calls. See the project [ReadMe](https://github.com/skynetResearchProject/horizontalsystems-block-explorer) for a list of features and instructions for running.",
	nodeTitle:"SkynetResearch Full Node",
	nodeUrl:"https://sexplorer.kynet-coin.com",
	demoSiteUrl: "",
	miningPoolsConfigUrls:[],
	maxBlockWeight: 10000000000,
	targetBlockTimeSeconds: 60,
	currencyUnits:currencyUnits,
	currencyUnitsByName:{"SKYR":currencyUnits[0], "mSKYR":currencyUnits[1], "bits":currencyUnits[2], "sat":currencyUnits[3]},
	baseCurrencyUnit:currencyUnits[3],
	defaultCurrencyUnit:currencyUnits[0],
	feeSatoshiPerByteBucketMaxima: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 50, 75, 100, 150],
	genesisBlockHash: "0000067136024464e0622d0ffdac12d98e14a36e78ad27323c3f5c2c98854a75",
	genesisCoinbaseTransactionId: "dc83aa655857885fd62ea0df12b48d65de1b0f88e11764763c157dc94dc7d878",
	genesisCoinbaseTransaction: {
  "hex": "01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff5004ffff001d0104484e657720626c6f636b636861696e2069732070726573656e74656420666f7220737761702e2054696d657374616d702e20323032322d30312d33312e31373a32373a303820474d54ffffffff010000000000000000434104cc00d92924dcaf49e3bc507535a60b4596b0f589d32a7b49868754a812653c8abcdeadcb907bff04dd8e4f690f98b98f0c9df02cee2e1f35342ca6fa791efa61ac00000000",
  "txid": "dc83aa655857885fd62ea0df12b48d65de1b0f88e11764763c157dc94dc7d878",
  "hash": "dc83aa655857885fd62ea0df12b48d65de1b0f88e11764763c157dc94dc7d878",
  "version": 1,
  "size": 207,
  "locktime": 0,
  "confirmations": 608060,
  "vin": [
    {
      "coinbase": "04ffff001d0104484e657720626c6f636b636861696e2069732070726573656e74656420666f7220737761702e2054696d657374616d702e20323032322d30312d33312e31373a32373a303820474d54",
      "sequence": 4294967295
    }
  ],
  "vout": [
    {
      "value": 0.00,
      "n": 0,
      "scriptPubKey": {
        "asm": "04cc00d92924dcaf49e3bc507535a60b4596b0f589d32a7b49868754a812653c8abcdeadcb907bff04dd8e4f690f98b98f0c9df02cee2e1f35342ca6fa791efa61 OP_CHECKSIG",
        "hex": "4104cc00d92924dcaf49e3bc507535a60b4596b0f589d32a7b49868754a812653c8abcdeadcb907bff04dd8e4f690f98b98f0c9df02cee2e1f35342ca6fa791efa61ac",
        "reqSigs": 1,
        "type": "pubkey",
        "addresses": [
          "BNMKUGCD991nz4uWdNF9FS9Qfaeh8JMgE4"
        ]
      }
    }
  ],
	  	"blockhash": "0000067136024464e0622d0ffdac12d98e14a36e78ad27323c3f5c2c98854a75",
		"time": 1643650028,
		"blocktime": 1643650028
	},
	genesisCoinbaseOutputAddressScripthash:"8b01df4e368ea28f8dc0423bcf7a4923e3a12d307c875e47a0cfbf90b5c39161",
	historicalData: [],
	exchangeRateData:{
		jsonUrl:"https://api.coindesk.com/v1/bpi/currentprice.json",
		responseBodySelectorFunction:function(responseBody) {
			//console.log("Exchange Rate Response: " + JSON.stringify(responseBody));

			var exchangedCurrencies = ["USD", "GBP", "EUR"];

			if (responseBody.bpi) {
				var exchangeRates = {};

				for (var i = 0; i < exchangedCurrencies.length; i++) {
					if (responseBody.bpi[exchangedCurrencies[i]]) {
						exchangeRates[exchangedCurrencies[i].toLowerCase()] = responseBody.bpi[exchangedCurrencies[i]].rate_float;
					}
				}

				return exchangeRates;
			}

			return null;
		}
	},
	blockRewardFunction:function(blockHeight) {
        var reward = 0
		if (blockHeight==1){
		    reward = 15000000
		}
		else if (blockHeight<100001){
			reward = 5
		}
		else if (blockHeight<200001){
			reward = 4
		}
		else if (blockHeight<300001){
			reward = 3
		}
		else if (blockHeight<400001){
			reward = 2
		}
		else if (blockHeight<500001){
			reward = 2
		}
		else if (blockHeight<600001){
			reward = 1
		}
		else if (blockHeight>600000){
			reward = 0.5
		}

		return reward;
	}
};
