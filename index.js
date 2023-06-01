'use strict';

const { logger } = require('@hughescr/logger');
const { promisify } = require('util');

const nconf = require('nconf');

const yargs = require('yargs')
.version()
.strict()
.usage('$0 [-x]')
.options({
    x : {
        alias: 'execute',
        describe: 'Execute the withdrawls of accumulated rewards; without this option, the script will run read-only',
        type: 'boolean',
        'default': false,
    }
})
.help();

nconf.argv(yargs)
    .env()
    .file({ file: 'scrape-reinvest.json ' });

const Web3 = require('web3');
const web3 = new Web3('https://polygon-rpc.com/');

const keychain = require('keychain');
const getPassword = promisify(keychain.getPassword).bind(keychain);

let MY_ACCOUNT_ID;

(async () => {
    const WALLET_SECRET_KEY = await getPassword({ account: 'Ethereum', service: 'Ethereum Wallet Private Key' });

    const MY_ACCOUNT = web3.eth.accounts.privateKeyToAccount(WALLET_SECRET_KEY);
    web3.eth.accounts.wallet.add(MY_ACCOUNT);
    MY_ACCOUNT_ID = MY_ACCOUNT.address;

    const paraswap = require('./lib/paraswap')(web3);
    const tokens = require('./lib/tokens')(web3);

    const fromWeiWMATIC = await (tokens.fromWei_promises.WMATIC);
    const one_wmatic_amount = web3.utils.toWei('1000', fromWeiWMATIC);
    const fromWeiWETH = await (tokens.fromWei_promises.WETH);
    const price = await paraswap.estimateAmountOut(one_wmatic_amount, tokens.addresses.WMATIC, tokens.addresses.WETH);
    logger.info(`Best price is ${web3.utils.fromWei(price.destAmount, fromWeiWETH)} WETH`);
    logger.info(`Source USD:  $${price.srcUSD}`);
    logger.info(`Dest   USD:  $${price.destUSD}`);

    process.exit(0);
})();
