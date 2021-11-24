'use strict';

const _ = require('lodash');

const erc20ContractABI = require('../contracts/erc20.json');

module.exports = (web3) => {
    const token_addresses = _.mapValues({
        WMATIC:           '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
        WETH:             '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
        USDT:             '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        USDC:             '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        DAI:              '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
        amWBTC:           '0x5c2ed810328349100A66B82b78a1791B101C9D61',
        amAAVE:           '0x1d2a0E5EC8E5bBDCA5CB219e649B565d8e5c3360',
        amWMATIC:         '0x8dF3aad3a84da6b69A4DA8aeC3eA40d9091B2Ac4',
        amWETH:           '0x28424507fefb6f7f8E9D3860F56504E4e5f5f390',
        amUSDT:           '0x60D55F02A771d515e077c9C2403a1ef324885CeC',
        amUSDC:           '0x1a13F4Ca1d028320A707D99520AbFefca3998b7F',
        amDAI:            '0x27F8D03b3a2196956ED754baDc28D73be8830A6e',
        amVarDebtUSDT:    '0x8038857FD47108A07d1f6Bf652ef1cBeC279A2f3',
        amVarDebtUSDC:    '0x248960A9d75EdFa3de94F7193eae3161Eb349a12',
        amVarDebtDAI:     '0x75c4d1Fb84429023170086f06E682DcbBF537b7d',
        amVarDebtWMATIC:  '0x59e8E9100cbfCBCBAdf86b9279fa61526bBB8765',
        am3CRV:           '0xE7a24EF0C5e95Ffb0f6684b813A78F2a3AD7D171',
        SUSHI:            '0x0b3F868E0BE5597D5DB7fEB59E1CADBb0fdDa50a',
    }, web3.utils.toChecksumAddress);

    // contracts holds a mapping of { token_name: Contract }
    const contracts = _.mapValues(token_addresses, address => new web3.eth.Contract(erc20ContractABI, address));
    // decimals_promise is a mapping of promises { token_name: decimals_promise }
    const decimals_promises = _.mapValues(contracts, tokenContract => tokenContract.methods.decimals().call());
    // fromWei_promises is a mapping of promises { token_name: unit_name_promise }, eg { USDC: promise('finney') }
    // Those unit_names, once resolved, can be used to get the fromWei method to convert to the currency's base unit from its wei
    // ie you can do:
    //    const amount_of_token = some_BN();
    //    const fromWei = await (tokens.fromWei_promises[token]);
    //    const printable_amount = web3.utils.fromWei(amount_of_token, fromWei)
    const fromWei_promises = _.mapValues(decimals_promises, promise => promise.then(decimals => _.findKey(web3.utils.unitMap,
                                                                    (v) => v == (new web3.utils.BN(10).pow(new web3.utils.BN(decimals))).toString()
                                                            )));

    const Transfer_inputs = _.find(erc20ContractABI, { type: 'event', name: 'Transfer' }).inputs;
    const transferEventSignature = web3.eth.abi.encodeEventSignature('Transfer(address,address,uint256)');

    return {
        contracts: contracts,
        addresses: token_addresses,
        decimals_promises: decimals_promises,
        fromWei_promises: fromWei_promises,
        eventSignatures: {
            Transfer: transferEventSignature,
        },
        eventInputs: {
            Transfer: Transfer_inputs,
        },
    };
};
