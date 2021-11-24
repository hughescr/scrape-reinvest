'use strict';

const fetch = require('node-fetch');
const { logger } = require('@hughescr/logger');

module.exports = (web3) => {
    const estimateGas = async () => fetch('https://gasstation-mainnet.matic.network')
                                    .then(res => res.json())
                                    .then(json => {
                                        const estimate = web3.utils.toWei(json.standard.toString(), 'gwei');
                                        logger.info(`Gas price: ${web3.utils.fromWei(estimate, 'gwei')} gwei`);
                                        return estimate;
                                    });
    return { estimateGas: estimateGas };
};
