'use strict';

const { inspect, promisify } = require('util');

const keychain = require('keychain');
const getPassword = promisify(keychain.getPassword).bind(keychain);

module.exports = (async (web3) => {
    const WALLET_SECRET_KEY = await getPassword({ account: 'Ethereum', service: 'Ethereum Wallet Private Key' });

    const MY_ACCOUNT = web3.eth.accounts.privateKeyToAccount(WALLET_SECRET_KEY);
    web3.eth.accounts.wallet.add(MY_ACCOUNT);
    return { MY_ACCOUNT_ID : MY_ACCOUNT.address };
});
