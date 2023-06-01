'use strict';

const { ParaSwap } = require('paraswap');

module.exports = (web3) => {
    const paraswap = new ParaSwap(137, undefined, web3);
    const tokens = require('./tokens')(web3);
    const { estimateGas } = require('./estimateGas.js')(web3);

    const estimateAmountOut = async (amount_in, token_in, token_out) => paraswap.getRate(token_in, token_out, amount_in);

    return {
        estimateAmountOut: estimateAmountOut,
    };
};
