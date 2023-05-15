### Setup of http://explorer.skynet-coin.com on Ubuntu 16.04

    apt update
    apt upgrade
    apt install git python-software-properties software-properties-common nginx gcc g++ make
    curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.11/install.sh | bash
    nvm install 10.14.1 ## LTS release of NodeJS as of 2018-11-29, via https://nodejs.org/en/
    npm install pm2 --global
    add-apt-repository ppa:certbot/certbot
    apt update
    apt upgrade
    apt install python-certbot-nginx
    
Copy content from [./btc-explorer.com.conf](./btc-explorer.com.conf) into `/etc/nginx/sites-available/btc-explorer.com.conf`

    certbot --nginx -d btc-explorer.com
    cd /etc/ssl/certs
    openssl dhparam -out dhparam.pem 4096
    cd /home/bitcoin
    git clone https://github.com/SkynetResearchProject/horizontalsystems-block-explorer.git
    cd /home/bitcoin/btc-rpc-explorer
    npm install
    npm run build
    pm2 start bin/www --name "btc-rpc-explorer"

	
	
	
	New install
    -----------------------------------------------------------------------------------------	
    apt update
    apt upgrade
    apt install git python-software-properties software-properties-common nginx gcc g++ make
	
	wget https://nodejs.org/dist/v16.19.1/node-v16.19.1-linux-x64.tar.xz
	tar -xvf node-v16.19.1-linux-x64.tar.xz
	mv node-v16.19.1-linux-x64 node

    //it is install
    sudo mv node /usr/local
    sudo ln -s /usr/local/node/bin/node /usr/bin/node
    sudo ln -s /usr/local/node/bin/npm /usr/bin/npm
    sudo ln -s /usr/local/node/bin/npx /usr/bin/npx
	
	node -v
	npm -v
	
	git clone https://github.com/SkynetResearchProject/horizontalsystems-block-explorer.git
		(or
			wget https://github.com/SkynetResearchProject/horizontalsystems-block-explorer/archive/refs/heads/main.zip]
			apt install unzip
			unzip main.zip
		)
	
	cd horizontalsystems-block-explorer
	npm install

	npm install pm2 --global

	#output:
		/usr/local/node/bin/pm2 -> /usr/local/node/lib/node_modules/pm2/bin/pm2
		/usr/local/node/bin/pm2-dev -> /usr/local/node/lib/node_modules/pm2/bin/pm2-dev
		/usr/local/node/bin/pm2-docker -> /usr/local/node/lib/node_modules/pm2/bin/pm2-docker
		/usr/local/node/bin/pm2-runtime -> /usr/local/node/lib/node_modules/pm2/bin/pm2-runtime
		npm WARN optional SKIPPING OPTIONAL DEPENDENCY: fsevents@~2.3.2 (node_modules/pm2/node_modules/chokidar/node_modules/fsevents):
		npm WARN notsup SKIPPING OPTIONAL DEPENDENCY: Unsupported platform for fsevents@2.3.2: wanted {"os":"darwin","arch":"any"} (current: {"os":"linux","arch":"x64"})

		+ pm2@5.3.0

	(need to make new ln)


	
	#for sert
	add-apt-repository ppa:certbot/certbot
    apt update
    apt upgrade
    apt install python-certbot-nginx

    #install your sert files and start(restart) nginx
	mv /etc/nginx/sites-available/node.conf /etc/nginx/sites-available/node_0.conf 
	Copy content from [./btc-explorer.com.conf](./btc-explorer.com.conf) into `/etc/nginx/sites-available/node.conf`		
	
	
    #start:
	
    /usr/local/node/bin/pm2 start bin/www --name "btc-rpc-explorer"
	
	service nginx start                 # or  service nginx restart

	#stop:
	
	/usr/local/node/bin/pm2 stop bin/www --name "btc-rpc-explorer"
	
	service nginx stop