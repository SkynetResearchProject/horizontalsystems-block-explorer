# BTC RPC Explorer

[![npm version][npm-ver-img]][npm-ver-url] [![NPM downloads][npm-dl-img]][npm-dl-url]


Simple, database-free Bitcoin, Skyrcoin or Pivx blockchain explorer, via RPC. Built with Node.js, express, bootstrap-v4.

This tool is intended to be a simple, self-hosted explorer for the Bitcoin, Skyrcoin or Pivx blockchain, driven by RPC calls to your own bitcoind node. This tool is easy to run but currently lacks features compared to database-backed explorers.

I built this tool because I wanted to use it myself. Whatever reasons one might have for running a full node (trustlessness, technical curiosity, supporting the network, etc) it's helpful to appreciate the "fullness" of your node. With this explorer, you can not only explore the blockchain (in the traditional sense of the term "explorer"), but also explore the functional capabilities of your own node.

Live demos are available at:

* SKYR: https://explorer.skynet-coin.com

Live demos with new version are available at:

* BTC: https://bitcoinexplorer.org

# Features

* Browse blocks
* View block details
* View transaction details, with navigation "backward" via spent transaction outputs
* View JSON content used to generate most pages
* Search by transaction ID, block hash/height, and address
* Optional transaction history for addresses by querying configurable ElectrumX servers
* Mempool summary, with fee, size, and age breakdowns
* RPC command browser and terminal
* Currently supports BTC, LTC (support for any Bitcoin-RPC-protocol-compliant coin can be added easily)

# Getting started

The below instructions are geared toward BTC, but can be adapted easily to other coins.

## Prerequisites

1. Install and run a full, archiving node - [instructions](https://bitcoin.org/en/full-node). Ensure that your bitcoin node has full transaction indexing enabled (`txindex=1`) and the RPC server enabled (`server=1`).
2. Synchronize your node with the Bitcoin network.
3. "Recent" version of Node.js (8+ recommended). For nodejs v16.19.1 ready.

## Instructions

cd ~
sudo git clone https://github.com/SkynetResearchProject/horizontalsystems-block-explorer.git
cd horizontalsystems-block-explorer

Copy file .env-sample to .env .
Change login and passvord (from coin.conf for your coin node) in file .env .
Change BTCEXP_COIN_TYPE = POS on BTCEXP_COIN_TYPE = POW for POW-coins: btc, ltc or etc.

#for local installation:

npm install --production

sudo ln -s ~/horizontalsystems-block-explorer/bin/cli.js /usr/local/bin/skyr-rpc-explorer 

#start explorer:
npm start

#or
skyr-rpc-explorer

Install pm2 for start and continuous working on vps-server.

If you're running on mainnet with the default datadir and port, this Should Just Work.
Open [http://127.0.0.1:3002/](http://127.0.0.1:3002/) to view the explorer.

You may set configuration options in a `.env` file or using CLI args.
See [configuration](#configuration) for details.

### Configuration

Configuration options may be passed as environment variables
or by creating an env file at `~/.config/skyr-rpc-explorer.env`  (it's work)
or at `.env` in the working directory.
See [.env-sample](.env-sample) for a list of the options and details for formatting `.env`.

#You may also pass options as CLI arguments, for example, for bitcoin:

#node skyr-rpc-explorer --port 8080 --bitcoind-port 18443 --bitcoind-cookie ~/.bitcoin/regtest/.cookie

#file .env, BTCEXP_BITCOIND_COOKIE=~/.skyrcoin/.cookie
#node skyr-rpc-explorer --port 3002 --bitcoind-port 18690 --bitcoind-cookie ~/.skyrcoin/.cookie

See `skyr-rpc-explorer --help` for the full list of CLI options.

## Run via Docker (?)

1. `docker build -t skyr-rpc-explorer .`
2. `docker run -p 3002:3002 -it skyr-rpc-explorer`


