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
const web3 = new Web3('https://matic-mainnet.chainstacklabs.com');

const keychain = require('keychain');
const getPassword = promisify(keychain.getPassword).bind(keychain);

let MY_ACCOUNT_ID;

const WMATIC_TOKEN =        '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270';
const USDT_TOKEN   =        '0xc2132D05D31c914a87C6611C10748AEb04B58e8F';
const USDC_TOKEN   =        '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const DAI_TOKEN    =        '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063';
const amWBTC_TOKEN =        '0x5c2ed810328349100A66B82b78a1791B101C9D61';
const amAAVE_TOKEN =        '0x1d2a0E5EC8E5bBDCA5CB219e649B565d8e5c3360';
const amWMATIC_TOKEN =      '0x8df3aad3a84da6b69a4da8aec3ea40d9091b2ac4';
const amWETH_TOKEN =        '0x28424507fefb6f7f8e9d3860f56504e4e5f5f390';
const amUSDT_TOKEN =        '0x60D55F02A771d515e077c9C2403a1ef324885CeC';
const amUSDC_TOKEN =        '0x1a13F4Ca1d028320A707D99520AbFefca3998b7F';
const amDAI_TOKEN  =        '0x27F8D03b3a2196956ED754baDc28D73be8830A6e';
const amVarDebtUSDT_TOKEN = '0x8038857fd47108a07d1f6bf652ef1cbec279a2f3';
const amVarDebtUSDC_TOKEN = '0x248960a9d75edfa3de94f7193eae3161eb349a12';
const amVarDebtDAI_TOKEN  = '0x75c4d1Fb84429023170086f06E682DcbBF537b7d';
const curveLP_TOKEN =       '0xE7a24EF0C5e95Ffb0f6684b813A78F2a3AD7D171';

const aaveRewardEarningTokens = [
    amWBTC_TOKEN,
    amAAVE_TOKEN,
    amWMATIC_TOKEN,
    amWETH_TOKEN,
    amUSDT_TOKEN,
    amUSDC_TOKEN,
    amDAI_TOKEN,
    amVarDebtUSDT_TOKEN,
    amVarDebtUSDC_TOKEN,
    amVarDebtDAI_TOKEN,
];

const erc20ContractABI = require('./contracts/erc20.json');
const WMATICContract = new web3.eth.Contract(erc20ContractABI, WMATIC_TOKEN);
const USDTContract = new web3.eth.Contract(erc20ContractABI, USDT_TOKEN);
const USDTDebtContract = new web3.eth.Contract(erc20ContractABI, amVarDebtUSDT_TOKEN);
const USDCContract = new web3.eth.Contract(erc20ContractABI, USDC_TOKEN);
const USDCDebtContract = new web3.eth.Contract(erc20ContractABI, amVarDebtUSDC_TOKEN);
const DAIContract = new web3.eth.Contract(erc20ContractABI, DAI_TOKEN);
const curveLPContract = new web3.eth.Contract(erc20ContractABI, curveLP_TOKEN);

const curveGaugeABI = require('./contracts/curve-gauge.json');
const curveGaugeAddress = '0xe381C25de995d62b453aF8B931aAc84fcCaa7A62';
const curveGaugeContract = new web3.eth.Contract(curveGaugeABI, curveGaugeAddress);

const curvePoolABI = require('./contracts/curve-pool.json');
const curvePoolAddress = '0x445FE580eF8d70FF569aB36e80c647af338db351';
const curvePoolContract = new web3.eth.Contract(curvePoolABI, curvePoolAddress);

const aaveIncentivesControllerABI = require('./contracts/aave-incentives.json');
const aaveIncentivesControllerAddress = '0x357D51124f59836DeD84c8a1730D72B749d8BC23';
const aaveIncentivesControllerContract = new web3.eth.Contract(aaveIncentivesControllerABI, aaveIncentivesControllerAddress);

const aaveLendingPoolABI = require('./contracts/aave-lending-pool.json');
const aaveLendingPoolAddress = '0x8dff5e27ea6b7ac08ebfdf9eb090f32ee9a30fcf';
const aaveLendingPoolContract = new web3.eth.Contract(aaveLendingPoolABI, aaveLendingPoolAddress);

const sushiRouterABI = require('./contracts/sushiswap.json');
const sushiRouterAddress = '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506';
const sushiRouterContract = new web3.eth.Contract(sushiRouterABI, sushiRouterAddress);

