import { BigNumber, Signer, utils } from "ethers"
import { ChainId, Transaction } from "@biconomy-devx/core-types"
import { MultiChainValidationModule } from "@biconomy-devx/modules/dist/src/MultichainValidationModule"
import { CreateSessionDataParams, DEFAULT_BATCHED_SESSION_ROUTER_MODULE, MultiChainUserOpDto, SessionKeyManagerModule } from "@biconomy-devx/modules"
import { BiconomySmartAccountV2, BiconomySmartAccountV2Config, DEFAULT_ENTRYPOINT_ADDRESS, VoidSigner } from "@biconomy-devx/account"

import fs from 'fs'
import MerkleTree from "merkletreejs"
import { LocalStorage } from "node-localstorage";
import { getUserOpHash } from "@biconomy-devx/common"
import { hexConcat, hexZeroPad, keccak256, parseUnits } from "ethers/lib/utils"

global.localStorage = new LocalStorage('./scratch');

const BATCHED_ROUTER = DEFAULT_BATCHED_SESSION_ROUTER_MODULE

let isDeploy: Boolean;

const paymasterAndData: Record<number, string> = {}
const gasPrices: Record<number, { max: BigNumber, priority: BigNumber }> = {}
const accounts: Record<number, { account: BiconomySmartAccountV2; chainId: number }> = {}
const gasLimits: Record<number, { preVerificationGas: number, callGasLimit: number, verificationGasLimit: number }> = {}

//// REPLACE BELOW VALUES WITH ORIGINAL VALUES ///

gasPrices[42161] = {
  max: parseUnits('0.1', 9), // maxFeePerGas
  priority: BigNumber.from(0) // maxPriorityFeePerGas
}

gasPrices[10] = {
  max: parseUnits('0.1', 9), // maxFeePerGas
  priority: parseUnits('0.1', 9) // maxPriorityFeePerGas
}

gasLimits[42161] = {
  preVerificationGas: 1_000_000, // preVerificationGas
  callGasLimit: 1_000_000, // callGasLimit
  verificationGasLimit: 200_000 // verificationGasLimit
}

gasLimits[10] = {
  preVerificationGas: 1_000_000, // preVerificationGas
  callGasLimit: 1_000_000, // callGasLimit
  verificationGasLimit: 200_000 // verificationGasLimit
}

paymasterAndData[42161] = '0x' // paymasterAndData
paymasterAndData[19] = '0x' // paymasterAndData

isDeploy = true

//// REPLACE ABOVE VALUES WITH ORIGINAL VALUES ///

async function deployData(
  leaves: CreateSessionDataParams[],
  sessionkeyManager: SessionKeyManagerModule,
  multichainModule: MultiChainValidationModule,
  signer: Signer,
  paymasterAndData: Record<number, string>,
  accounts: Record<number, { account: BiconomySmartAccountV2; chainId: number }>,
  gasPrices: Record<number, { max: BigNumber, priority: BigNumber }>,
  gasLimits: Record<number, { preVerificationGas: number, callGasLimit: number, verificationGasLimit: number }>,
) {
  const userOps: MultiChainUserOpDto[] = []

  const params = {
    sessionValidationModule: multichainModule.getAddress(),
    sessionSigner: signer
  }

  for (const acc of Object.values(accounts)) {
    const { account } = acc
    account.setActiveValidationModule(multichainModule)

    const txs: Transaction[] = []


    if (isDeploy) {

      txs.push(await account.getEnableModuleData(BATCHED_ROUTER))
      txs.push(await account.getEnableModuleData(sessionkeyManager.getAddress()))
    }

    const setMerkleRootData = await sessionkeyManager.createSessionData(leaves)

    txs.push({ data: setMerkleRootData.data, to: sessionkeyManager.getAddress() })

    let partialUserOp = await account.buildUserOp(txs, {
      params,
      overrides: {
        preVerificationGas: gasLimits[acc.chainId].preVerificationGas,
        maxFeePerGas: gasPrices[acc.chainId].max,
        maxPriorityFeePerGas: gasPrices[acc.chainId].priority,
        callGasLimit: gasLimits[acc.chainId].callGasLimit,
        verificationGasLimit: gasLimits[acc.chainId].verificationGasLimit,
        paymasterData: paymasterAndData[acc.chainId]
      },
      skipBundlerGasEstimation: true
    })

    userOps.push({ userOp: partialUserOp, chainId: acc.chainId })

    const leaves_ = [];

    for (const multiChainOp of userOps) {
      const leaf = hexConcat([
        hexZeroPad(utils.hexlify((leaves[0]).validUntil), 6),
        hexZeroPad(utils.hexlify((leaves[0]).validAfter), 6),
        hexZeroPad(getUserOpHash(multiChainOp.userOp, DEFAULT_ENTRYPOINT_ADDRESS, multiChainOp.chainId), 32),
      ]);

      leaves_.push(keccak256(leaf))
    }

    const merkleTree = new MerkleTree(leaves_, keccak256, { sortPairs: true });
    return merkleTree.getHexRoot()
  }

}

async function main() {

  const contents = JSON.parse(fs.readFileSync('data.txt').toString().slice(1, -2))

  const signer = new VoidSigner(utils.getAddress(process.argv[2]))

  const multiChainModule = await MultiChainValidationModule.create({
    version: 'V1_0_0',
    signer: signer
  })

  const arbConfig: BiconomySmartAccountV2Config = {
    chainId: ChainId.ARBITRUM_ONE_MAINNET,
    index: 0,
    activeValidationModule: multiChainModule,
    defaultValidationModule: multiChainModule,
    entryPointAddress: DEFAULT_ENTRYPOINT_ADDRESS
  }

  const optConfig: BiconomySmartAccountV2Config = {
    chainId: ChainId.OPTIMISM_MAINNET,
    index: 0,
    activeValidationModule: multiChainModule,
    defaultValidationModule: multiChainModule,
    entryPointAddress: DEFAULT_ENTRYPOINT_ADDRESS
  }

  const swArb = await BiconomySmartAccountV2.create(arbConfig)
  const swOpt = await BiconomySmartAccountV2.create(optConfig)

  const sessionKeyManager = await SessionKeyManagerModule.create({
    smartAccountAddress: await swArb.getAccountAddress()
  })

  accounts[42161] = { account: swArb, chainId: 42161 }
  accounts[10] = { account: swOpt, chainId: 10 }

  const signData = await deployData(contents.leafNodes, sessionKeyManager, multiChainModule, signer, paymasterAndData, accounts, gasPrices, gasLimits)
  console.log('signature payload', signData)
}

main().catch(e => console.error(e))
