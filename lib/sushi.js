'use strict';

const _ = require('lodash');
const { DateTime } = require('luxon');
const { logger } = require('@hughescr/logger');

module.exports = (web3) => {
    const tokens = require('./tokens')(web3);
    const { estimateGas } = require('./estimateGas.js')(web3);

    const sushiRouterABI = require('../contracts/sushi/swap.json');
    const sushiRouterAddress = '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506';
    const sushiRouterContract = new web3.eth.Contract(sushiRouterABI, sushiRouterAddress);

    const sushiRewardsABI = require('../contracts/sushi/rewards.json');
    const sushiRewardsAddress = '0x0769fd68dfb93167989c6f7254cd0d766fb2841f';
    const sushiRewardsContract = new web3.eth.Contract(sushiRewardsABI, sushiRewardsAddress);

    const estimateAmountOut = async (amount_in, token_in, token_out) => await (sushiRouterContract.methods
                                                    .getAmountsOut(amount_in, [token_in, token_out])
                                                    .call())[1];

    const swapExactTokensForTokens = async (amount_in, min_amount_out, token_in, token_out, pay_to_address) => {
        const gasEstimate = await estimateGas();
        const receipt = await sushiRouterContract.methods
                                .swapExactTokensForTokens(amount_in,
                                                            (new web3.utils.BN(min_amount_out))
                                                                .mul(new web3.utils.BN('995'))
                                                                .div(new web3.utils.BN('1000')),
                                                            [token_in, token_out],
                                                            pay_to_address,
                                                            Math.floor(DateTime.now().plus({ minutes: 1 }).toSeconds())
                                                        )
                                .send({ gasPrice: gasEstimate })
                                .on('transactionHash', hash => logger.info(`Sushi swap Tx hash: '${hash}'`));

        logger.info('Sushi swap confirmed');
        logger.info(receipt.events);
        logger.info(receipt.events.Swap.amount1Out);
        return receipt.events;
    };

    const harvestRewards = async (pay_to_address) => {
        const gasEstimate = await estimateGas();
        const receipt = await sushiRewardsContract.methods
                            .harvest('8', pay_to_address)
                            .send({ gasPrice: gasEstimate, from: pay_to_address, gas: 200000 })
                            .on('transactionHash', hash => logger.info(`Sushi harvest Tx hash: '${hash}'`));

        const resultArray = await _(receipt.events)
                                    .filter(x => x && x.raw && x.raw.topics[0] == tokens.eventSignatures.Transfer)
                                    .map(log => {
                                        const params = _.slice(log.raw.topics, 1);
                                        const event = web3.eth.abi.decodeLog(tokens.eventInputs.Transfer, log.raw.data, params);
                                        const token = _.findKey(tokens.addresses, x => x === log.address);
                                        return { token: token, value: event.value };
                                    })
                                    .value();

        await Promise.all(_.map(resultArray, async (result) => {
            const fromWei = await (tokens.fromWei_promises[result.token]);
            const value = result.value;
            logger.info(`Sushi harvested ${web3.utils.fromWei(value, fromWei)} ${result.token}`);
        }));

        return resultArray;
    };

    return {
        estimateAmountOut: estimateAmountOut,
        swapExactTokensForTokens: swapExactTokensForTokens,
        harvestRewards: harvestRewards,
    };
};
