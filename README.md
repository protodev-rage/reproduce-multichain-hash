1. **Clone the Repository:**
   - Clone the repository locally.

     ```bash
     git clone [repository_url]
     cd [repository_directory]
     ```

2. **Install Dependencies:**
   - Run the following command to install project dependencies using pnpm.

     ```bash
     pnpm i
     ```

3. **Create Smart Wallet Session:**
   - Open the smart wallet application.
   - Sign in and create a session.
   - Sign the first popup to set up a JWT token on the gas tank server.
   - Sign the second popup for session setup.

4. **Retrieve Public Session Data:**
   - In the browser console, execute the following command:

     ```javascript
     localStorage.getItem("YOUR_SMART_WALLET_ADDRESS".toLowerCase() + "_sessions")
     ```

   - Copy the output (public session data) and save it in a file named `data.txt`.

5. **Get Gas Tank Transaction Details:**
   - Go to the gas tank history and find the URLs for the latest two debit transactions.
   - Open each transaction on the network explorer.
   - Click "click to see more" and then "decode input data."
   - Retrieve the values for `callGasLimit`, `verificationGasLimit`, `maxFeePerGas`, `maxPriorityFeePerGas`, and `paymasterAndData`.

6. **Update Index.ts:**
   - Open the `index.ts` file.
   - Locate lines 127 to 152 and replace the values with the ones you obtained in the previous step.

7. **Run the Script:**
   - Execute the following command in the terminal:

     ```bash
     ts-node -r node-localstorage/register index.ts 'YOUR_EOA_ADDRESS' && rm -rf scratch
     ```

   Replace `'YOUR_EOA_ADDRESS'` with your Ethereum address.
