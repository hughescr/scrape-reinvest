'use strict';

const { DateTime } = require('luxon');
const { logger } = require('@hughescr/logger');

module.exports = (web3) => {
    const tokens = require('./tokens')(web3);
    const { estimateGas } = require('./estimateGas.js')(web3);

    const quickswapRouterABI = require('../contracts/quickswap/router.json');
    const quickswapRouterAddress = '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506';
    const quickswapRouterContract = new web3.eth.Contract(quickswapRouterABI, quickswapRouterAddress);

    const estimateAmountOut = async (amount_in, token_in, token_out) => await (quickswapRouterContract.methods
                                                    .getAmountsOut(amount_in, [token_in, token_out])
                                                    .call())[1];

    const swapExactTokensForTokens = async (amount_in, min_amount_out, token_in, token_out, pay_to_address) => {
        const gasEstimate = await estimateGas();
        const receipt = quickswapRouterContract.methods
                        .swapExactTokensForTokens(amount_in,
                                                    (new web3.utils.BN(min_amount_out))
                                                        .mul(new web3.utils.BN('995'))
                                                        .div(new web3.utils.BN('1000')),
                                                    [token_in, token_out],
                                                    pay_to_address,
                                                    Math.floor(DateTime.now().plus({ minutes: 1 }).toSeconds())
                                                )
                        .send({ gasPrice: gasEstimate })
            .on('transactionHash', hash => logger.info(`Quickswap swap Tx hash: '${hash}'`));

        logger.info('Quickswap swap receipt');
        logger.info(receipt);
        return undefined;
    };

    return {
        estimateAmountOut: estimateAmountOut,
        swapExactTokensForTokens: swapExactTokensForTokens,
    };
};
