import BN from "bn.js";
import { Builder, beginCell } from "ton";

export function beginMessage(params: { op: BN }): Builder {
  return beginCell()
    .storeUint(params.op, 32)
    .storeUint(new BN(Math.floor(Math.random() * Math.pow(2, 31))), 64);
}
