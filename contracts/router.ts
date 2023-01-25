import BN from "bn.js";
import { Cell, beginCell, Address } from "ton";
import { beginMessage } from "./helpers";

export function data(params: { isLocked: boolean; adminAddress: Address; LPWalletCode: Cell; poolCode: Cell; LPAccountCode: Cell; }): Cell {
  return beginCell()
    .storeUint(params.isLocked ? 1 : 0, 1)
    .storeAddress(params.adminAddress)
    .storeRef(params.LPWalletCode)
    .storeRef(params.poolCode)
    .storeRef(params.LPAccountCode)
    .storeRef(beginCell()
      .storeUint(0, 64)
      .storeUint(0, 64)
      .storeAddress(null)
      .storeRef(beginCell().endCell())
      .endCell())
    .endCell();
}

export function setFees(params: {
  jetton0Address: Address;
  jetton1Address: Address;
  newLPFee: BN;
  newProtocolFee: BN;
  newRefFee: BN;
  newProtocolFeeAddress: Address;
}): Cell {
  return beginMessage({ op: new BN(0x355423e5) })
    .storeUint(params.newLPFee, 8)
    .storeUint(params.newProtocolFee, 8)
    .storeUint(params.newRefFee, 8)
    .storeAddress(params.newProtocolFeeAddress)
    .storeRef(beginCell()
      .storeAddress(params.jetton0Address)
      .storeAddress(params.jetton1Address)
      .endCell())
    .endCell();
}

export function initCodeUpgrade(params: { newCode: Cell; }): Cell {
  return beginMessage({ op: new BN(0xdf1e233d) })
    .storeRef(params.newCode)
    .endCell();
}

export function initAdminUpgrade(params: { newAdmin: Address; }): Cell {
  return beginMessage({ op: new BN(0x2fb94384) })
    .storeAddress(params.newAdmin)
    .endCell();
}

export function cancelCodeUpgrade(): Cell {
  return beginMessage({ op: new BN(0x357ccc67) })
    .endCell();
}

export function cancelAdminUpgrade(): Cell {
  return beginMessage({ op: new BN(0xa4ed9981) })
    .endCell();
}


export function finalizeUpgrades(): Cell {
  return beginMessage({ op: new BN(0x6378509f) })
    .endCell();
}

export function resetGas(): Cell {
  return beginMessage({ op: new BN(0x42a0fb43) }).endCell();
}

export function lock(): Cell {
  return beginMessage({ op: new BN(0x878f9b0e) })
    .endCell();
}

export function unlock(): Cell {
  return beginMessage({ op: new BN(0x6ae4b0ef) })
    .endCell();
}

export function collectFees(params: {
  jetton0Address: Address;
  jetton1Address: Address;
}): Cell {
  return beginMessage({ op: new BN(0x1fcb7d3d) })
    .storeAddress(params.jetton0Address)
    .storeAddress(params.jetton1Address)
    .endCell();
}

export function payTo(params: { owner: Address; tokenAAmount: BN; walletTokenAAddress: Address; tokenBAmount: BN; walletTokenBAddress: Address }): Cell {
  return beginMessage({ op: new BN(0xf93bb43f) })
    .storeAddress(params.owner)
    .storeUint(new BN(0), 32)
    .storeRef(
      beginCell()
        .storeCoins(params.tokenAAmount)
        .storeAddress(params.walletTokenAAddress)
        .storeCoins(params.tokenBAmount)
        .storeAddress(params.walletTokenBAddress)
        .endCell()
    )
    .endCell();
}

export function swap(params: { jettonAmount: BN; fromAddress: Address; walletTokenBAddress: Address; toAddress: Address; expectedOutput: BN; refAddress?: Address; }): Cell {
  let swapPayload = beginCell()
    .storeUint(new BN(0x25938561), 32)
    .storeAddress(params.walletTokenBAddress)
    .storeCoins(params.expectedOutput)
    .storeAddress(params.toAddress)
    .storeBit(!!params.refAddress);

  if (!!params.refAddress)
    swapPayload.storeAddress(params.refAddress || null);

  return beginMessage({ op: new BN(0x7362d09c) })
    .storeCoins(params.jettonAmount)
    .storeAddress(params.fromAddress)
    .storeBit(true)
    .storeRef(swapPayload.endCell())
    .endCell();
}

export function provideLiquidity(params: { jettonAmount: BN; fromAddress: Address; walletTokenBAddress: Address; minLPOut: BN }): Cell {
  return beginMessage({ op: new BN(0x7362d09c) })
    .storeCoins(params.jettonAmount)
    .storeAddress(params.fromAddress)
    .storeBit(true)
    .storeRef(beginCell()
      .storeUint(new BN(0xfcf9e58f), 32)
      .storeAddress(params.walletTokenBAddress)
      .storeCoins(params.minLPOut)
      .endCell())
    .endCell();
}

export function getPoolAddress(params: { walletTokenAAddress: Address; walletTokenBAddress: Address }): Cell {
  return beginMessage({ op: new BN(0xd1db969b) })
    .storeAddress(params.walletTokenAAddress)
    .storeAddress(params.walletTokenBAddress)
    .endCell();
}
