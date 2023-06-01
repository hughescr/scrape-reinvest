'use strict';

const { promisify } = require('util');
const { logger } = require('@hughescr/logger');

const nconf = require('nconf');

const yargs = require('yargs')
.version()
.strict()
.usage('$0 [-x]')
.options({
    x : {
        alias: 'execute',
        describe: 'Execute the withdrawls, convertions, deposits, etc; without this option, the script will run read-only and not change any state',
        type: 'boolean',
        'default': false,
    }
})
.help();

nconf.argv(yargs)
    .env()
    .file({ file: 'scrape-reinvest.json ' });

const Web3 = require('web3');
const polygon = new Web3('https://rpc-mainnet.matic.network');
const BIG_ZERO = new polygon.utils.BN('0');

const tokens = require('./lib/tokens')(polygon);
const sushi = require('./lib/sushi')(polygon);
const quickswap = require('./lib/quickswap')(polygon);

const harvestSushiRewards = async (account, execute = true) => {
    if(!execute) {
        return { SUSHI: BIG_ZERO, WMATIC: BIG_ZERO };
    }

    return sushi.harvestRewards(account);
};

const convertRewardstoPoolTokens = async (amounts, execute = true) => {
    if(!execute) {
        return ({ USDC: BIG_ZERO, USDT: BIG_ZERO });
    }

};

const depositUSDCandUSDTtoSUSHILP = async (amounts, execute = true) => ({ LP: BIG_ZERO });

const stakeSUSHILP = async (execute = true) => {};

(async () => {
    const { MY_ACCOUNT_ID } = await (require('./lib/my_account')(polygon));

    logger.info(`My account: ${MY_ACCOUNT_ID}`);
    const rewards = await harvestSushiRewards(MY_ACCOUNT_ID, nconf.get('x'));
    const converted = await convertRewardstoPoolTokens(rewards, nconf.get('x'));
    // const deposit = await depositUSDCandUSDTtoSUSHILP(converted, nconf.get('x'));
    // await stakeSUSHILP(nconf.get('x'));

    process.exit(0);
})();
