import BN from "bn.js";
import { Cell, beginCell, Address } from "ton";
import { beginMessage } from "./helpers";

export function data(params: {
    user: Address;
    pool: Address;
    stored0: BN;
    stored1: BN;
}): Cell {
    return beginCell()
        .storeAddress(params.user)
        .storeAddress(params.pool)
        .storeCoins(params.stored0)
        .storeCoins(params.stored1)
        .endCell();
}

export function resetGas(): Cell {
    return beginMessage({ op: new BN(0x42a0fb43) })
        .endCell();
}

export function addLiquidity(params: {
    newAmount0: BN;
    newAmount1: BN;
    minLPOut: BN;
}): Cell {
    return beginMessage({ op: new BN(0x3ebe5431) })
        .storeCoins(params.newAmount0)
        .storeCoins(params.newAmount1)
        .storeCoins(params.minLPOut)
        .endCell();
}

export function directAddLiquidity(params: {
    amount0: BN;
    amount1: BN;
    minLPOut: BN;
}): Cell {
    return beginMessage({ op: new BN(0x4cf82803) })
        .storeCoins(params.amount0)
        .storeCoins(params.amount1)
        .storeCoins(params.minLPOut)
        .endCell();
}

export function refundMe(): Cell {
    return beginMessage({ op: new BN(0x0bf3f447) })
        .endCell();
}

export function getLPAccountData(): Cell {
    return beginMessage({ op: new BN(0xea97bbef) })
        .endCell();
}
