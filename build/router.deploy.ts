import * as router from "../contracts/router";
import fs from "fs";
import { Address, TupleSlice, WalletContract, Cell, beginCell } from "ton";
import dotenv from "dotenv";
dotenv.config();

export function initData() {
  if (process.env.ADMIN_ADDRESS === undefined)
    throw new Error("ADMIN_ADDRESS is not defined");

  return router.data({
    isLocked: false,
    adminAddress: Address.parseFriendly(process.env.ADMIN_ADDRESS).address,
    LPWalletCode: Cell.fromBoc(fs.readFileSync("build/lp_wallet.cell"))[0],
    poolCode: Cell.fromBoc(fs.readFileSync("build/pool.cell"))[0],
    LPAccountCode: Cell.fromBoc(fs.readFileSync("build/lp_account.cell"))[0],
  });
}

export function initMessage() {
  return null;
}
