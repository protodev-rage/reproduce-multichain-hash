import { utils } from "ethers"
import { ChainId, Transaction } from "@biconomy-devx/core-types"
import { MultiChainValidationModule } from "@biconomy-devx/modules/dist/src/MultichainValidationModule"
import { BiconomySmartAccountV2, BiconomySmartAccountV2Config, DEFAULT_ENTRYPOINT_ADDRESS, VoidSigner } from "@biconomy-devx/account"
import { CreateSessionDataParams, DEFAULT_BATCHED_SESSION_ROUTER_MODULE, MultiChainUserOpDto, SessionKeyManagerModule } from "@biconomy-devx/modules"

import * as data from './data.json'
import MerkleTree from "merkletreejs"
import { LocalStorage } from "node-localstorage";
import { getUserOpHash } from "@biconomy-devx/common"
import { hexConcat, hexZeroPad, keccak256 } from "ethers/lib/utils"

global.localStorage = new LocalStorage('./scratch');

const BATCHED_ROUTER = DEFAULT_BATCHED_SESSION_ROUTER_MODULE

async function deployData(
  userOps: MultiChainUserOpDto[],
  leaves: CreateSessionDataParams[],
  sessionkeyManager: SessionKeyManagerModule,
  multichainModule: MultiChainValidationModule,
  accounts: Record<number, { account: BiconomySmartAccountV2; chainId: number }>,
) {

  for (const acc of Object.values(accounts)) {
    const { account } = acc
    account.setActiveValidationModule(multichainModule)

    const txs: Transaction[] = []

    const isDeploy = userOps.find(u => u.chainId === acc.chainId)?.userOp.initCode !== '0x' || false;

    if (isDeploy) {
      txs.push(await account.getEnableModuleData(BATCHED_ROUTER))
      txs.push(await account.getEnableModuleData(sessionkeyManager.getAddress()))
    }

    const setMerkleRootData = await sessionkeyManager.createSessionData(leaves)

    txs.push({ data: setMerkleRootData.data, to: sessionkeyManager.getAddress() })

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

  const userOps: MultiChainUserOpDto[] = []

  for (const uOp of (data.userOps as any)) {
    userOps.push(uOp)
  }

  const eoaAddress = data.eoaAddress;
  const sessionData = JSON.parse(data.sessionData)

  const { leafNodes } = sessionData;

  const signer = new VoidSigner(utils.getAddress(eoaAddress))

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

  const accounts: Record<number, { account: BiconomySmartAccountV2; chainId: number }> = {}

  accounts[10] = { account: swOpt, chainId: 10 }
  accounts[42161] = { account: swArb, chainId: 42161 }

  const signData = await deployData(userOps, leafNodes, sessionKeyManager, multiChainModule, accounts)
  console.log('signature payload', signData)
}

main().catch(e => console.error(e))
