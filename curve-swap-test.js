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
        describe: 'Execute the withdraw-swap-deposit; without this option, the script will run read-only',
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

const WMATIC_TOKEN =     '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270';
const USDT_TOKEN   =     '0xc2132D05D31c914a87C6611C10748AEb04B58e8F';
const USDC_TOKEN   =     '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const DAI_TOKEN    =     '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063';
const amWBTC_TOKEN =     '0x5c2ed810328349100A66B82b78a1791B101C9D61';
const amAAVE_TOKEN =     '0x1d2a0E5EC8E5bBDCA5CB219e649B565d8e5c3360';
const amWMATIC_TOKEN =   '0x8df3aad3a84da6b69a4da8aec3ea40d9091b2ac4';
const amWETH_TOKEN =     '0x28424507fefb6f7f8e9d3860f56504e4e5f5f390';
const amUSDT_TOKEN =     '0x60D55F02A771d515e077c9C2403a1ef324885CeC';
const amDebtUSDT_TOKEN = '0x8038857fd47108a07d1f6bf652ef1cbec279a2f3';
const curveLP_TOKEN =    '0xE7a24EF0C5e95Ffb0f6684b813A78F2a3AD7D171';

const erc20ContractABI = require('./contracts/erc20.json');
const WMATICContract = new web3.eth.Contract(erc20ContractABI, WMATIC_TOKEN);
const USDTContract = new web3.eth.Contract(erc20ContractABI, USDT_TOKEN);
const USDCContract = new web3.eth.Contract(erc20ContractABI, USDC_TOKEN);
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

const sushiRouterABI = require('./contracts/sushiswap.json');
const sushiRouterAddress = '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506';
const sushiRouterContract = new web3.eth.Contract(sushiRouterABI, sushiRouterAddress);

const swapToStablecoin = async (claim = true) => {
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

    const usdt10k = web3.utils.toWei('10', USDT_fromWei);
    const dai_from_usdt = (await sushiRouterContract.methods
                            .getAmountsOut(
                                           usdt10k,
                                           [USDT_TOKEN, DAI_TOKEN]
                                           ).call())[1];
    console.log(`USDT -> DAI: ${web3.utils.fromWei(dai_from_usdt, DAI_fromWei)}`);

    const dai10k = web3.utils.toWei('10', DAI_fromWei);
    const usdt_from_dai = (await sushiRouterContract.methods
                            .getAmountsOut(
                                           dai10k,
                                           [DAI_TOKEN, USDT_TOKEN]
                                           ).call())[1];
    console.log(`DAI -> USDT: ${web3.utils.fromWei(usdt_from_dai, USDT_fromWei)}`);


    const amount_withdrawn = {};
    const converted_amount = { USDC: {}, USDT: {}, DAI: {} };
    const redeposited_lp = { USDC: {}, USDT: {}, DAI: {} };

    await Promise.all(_.map(currency_token_map, async (token, coin) => {
        const withdraw_one = await curvePoolContract.methods.calc_withdraw_one_coin(web3.utils.toWei('100', lp_fromWei), underlying_coin_indices[coin]).call();
        amount_withdrawn[coin] = new web3.utils.BN(withdraw_one);
        await Promise.all(_.map(currency_token_map, async (token2, coin2) => {
            if(coin == coin2) { return; }
            const amounts = await sushiRouterContract.methods
                                            .getAmountsOut(amount_withdrawn[coin], [token, token2])
                                            .call();
            const amount_out = amounts[1];
            converted_amount[coin][coin2] = new web3.utils.BN(amount_out);
            const currency_in = ['0', '0', '0'];
            currency_in[underlying_coin_indices[coin2]] = converted_amount[coin][coin2].toString();
            const redeposited = await curvePoolContract.methods.calc_token_amount(currency_in, true).call();
            redeposited_lp[coin][coin2] = new web3.utils.BN(redeposited);
            console.log(`${coin} to ${coin2} yields ${web3.utils.fromWei(redeposited_lp[coin][coin2], lp_fromWei)}`);
        }));
    }));

    let highcoin = 'NOPE';
    let highcoin2 = 'NOPE';
    let high_lp = new web3.utils.BN(web3.utils.toWei('100', lp_fromWei));
    _.forEach(redeposited_lp, (lps, coin) => {
        _.forEach(lps, (amount, coin2) => {
            if(coin != coin2 && amount.sub(amount_withdrawn[coin]).gt(high_lp)) {
                highcoin = coin;
                highcoin2 = coin2;
                high_lp = amount.sub(amount_withdrawn[coin]);
            }
        });
    });

    console.log(`Highest is ${highcoin} -> ${highcoin2} yielding ${web3.utils.fromWei(high_lp, lp_fromWei)}`);

    // const deadline = Math.floor(DateTime.now().plus({ minutes: 1 }).toSeconds());
    // if(claim) {
    // }
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
    sushiRouterContract.options.from = MY_ACCOUNT_ID;
    sushiRouterContract.options.gasPrice = web3.utils.toWei('1', 'gwei');
    sushiRouterContract.options.gas = 1000000;
    curvePoolContract.options.from = MY_ACCOUNT_ID;
    curvePoolContract.options.gasPrice = web3.utils.toWei('1', 'gwei');
    curvePoolContract.options.gas = 1000000;

    await swapToStablecoin(nconf.get('x'));

    process.exit(0);
})();
