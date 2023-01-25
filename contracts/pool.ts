import BN from "bn.js";
import { Cell, beginCell, Address } from "ton";
import { beginMessage } from "./helpers";

export function data(params: {
  routerAddress: Address;
  lpFee: BN;
  protocolFee: BN;
  refFee: BN;
  protocolFeesAddress: Address;
  collectedTokenAProtocolFees: BN;
  collectedTokenBProtocolFees: BN;
  reserve0: BN;
  reserve1: BN;
  wallet0: Address;
  wallet1: Address;
  supplyLP: BN;
  LPWalletCode: Cell;
  LPAccountCode: Cell;
}): Cell {
  return beginCell()
    .storeAddress(params.routerAddress)
    .storeUint(params.lpFee, 8)
    .storeUint(params.protocolFee, 8)
    .storeUint(params.refFee, 8)
    .storeAddress(params.wallet0)
    .storeAddress(params.wallet1)
    .storeCoins(params.supplyLP)
    .storeRef(
      beginCell()
        .storeCoins(params.collectedTokenAProtocolFees)
        .storeCoins(params.collectedTokenBProtocolFees)
        .storeAddress(params.protocolFeesAddress)
        .storeCoins(params.reserve0)
        .storeCoins(params.reserve1)
        .endCell()
    )
    .storeRef(params.LPWalletCode)
    .storeRef(params.LPAccountCode)
    .endCell();
}

export function setFees(params: { newLPFee: BN; newProtocolFees: BN; newRefFee: BN; newProtocolFeeAddress: Address }): Cell {
  return beginMessage({ op: new BN(0x355423e5) })
    .storeUint(params.newLPFee, 8)
    .storeUint(params.newProtocolFees, 8)
    .storeUint(params.newRefFee, 8)
    .storeAddress(params.newProtocolFeeAddress)
    .endCell();
}

export function burnTokensNotification(params: { jettonAmount: BN; fromAddress: Address; responseAddress: Address | null }): Cell {
  return beginMessage({ op: new BN(0x7bdd97de) })
    .storeCoins(params.jettonAmount)
    .storeAddress(params.fromAddress)
    .storeAddress(params.responseAddress)
    .endCell();
}

export function collectFees(): Cell {
  return beginMessage({ op: new BN(0x1fcb7d3d) }).endCell();
}

export function resetGas(): Cell {
  return beginMessage({ op: new BN(0x42a0fb43) }).endCell();
}

export function swap(params: { fromAddress: Address; tokenWallet: Address; jettonAmount: BN; toAddress: Address; minOutput: BN; hasRef?: boolean; refAddress?: Address; }): Cell {
  return beginMessage({ op: new BN(0x25938561) })
    .storeAddress(params.fromAddress)
    .storeAddress(params.tokenWallet)
    .storeCoins(params.jettonAmount)
    .storeCoins(params.minOutput)
    .storeBit(!!params.hasRef)
    .storeBit(true)
    .storeRef(beginCell()
      .storeAddress(params.fromAddress)
      .storeAddress(params.refAddress || null)
      .endCell())
    .endCell();
}

export function provideLiquidity(params: { fromAddress: Address; jettonAmount0: BN; jettonAmount1: BN; minLPOut: BN }): Cell {
  return beginMessage({ op: new BN(0xfcf9e58f) })
    .storeAddress(params.fromAddress)
    .storeCoins(params.minLPOut)
    .storeCoins(params.jettonAmount0)
    .storeCoins(params.jettonAmount1)
    .endCell();
}

export function getPoolData(): Cell {
  return beginMessage({ op: new BN(0x43c034e6) })
    .endCell();
}

export function getExpectedOutputs(params: { jettonAmount: BN, tokenSent: Address }): Cell {
  return beginMessage({ op: new BN(0xed4d8b67) })
    .storeCoins(params.jettonAmount)
    .storeAddress(params.tokenSent)
    .endCell();
}

export function getCachedLPByAddress(params: { userAddress: Address }): Cell {
  return beginMessage({ op: new BN(0x0c0671db) })
    .storeAddress(params.userAddress)
    .endCell();
}
