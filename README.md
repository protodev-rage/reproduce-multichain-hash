- clone this repo locally
- run `pnpm i`
- create a session on your smart wallet
- sign the first popup (this signs plaintext which is visible in metamask popup, used to setup JWT token on gas tank server)
- sign the pop-up for second signature (this will be validated using the steps below)
- Retrieve the public session data (this contains information about the validation modules to enable only specific set of transactions with session key) with the following command in browser console :
```
localStorage.getItem("YOUR_SMART_WALLET_ADDRESS".toLowerCase() +  "_sessions")
```
- paste the output (public session data) of previous command in `data.txt`
- go to gas tank history and click on the url for the latest 2 debit transaction (this transaction setup the session) it will open up the transaction on network explorer
- click on "click to see more" and then click on "decode input data" and pick up values of (callGasLimit, verificationGasLimit, maxFeePerGas, maxPriorityFeePerGas, paymasterAndData)
- go to `index.ts` and replace the above values (total 10) for both the chains in line 126 to 150
- run `ts-node -r node-localstorage/register index.ts 'YOUR_EOA_ADDRESS' && rm -rf scratch`
