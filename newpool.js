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
const curveLP_TOKEN =       '0x8096ac61db23291252574D49f036f0f9ed8ab390';

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
const USDCContract = new web3.eth.Contract(erc20ContractABI, USDC_TOKEN);
const DAIContract = new web3.eth.Contract(erc20ContractABI, DAI_TOKEN);
const curveLPContract = new web3.eth.Contract(erc20ContractABI, curveLP_TOKEN);

const curvePoolABI = require('./contracts/curve-pool.json');
const curvePoolAddress = '0x751B1e21756bDbc307CBcC5085c042a0e9AaEf36';
const curvePoolContract = new web3.eth.Contract(curvePoolABI, curvePoolAddress);

const aaveIncentivesControllerABI = require('./contracts/aave-incentives.json');
const aaveIncentivesControllerAddress = '0x357D51124f59836DeD84c8a1730D72B749d8BC23';
const aaveIncentivesControllerContract = new web3.eth.Contract(aaveIncentivesControllerABI, aaveIncentivesControllerAddress);

const sushiRouterABI = require('./contracts/sushiswap.json');
const sushiRouterAddress = '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506';
const sushiRouterContract = new web3.eth.Contract(sushiRouterABI, sushiRouterAddress);

const quickswapRouterABI = require('./contracts/quickswap-router.json');
const quickswapRouterAddress = '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff';
const quickswapRouterContract = new web3.eth.Contract(quickswapRouterABI, quickswapRouterAddress);

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

const swapToStablecoin = async (extra_wmatic, claim = true) => {
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

    const USDT_decimals = await USDTContract.methods.decimals().call();
    const USDT_fromWei = _.findKey(web3.utils.unitMap,
                            v => v == (new web3.utils.BN(10).pow(new web3.utils.BN(USDT_decimals))).toString());

    const USDC_decimals = await USDCContract.methods.decimals().call();
    const USDC_fromWei = _.findKey(web3.utils.unitMap,
                            v => v == (new web3.utils.BN(10).pow(new web3.utils.BN(USDC_decimals))).toString());

    const DAI_decimals = await DAIContract.methods.decimals().call();
    const DAI_fromWei = _.findKey(web3.utils.unitMap,
                            v => v == (new web3.utils.BN(10).pow(new web3.utils.BN(DAI_decimals))).toString());

    const lp_decimals = await curveLPContract.methods.decimals().call();
    const lp_fromWei = _.findKey(web3.utils.unitMap,
                            v => v == (new web3.utils.BN(10).pow(new web3.utils.BN(lp_decimals))).toString());

    const coin_indices = _.range(3);
    const underlying_coins = await Promise.all(_.map(coin_indices, i => curvePoolContract.methods.underlying_coins(i).call()));

    const swapRouters = [sushiRouterContract, quickswapRouterContract];
    const swapRouterNames = ['Sushi', 'Quick'];

    const currency_token_map = {
        USDC: USDC_TOKEN,
        USDT: USDT_TOKEN,
        DAI: DAI_TOKEN,
    };

    const currency_contract_map = {
        USDC: USDCContract,
        USDT: USDTContract,
        DAI: DAIContract,
    };

    const currency_fromWei_map = {
        USDC: USDC_fromWei,
        USDT: USDT_fromWei,
        DAI: DAI_fromWei,
    };

    const underlying_coin_indices = _.mapValues(currency_token_map, c => _.findIndex(underlying_coins, x => x == c));

    const amount_out = [{}, {}];
    const amount_out_lp = [{}, {}];

    await Promise.all(_.flatMap(swapRouters, (router, routerIndex) => _.map(currency_token_map, async (token, coin) => {
        amount_out[routerIndex][coin] = (await router.methods
                                                .getAmountsOut(wmatic, [WMATIC_TOKEN, token])
                                                .call())[1];
        const currency_in = ['0', '0', '0'];
        currency_in[underlying_coin_indices[coin]] = amount_out[routerIndex][coin];
        amount_out_lp[routerIndex][coin] = new web3.utils.BN(await curvePoolContract.methods.calc_token_amount(currency_in, true).call());
        console.log(`Should yield ${web3.utils.fromWei(amount_out_lp[routerIndex][coin], lp_fromWei)} tokens (${web3.utils.fromWei(amount_out[routerIndex][coin], currency_fromWei_map[coin])} ${coin}) from ${swapRouterNames[routerIndex]}`);
    })));

    const highest = _.reduce(amount_out_lp, (max, lp_map, routerIndex) => {
        const highestThisRouter = _.reduce(lp_map, (max2, lp, coin) => {
            return (lp.gt(max2.lp) ? { coin: coin, lp: lp } : max2);
        }, { lp: BIG_ZERO });
        console.log(`Highest for ${swapRouterNames[routerIndex]} is ${highestThisRouter.coin}`);
        return highestThisRouter.lp.gt(max.lp) ? { routerIndex: routerIndex, coin: highestThisRouter.coin, lp: highestThisRouter.lp } : max;
    }, { lp: BIG_ZERO });
    console.log(`Highest is ${highest.coin} from ${swapRouterNames[highest.routerIndex]}`);

    const deadline = Math.floor(DateTime.now().plus({ minutes: 1 }).toSeconds());
    if(claim) {
        return new Promise((resolve, reject) => {
            swapRouters[highest.routerIndex].methods
                .swapExactTokensForTokens(wmatic,
                                            (new web3.utils.BN(amount_out[highest.coin]))
                                                .mul(new web3.utils.BN('995'))
                                                .div(new web3.utils.BN('1000')),
                                            [WMATIC_TOKEN, currency_token_map[highest.coin]],
                                            MY_ACCOUNT_ID,
                                            deadline
                                        )
                .send()
            .on('transactionHash', hash => {
                console.log(`${swapRouterNames[highest.routerIndex]} Tx hash: '${hash}'`);
            })
            .on('confirmation', (number, receipt) => {
                if(number == 0) { console.log(`${swapRouterNames[highest.routerIndex]} confirmation number: ${number}`); }
            })
            .on('receipt', receipt => {
                resolve(highest.coin);
            })
            .on('error', (err, receipt) => {
                reject(err);
            });
        });
    }
};

