Experiments in client-side DeFi scripting
=========================================

This implements some client-side contract calling into DeFi protocols on the Polygon network. Primary purpose is to enable automation of investment strategies in reaction to off-chain events. For example, cron-jobs. Watch an HTTP API and execute trades based on results. That sort of thing, which is harder to embed into an on-chain contract.

Ultimately, this will probably evolve into a combination of on-chain contracts and external scripts which trigger those contracts. The contract will allow atomicity where the external hooks can then do all-or-nothing operations.

How To
------

The script assumes that you have your Polygon private key stored in the Apple keychain (and natch that you're running on macos where such a keychain exists):

- Run "Keychain Access" app on macos
- Get your private key onto the clipboard as a hex string like "`0x12345deadbeef...`", eg by exporting it from Metamask or wherever.
- Create a new generic password entry in Keychain Access.
  - Call it "Ethereum Wallet Private Key"
  - Set its "Account" field to "Ethereum"
  - Paste the secret key as the password
  - Save

Now run the script:

- `yarn`
- `node index.js`

You should see the script ask for your keychain password. Once you provide it, it'll read your secret key and connect to the Polygon network to execute transactions. Without the `-x` flag, it will operate in read-only mode and just check your various balances and say what it would have done. If you run again with `node index.js -x` then it will actually claim rewards from Curve and AAVE, convert those to stablecoin via Sushiswap, and deposit that stablecoin to Curve.
