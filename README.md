- clone this repo locally
- run `pnpm i`
- when you get the pop-up for second signature, run following command in browser console :
```
localStorage.getItem("YOUR_SMART_WALLET_ADDRESS".toLowerCase() +  "_sessions")
```
- paste the output of following command in `data.txt`
- go to `index.ts` and replace gas limit, gas price and paymaster data from line 126 to 150
- run `ts-node -r node-localstorage/register index.ts 'YOUR_EOA_ADDRESS' && rm -rf scratch`