const claimCurve = async (claim = true) => {
    const rewards = await curveGaugeContract.methods
                    .claimable_reward(MY_ACCOUNT_ID, WMATIC_TOKEN)
                    .call();
    console.log(`Will claim ${web3.utils.fromWei(rewards)} WMATIC for ${MY_ACCOUNT_ID} from Curve...`);

    if(claim) {
        return new Promise((resolve, reject) => {
            curveGaugeContract.methods
                .claim_rewards()
                .send()
            .on('transactionHash', hash => {
                console.log(`Curve claim Tx hash: '${hash}'`);
            })
            .on('confirmation', (number, receipt) => {
                if(number == 0) { console.log(`Curve claim confirmation number: ${number}`); }
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

const swapToUSDC = async (extra_wmatic, claim = true) => {
    const WMATIC_decimals = await WMATICContract.methods.decimals().call();
    const WMATIC_fromWei = _.findKey(web3.utils.unitMap,
                            v => v == (new web3.utils.BN(10).pow(new web3.utils.BN(WMATIC_decimals))).toString());

    const account_wmatic = await WMATICContract.methods.balanceOf(MY_ACCOUNT_ID).call();
    if(!claim) {
        console.log(`Account has balance of ${web3.utils.fromWei(account_wmatic, WMATIC_fromWei)} WMATIC`);
    }
    const wmatic = claim ? new web3.utils.BN(account_wmatic)
                         : (new web3.utils.BN(account_wmatic)).add(new web3.utils.BN(extra_wmatic));
    console.log(`Total of ${web3.utils.fromWei(wmatic, WMATIC_fromWei)} WMATIC tokens`);

    const USDC_decimals = await USDCContract.methods.decimals().call();
    const USDC_fromWei = _.findKey(web3.utils.unitMap,
                            v => v == (new web3.utils.BN(10).pow(new web3.utils.BN(USDC_decimals))).toString());

    const amount_out = (await sushiRouterContract.methods
                            .getAmountsOut(wmatic, [WMATIC_TOKEN, USDC_TOKEN])
                            .call())[1];
    console.log(`Should yield ${web3.utils.fromWei(amount_out, USDC_fromWei)} USDC`);

    const deadline = Math.floor(DateTime.now().plus({ minutes: 1 }).toSeconds());
    if(claim) {
        return new Promise((resolve, reject) => {
            sushiRouterContract.methods
                .swapExactTokensForTokens(wmatic,
                                            (new web3.utils.BN(amount_out))
                                                .mul(new web3.utils.BN('99'))
                                                .div(new web3.utils.BN('100')),
                                            [WMATIC_TOKEN, USDC_TOKEN],
                                            MY_ACCOUNT_ID,
                                            deadline
                                        )
                .send()
            .on('transactionHash', hash => {
                console.log(`Sushi Tx hash: '${hash}'`);
            })
            .on('confirmation', (number, receipt) => {
                if(number == 0) { console.log(`Sushi confirmation number: ${number}`); }
            })
            .on('receipt', receipt => {
                resolve('USDC');
            })
            .on('error', (err, receipt) => {
                reject(err);
            });
        });
    }
};

const repayUSDCDebt = async (claim = true) => {
    const USDC_amount = await USDCContract.methods.balanceOf(MY_ACCOUNT_ID).call();
    const USDC_decimals = await USDCContract.methods.decimals().call();
    const USDC_fromWei = _.findKey(web3.utils.unitMap,
                            v => v == (new web3.utils.BN(10).pow(new web3.utils.BN(USDC_decimals))).toString());
    console.log(`Currently holding ${web3.utils.fromWei(USDC_amount, USDC_fromWei)} USDC`);

    const USDC_debt_amount = await USDCDebtContract.methods.balanceOf(MY_ACCOUNT_ID).call();
    const USDC_debt_decimals = await USDCDebtContract.methods.decimals().call();
    const USDC_debt_fromWei = _.findKey(web3.utils.unitMap,
                            v => v == (new web3.utils.BN(10).pow(new web3.utils.BN(USDC_debt_decimals))).toString());
    console.log(`Currently holding ${web3.utils.fromWei(USDC_debt_amount, USDC_debt_fromWei)} USDC debt`);

    if(claim) {
        return new Promise((resolve, reject) => {
            aaveLendingPoolContract.methods
                .repay(USDC_TOKEN, USDC_amount, 2, MY_ACCOUNT_ID)
                .send()
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

    curveGaugeContract.options.from = MY_ACCOUNT_ID;
    curveGaugeContract.options.gasPrice = web3.utils.toWei('1', 'gwei');
    curveGaugeContract.options.gas = 1000000;
    aaveIncentivesControllerContract.options.from = MY_ACCOUNT_ID;
    aaveIncentivesControllerContract.options.gasPrice = web3.utils.toWei('1', 'gwei');
    aaveIncentivesControllerContract.options.gas = 1000000;
    aaveLendingPoolContract.options.from = MY_ACCOUNT_ID;
    aaveLendingPoolContract.options.gasPrice = web3.utils.toWei('1', 'gwei');
    aaveLendingPoolContract.options.gas = 1000000;
    sushiRouterContract.options.from = MY_ACCOUNT_ID;
    sushiRouterContract.options.gasPrice = web3.utils.toWei('1', 'gwei');
    sushiRouterContract.options.gas = 1000000;
    curvePoolContract.options.from = MY_ACCOUNT_ID;
    curvePoolContract.options.gasPrice = web3.utils.toWei('1', 'gwei');
    curvePoolContract.options.gas = 1000000;

    let wmatic = new web3.utils.BN(await claimCurve(nconf.get('x')));
    wmatic = wmatic.add(new web3.utils.BN(await claimAave(nconf.get('x'))));

    await swapToUSDC(nconf.get('x') ? '0' : wmatic, nconf.get('x'));
    await repayUSDCDebt(nconf.get('x'));

    process.exit(0);
})();
