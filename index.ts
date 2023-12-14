import { BigNumber, Signer, providers, utils } from "ethers"
import { ChainId, Transaction } from "@biconomy-devx/core-types"
import { CreateSessionDataParams, DEFAULT_BATCHED_SESSION_ROUTER_MODULE, MultiChainUserOpDto, SessionKeyManagerModule } from "@biconomy-devx/modules"
import { MultiChainValidationModule } from "@biconomy-devx/modules/dist/src/MultichainValidationModule"
import { BiconomySmartAccountV2, BiconomySmartAccountV2Config, DEFAULT_ENTRYPOINT_ADDRESS, VoidSigner } from "@biconomy-devx/account"

import fs from 'fs'
import { LocalStorage } from "node-localstorage";
import { hexConcat, hexZeroPad, keccak256, parseUnits } from "ethers/lib/utils"
import { getUserOpHash } from "@biconomy-devx/common"
import MerkleTree from "merkletreejs"

global.localStorage = new LocalStorage('./scratch');

const BATCHED_ROUTER = DEFAULT_BATCHED_SESSION_ROUTER_MODULE

export const PVG: Record<number, number> = {
  [ChainId.ARBITRUM_ONE_MAINNET]: 5_000_000,
  [ChainId.OPTIMISM_MAINNET]: 40_000_000
}

async function deployData(
  leaves: CreateSessionDataParams[],
  sessionkeyManager: SessionKeyManagerModule,
  multichainModule: MultiChainValidationModule,
  signer: Signer,
  paymasterAndData: string,
  accounts: Record<number, { account: BiconomySmartAccountV2; chainId: number }>,
  gasPrices: Record<number, { max: BigNumber, priority: BigNumber }>,
  gasLimits: Record<number, { callGasLimit: number, verificationGasLimit: number }>,
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

    txs.push(await account.getEnableModuleData(BATCHED_ROUTER))
    txs.push(await account.getEnableModuleData(sessionkeyManager.getAddress()))

    const setMerkleRootData = await sessionkeyManager.createSessionData(leaves)

    txs.push({ data: setMerkleRootData.data, to: sessionkeyManager.getAddress() })

    let partialUserOp = await account.buildUserOp(txs, {
      params,
      overrides: {
        preVerificationGas: PVG[acc.chainId],
        maxFeePerGas: gasPrices[acc.chainId].max,
        maxPriorityFeePerGas: gasPrices[acc.chainId].priority,
        callGasLimit: gasLimits[acc.chainId].callGasLimit,
        verificationGasLimit: gasLimits[acc.chainId].verificationGasLimit,
        paymasterData: paymasterAndData
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

  const gasPrices: Record<number, { max: BigNumber, priority: BigNumber }> = {}
  const accounts: Record<number, { account: BiconomySmartAccountV2; chainId: number }> = {}
  const gasLimits: Record<number, { callGasLimit: number, verificationGasLimit: number }> = {}

  accounts[42161] = { account: swArb, chainId: 42161 }
  accounts[10] = { account: swOpt, chainId: 10 }

  //// REPLACE BELOW VALUES WITH ORIGINAL VALUES ///

  gasPrices[42161] = {
    max: parseUnits('0.1', 9),
    priority: BigNumber.from(0)
  }

  gasPrices[10] = {
    max: parseUnits('0.1', 9),
    priority: parseUnits('0.1', 9)
  }

  gasLimits[42161] = {
    callGasLimit: 1_000_000,
    verificationGasLimit: 200_000
  }

  gasLimits[10] = {
    callGasLimit: 1_000_000,
    verificationGasLimit: 200_000
  }

  const paymasterAndData = '0x'

  //// REPLACE ABOVE VALUES WITH ORIGINAL VALUES ///

  const signData = await deployData(contents.leafNodes, sessionKeyManager, multiChainModule, signer, paymasterAndData, accounts, gasPrices, gasLimits)
  console.log('sign payload', signData)
}

main().catch(e => console.error(e))
