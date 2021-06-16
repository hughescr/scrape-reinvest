'use strict';

const _ = require('lodash');
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

const keychain = require('keychain');
const getPassword = promisify(keychain.getPassword).bind(keychain);

let MY_ACCOUNT_ID;

const WMATIC_TOKEN =        '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270';
const amVarDebtWMATIC_TOKEN =  '0x59e8e9100cbfcbcbadf86b9279fa61526bbb8765';
const WMATIC_ABI = require('./contracts/WMATIC.json');

const aaveRewardEarningTokens = [
    amVarDebtWMATIC_TOKEN,
];

const erc20ContractABI = require('./contracts/erc20.json');
const WMATICContract = new web3.eth.Contract(WMATIC_ABI, WMATIC_TOKEN);
const WMATICDebtContract = new web3.eth.Contract(erc20ContractABI, amVarDebtWMATIC_TOKEN);

const aaveIncentivesControllerABI = require('./contracts/aave-incentives.json');
const aaveIncentivesControllerAddress = '0x357D51124f59836DeD84c8a1730D72B749d8BC23';
const aaveIncentivesControllerContract = new web3.eth.Contract(aaveIncentivesControllerABI, aaveIncentivesControllerAddress);

const aaveLendingPoolAddress = '0x8dff5e27ea6b7ac08ebfdf9eb090f32ee9a30fcf';

const aaveWETHGatewayABI = require('./contracts/aave-weth-gateway.json');
const aaveWETHGatewayAddress = '0xbEadf48d62aCC944a06EEaE0A9054A90E5A7dc97';
const aaveWETHGatewayContract = new web3.eth.Contract(aaveWETHGatewayABI, aaveWETHGatewayAddress);

const claimAave = async (claim = true) => {
    const rewards = await aaveIncentivesControllerContract.methods
                        .getRewardsBalance(aaveRewardEarningTokens, MY_ACCOUNT_ID)
                        .call();
    console.log(`Will claim ${web3.utils.fromWei(rewards)} WMATIC for ${MY_ACCOUNT_ID} from AAVE...`);

    if(claim) {
        return new Promise((resolve, reject) => {
            aaveIncentivesControllerContract.methods
                .claimRewards(aaveRewardEarningTokens, rewards, MY_ACCOUNT_ID)
                .send()
            .on('transactionHash', hash => {
                console.log(`AAVE Tx hash: '${hash}'`);
            })
            .on('confirmation', (number, receipt) => {
                if(number == 0) { console.log(`AAVE confirmation number: ${number}`); }
            })
            .on('receipt', receipt => {
                resolve(rewards);
            })
            .on('error', (err, receipt) => {
                reject(err);
            });
        });
    }

    return rewards;
};

const repayWMATICDebt = async (claim = true) => {
    const WMATIC_amount = await WMATICContract.methods.balanceOf(MY_ACCOUNT_ID).call();
    const WMATIC_decimals = await WMATICContract.methods.decimals().call();
    const WMATIC_fromWei = _.findKey(web3.utils.unitMap,
                            v => v == (new web3.utils.BN(10).pow(new web3.utils.BN(WMATIC_decimals))).toString());
    console.log(`Will repay ${web3.utils.fromWei(WMATIC_amount, WMATIC_fromWei)} WMATIC`);

    if(claim) {
        await new Promise((resolve, reject) => {
            WMATICContract.methods
                .withdraw(WMATIC_amount)
                .send()
            .on('transactionHash', hash => {
                console.log(`WMATIC->MATIC Tx hash: '${hash}'`);
            })
            .on('confirmation', (number, receipt) => {
                if(number == 0) { console.log(`WMATIC->MATIC confirmation number: ${number}`); }
            })
            .on('receipt', receipt => {
                resolve(true);
            })
            .on('error', (err, receipt) => {
                reject(err);
            });
        });
    }

    const WMATIC_debt_amount = await WMATICDebtContract.methods.balanceOf(MY_ACCOUNT_ID).call();
    const WMATIC_debt_decimals = await WMATICDebtContract.methods.decimals().call();
    const WMATIC_debt_fromWei = _.findKey(web3.utils.unitMap,
                            v => v == (new web3.utils.BN(10).pow(new web3.utils.BN(WMATIC_debt_decimals))).toString());
    console.log(`Currently holding ${web3.utils.fromWei(WMATIC_debt_amount, WMATIC_debt_fromWei)} WMATIC debt`);

    if(claim) {
        return new Promise((resolve, reject) => {
            aaveWETHGatewayContract.methods
                .repayETH(aaveLendingPoolAddress, WMATIC_amount, 2, MY_ACCOUNT_ID)
                .send({ value: WMATIC_amount })
            .on('transactionHash', hash => {
                console.log(`AAVE debt repayment Tx hash: '${hash}'`);
            })
            .on('confirmation', (number, receipt) => {
                if(number == 0) { console.log(`AAVE debt repayment confirmation number: ${number}`); }
            })
            .on('receipt', receipt => {
                resolve(true);
            })
            .on('error', (err, receipt) => {
                reject(err);
            });
        });
    }
};

(async () => {
    const WALLET_SECRET_KEY = await getPassword({ account: 'Ethereum', service: 'Ethereum Wallet Private Key' });

    const MY_ACCOUNT = web3.eth.accounts.privateKeyToAccount(WALLET_SECRET_KEY);
    web3.eth.accounts.wallet.add(MY_ACCOUNT);
    MY_ACCOUNT_ID = MY_ACCOUNT.address;

    WMATICContract.options.from = MY_ACCOUNT_ID;
    WMATICContract.options.gasPrice = web3.utils.toWei('1', 'gwei');
    WMATICContract.options.gas = 1000000;
    WMATICDebtContract.options.from = MY_ACCOUNT_ID;
    WMATICDebtContract.options.gasPrice = web3.utils.toWei('1', 'gwei');
    WMATICDebtContract.options.gas = 1000000;
    aaveIncentivesControllerContract.options.from = MY_ACCOUNT_ID;
    aaveIncentivesControllerContract.options.gasPrice = web3.utils.toWei('1', 'gwei');
    aaveIncentivesControllerContract.options.gas = 1000000;
    aaveWETHGatewayContract.options.from = MY_ACCOUNT_ID;
    aaveWETHGatewayContract.options.gasPrice = web3.utils.toWei('1', 'gwei');
    aaveWETHGatewayContract.options.gas = 1000000;

    let wmatic = new web3.utils.BN(await claimAave(nconf.get('x')));

    await repayWMATICDebt(nconf.get('x'));

    process.exit(0);
})();