const depositToCurve = async (claim = true) => {
    const USDT_decimals = await USDTContract.methods.decimals().call();
    const USDT_fromWei = _.findKey(web3.utils.unitMap,
                            v => v == (new web3.utils.BN(10).pow(new web3.utils.BN(USDT_decimals))).toString());

    const USDC_decimals = await USDCContract.methods.decimals().call();
    const USDC_fromWei = _.findKey(web3.utils.unitMap,
                            v => v == (new web3.utils.BN(10).pow(new web3.utils.BN(USDC_decimals))).toString());

    const DAI_decimals = await DAIContract.methods.decimals().call();
    const DAI_fromWei = _.findKey(web3.utils.unitMap,
                            v => v == (new web3.utils.BN(10).pow(new web3.utils.BN(DAI_decimals))).toString());

    const lp_decimals = await curveLPContract.methods.decimals().call();
    const lp_fromWei = _.findKey(web3.utils.unitMap,
                            v => v == (new web3.utils.BN(10).pow(new web3.utils.BN(lp_decimals))).toString());

    const coin_indices = _.range(3);
    const underlying_coins = await Promise.all(_.map(coin_indices, i => curvePoolContract.methods.underlying_coins(i).call()));

    const currency_token_map = {
        USDC: USDC_TOKEN,
        USDT: USDT_TOKEN,
        DAI: DAI_TOKEN,
    };

    const currency_contract_map = {
        USDC: USDCContract,
        USDT: USDTContract,
        DAI: DAIContract,
    };

    const currency_fromWei_map = {
        USDC: USDC_fromWei,
        USDT: USDT_fromWei,
        DAI: DAI_fromWei,
    };

    const underlying_coin_indices = _.mapValues(currency_token_map, c => _.findIndex(underlying_coins, x => x == c));
    const index_to_coin = _.invert(underlying_coin_indices);

    const account_amounts = {};
    await Promise.all(_.map(currency_contract_map, async (contract, coin) => {
        account_amounts[coin] = await contract.methods.balanceOf(MY_ACCOUNT_ID).call();
        console.log(`Account has balance of ${web3.utils.fromWei(account_amounts[coin], currency_fromWei_map[coin])} ${coin}`);
    }));

    const all_three_coins = [
                                account_amounts[index_to_coin[0]],
                                account_amounts[index_to_coin[1]],
                                account_amounts[index_to_coin[2]],
                            ];

    const lpAmount = await curvePoolContract.methods.calc_token_amount(all_three_coins, true).call();

    console.log(`Expect to get ${web3.utils.fromWei(lpAmount, lp_fromWei)} total LP tokens`);

    if(claim) {
        return new Promise((resolve, reject) => {
            curvePoolContract.methods
                .add_liquidity(all_three_coins,
                               (new web3.utils.BN(lpAmount))
                                .mul(new web3.utils.BN('995'))
                                .div(new web3.utils.BN('1000')),
                               true
                            )
                .send()
            .on('transactionHash', hash => {
                console.log(`Curve deposit Tx hash: '${hash}'`);
            })
            .on('confirmation', (number, receipt) => {
                if(number == 0) { console.log(`Curve deposit confirmation number: ${number}`); }
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

    aaveIncentivesControllerContract.options.from = MY_ACCOUNT_ID;
    aaveIncentivesControllerContract.options.gasPrice = web3.utils.toWei('1', 'gwei');
    aaveIncentivesControllerContract.options.gas = 1000000;
    sushiRouterContract.options.from = MY_ACCOUNT_ID;
    sushiRouterContract.options.gasPrice = web3.utils.toWei('1', 'gwei');
    sushiRouterContract.options.gas = 1000000;
    quickswapRouterContract.options.from = MY_ACCOUNT_ID;
    quickswapRouterContract.options.gasPrice = web3.utils.toWei('1', 'gwei');
    quickswapRouterContract.options.gas = 1000000;
    curvePoolContract.options.from = MY_ACCOUNT_ID;
    curvePoolContract.options.gasPrice = web3.utils.toWei('1', 'gwei');
    curvePoolContract.options.gas = 1000000;

    let wmatic = new web3.utils.BN(await claimAave(nconf.get('x')));

    await swapToStablecoin(nconf.get('x') ? '0' : wmatic, nconf.get('x'));
    await depositToCurve(nconf.get('x'));

    process.exit(0);
})();
