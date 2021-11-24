'use strict';

const _ = require('lodash');
const { DateTime } = require('luxon');
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
const web3 = new Web3('https://rpc-mainnet.matic.network');
const BIG_ZERO = new web3.utils.BN('0');

const keychain = require('keychain');
const getPassword = promisify(keychain.getPassword).bind(keychain);

let MY_ACCOUNT_ID;

const TITAN_TOKEN =           '0xaaa5b9e6c589642f98a1cda99b9d024b8407285a';

const erc20ContractABI = require('./contracts/erc20.json');
const TITANContract = new web3.eth.Contract(erc20ContractABI, TITAN_TOKEN);

(async () => {
    const WALLET_SECRET_KEY = await getPassword({ account: 'Ethereum', service: 'Ethereum Wallet Private Key' });

    const MY_ACCOUNT = web3.eth.accounts.privateKeyToAccount(WALLET_SECRET_KEY);
    web3.eth.accounts.wallet.add(MY_ACCOUNT);
    MY_ACCOUNT_ID = MY_ACCOUNT.address;

    const TITAN_decimals = await TITANContract.methods.decimals().call();
    const TITAN_fromWei = _.findKey(web3.utils.unitMap,
                            v => v == (new web3.utils.BN(10).pow(new web3.utils.BN(TITAN_decimals))).toString());

    const account_titan = await TITANContract.methods.balanceOf('0x1379aaccf761490ceba36b6ec572e5dfca48273a').call();
    const supply_titan = await TITANContract.methods.totalSupply().call();

    console.log(`Account has balance of ${web3.utils.fromWei(account_titan, TITAN_fromWei)} TITAN`);
    console.log(`Total supply of ${web3.utils.fromWei(supply_titan, TITAN_fromWei)} TITAN`);

    process.exit(0);
})();
