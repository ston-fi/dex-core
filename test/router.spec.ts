import chai, { expect } from "chai";
import chaiBN from "chai-bn";
import BN from "bn.js";
chai.use(chaiBN(BN));

import * as fs from "fs";
import { Cell, beginCell, Address, Slice, toNano } from "ton";
import { SmartContract, SendMsgAction } from "ton-contract-executor";
import * as router from "../contracts/router";
import { internalMessage, randomAddress, setBalance, setNetworkConfig } from "./helpers";

describe("router tests", () => {
  let contract: SmartContract;

  beforeEach(async () => {
    contract = await SmartContract.fromCell(
      Cell.fromBoc(fs.readFileSync("build/router.cell"))[0],
      router.data({
        isLocked: false,
        adminAddress: randomAddress("admin"),
        poolCode: Cell.fromBoc(fs.readFileSync("build/pool.cell"))[0],
        LPWalletCode: Cell.fromBoc(fs.readFileSync("build/lp_wallet.cell"))[0],
        LPAccountCode: Cell.fromBoc(fs.readFileSync("build/lp_account.cell"))[0],
      })
    );
  });

  it("should get a valid pool address", async () => {
    const poolAddr1 = beginCell().storeAddress(randomAddress("token wallet 1")).endCell();
    const poolAddr2 = beginCell().storeAddress(randomAddress("token wallet 2")).endCell();
    const call = await contract.invokeGetMethod("get_pool_address", [
      { type: "cell_slice", value: poolAddr1.toBoc({ idx: false }).toString("base64") },
      { type: "cell_slice", value: poolAddr2.toBoc({ idx: false }).toString("base64") },
    ]);

    const poolAddr = call.result[0];
    expect(call.type).to.equal("success");
  });

  it("should reset gas", async () => {
    setBalance(contract, toNano(5));
    const send = await contract.sendInternalMessage(
      internalMessage({
        from: randomAddress("admin"),
        value: toNano(70000000),
        body: router.resetGas(),
      })
    );
    expect(send.type).to.be.equal("success");
    expect(send.actionList.length).to.be.equal(1);
  });

  it("should pay if caller is valid", async () => {
    setNetworkConfig(contract);
    const tokenWallet1 = beginCell().storeAddress(randomAddress("token wallet 1")).endCell();
    const tokenWallet2 = beginCell().storeAddress(randomAddress("token wallet 2")).endCell();
    const call = await contract.invokeGetMethod("get_pool_address", [
      { type: "cell_slice", value: tokenWallet1.toBoc({ idx: false }).toString("base64") },
      { type: "cell_slice", value: tokenWallet2.toBoc({ idx: false }).toString("base64") },
    ]);
    const send = await contract.sendInternalMessage(
      internalMessage({
        from: (call.result[0] as Slice).readAddress() as Address,
        value: toNano("20"),
        body: router.payTo({
          owner: randomAddress("owner"),
          tokenAAmount: new BN(100),
          walletTokenAAddress: randomAddress("token wallet 1"),
          tokenBAmount: new BN(200),
          walletTokenBAddress: randomAddress("token wallet 2"),
        }),
      })
    );
    expect(send.type).to.equal("success");
    expect(send.actionList.length).to.equal(2);
  });

  it("should always get the same pool", async () => {
    const tokenWallet1 = beginCell().storeAddress(randomAddress("token wallet 1")).endCell();
    const tokenWallet2 = beginCell().storeAddress(randomAddress("token wallet 2")).endCell();
    const call = await contract.invokeGetMethod("get_pool_address", [
      { type: "cell_slice", value: tokenWallet1.toBoc({ idx: false }).toString("base64") },
      { type: "cell_slice", value: tokenWallet2.toBoc({ idx: false }).toString("base64") },
    ]);
    let result1 = (call.result[0] as Slice).readAddress()?.toString();
    const call2 = await contract.invokeGetMethod("get_pool_address", [
      { type: "cell_slice", value: tokenWallet2.toBoc({ idx: false }).toString("base64") },
      { type: "cell_slice", value: tokenWallet1.toBoc({ idx: false }).toString("base64") },
    ]);

    expect(result1).to.be.equal((call2.result[0] as Slice).readAddress()?.toString());

    const send = await contract.sendInternalMessage(
      internalMessage({
        from: randomAddress("someone"),
        value: new BN("300000000"),
        body: router.getPoolAddress({
          walletTokenAAddress: randomAddress("token wallet 1"),
          walletTokenBAddress: randomAddress("token wallet 2"),
        }),
      })
    );
    expect(send.type).to.equal("success");
    expect(send.actionList.length).to.equal(2);

    expect(send.actionList[1].type).to.be.equal("send_msg");
    let msgOut = (send.actionList[1] as SendMsgAction).message;
    expect(msgOut.info.dest?.toString()).to.be.equal(randomAddress("someone").toString());
    let msgOutBody = msgOut.body.beginParse();
    msgOutBody.skip(32 + 64);
    let address2 = msgOutBody.readAddress()?.toString();
    expect(address2).to.be.equal(result1)
  });

  it("should refuse to pay if caller is not valid", async () => {
    setNetworkConfig(contract);
    const send = await contract.sendInternalMessage(
      internalMessage({
        from: randomAddress("a random address"),
        value: toNano("2"),
        body: router.payTo({
          owner: randomAddress("owner"),
          tokenAAmount: new BN(100),
          walletTokenAAddress: randomAddress("token wallet 1"),
          tokenBAmount: new BN(200),
          walletTokenBAddress: randomAddress("token wallet 2"),
        }),
      })
    );
    expect(send.type).to.not.equal("success");
    expect(send.actionList.length).to.equal(0);
  });

  it("should route a swap request", async () => {
    let tokenWallet0 = randomAddress("a random token wallet"),
      tokenWallet1 = randomAddress("token wallet 2");
    const sendWithoutRef = await contract.sendInternalMessage(
      internalMessage({
        from: tokenWallet0,
        value: new BN("300000000"),
        body: router.swap({
          jettonAmount: new BN(100),
          fromAddress: randomAddress("from"),
          walletTokenBAddress: tokenWallet1,
          toAddress: randomAddress("from"),
          expectedOutput: new BN(100),
        }),
      })
    );
    expect(sendWithoutRef.type).to.equal("success");
    expect(sendWithoutRef.actionList.length).to.equal(1);

    let msgOut = (sendWithoutRef.actionList[0] as SendMsgAction).message;
    expect(msgOut.info.dest?.toString()).to.not.be.equal(tokenWallet0.toString()); // not bounced back

    const sendWithRef = await contract.sendInternalMessage(
      internalMessage({
        from: tokenWallet0,
        value: new BN("300000000"),
        body: router.swap({
          jettonAmount: new BN(100),
          fromAddress: randomAddress("from"),
          walletTokenBAddress: tokenWallet1,
          toAddress: randomAddress("from"),
          expectedOutput: new BN(100),
          hasRef: true,
          refAddress: randomAddress("ref"),
        }),
      })
    );
    expect(sendWithRef.type).to.equal("success");
    expect(sendWithRef.actionList.length).to.equal(1);

    let msgOut2 = (sendWithRef.actionList[0] as SendMsgAction).message;
    expect(msgOut2.info.dest?.toString()).to.not.be.equal(tokenWallet0.toString()); // not bounced back

  });

  it("should route a lp request", async () => {
    const send = await contract.sendInternalMessage(
      internalMessage({
        from: randomAddress("a random token wallet"),
        value: new BN("300000000"),
        body: router.provideLiquidity({
          jettonAmount: new BN(100),
          fromAddress: randomAddress("from"),
          walletTokenBAddress: randomAddress("token wallet 2"),
          minLPOut: new BN(100),
        }),
      })
    );
    expect(send.type).to.equal("success");
    expect(send.actionList.length).to.equal(1);
  });

  it("should allow pool upgrades", async () => {
    contract.setUnixTime(+new Date());
    const sendUpdateAdminOk = await contract.sendInternalMessage(
      internalMessage({
        from: randomAddress("admin"),
        value: new BN("300000000"),
        body: router.initAdminUpgrade({
          newAdmin: randomAddress("new admin"),
        }),
      })
    );
    expect(sendUpdateAdminOk.type).to.equal("success");
    // two days passed
    contract.setUnixTime(+new Date() + (24 * 60 * 60 * 2));

    const sendFinalizeUpgradeAdminOk = await contract.sendInternalMessage(
      internalMessage({
        from: randomAddress("admin"), // old admin
        value: new BN("300000000"),
        body: router.finalizeUpgrades(),
      })
    );

    expect(sendFinalizeUpgradeAdminOk.type).to.equal("success");
    expect(sendFinalizeUpgradeAdminOk.actionList.length).to.equal(0);

    contract.setUnixTime(+new Date());

    const sendInitUpgradeWrongSender = await contract.sendInternalMessage(
      internalMessage({
        from: randomAddress("admin"), // old admin
        value: new BN("300000000"),
        body: router.initCodeUpgrade({
          newCode: beginCell().storeInt(new BN("10"), 32).endCell(),
        }),
      })
    );
    expect(sendInitUpgradeWrongSender.type).to.equal("failed");
    expect(sendInitUpgradeWrongSender.exit_code).to.equal(65535);

    const sendInitCodeUpgradeOk = await contract.sendInternalMessage(
      internalMessage({
        from: randomAddress("new admin"),
        value: new BN("300000000"),
        body: router.initCodeUpgrade({
          newCode: beginCell().storeInt(new BN("10"), 32).endCell(),
        }),
      })
    );
    expect(sendInitCodeUpgradeOk.type).to.equal("success");
    expect(sendInitCodeUpgradeOk.actionList.length).to.equal(0);

    // zero days passed
    const sendFinalizeUpgradeFailed = await contract.sendInternalMessage(
      internalMessage({
        from: randomAddress("new admin"),
        value: new BN("300000000"),
        body: router.finalizeUpgrades(),
      })
    );

    expect(sendFinalizeUpgradeFailed.type).to.equal("success");
    expect(sendFinalizeUpgradeFailed.actionList.length).to.equal(0);

    contract.setUnixTime(+new Date() + (24 * 60 * 60 * 7));

    const sendFinalizeUpgradeOk = await contract.sendInternalMessage(
      internalMessage({
        from: randomAddress("new admin"),
        value: new BN("300000000"),
        body: router.finalizeUpgrades(),
      })
    );

    expect(sendFinalizeUpgradeOk.type).to.equal("success");
    expect(sendFinalizeUpgradeOk.actionList[0].type).to.equal("set_code");
  });

  it("should collect fees from pool", async () => {
    let poolAddress = randomAddress("a pool");
    const send = await contract.sendInternalMessage(
      internalMessage({
        from: randomAddress("admin"),
        value: new BN("300000000"),
        body: router.collectFees({
          jetton0Address: randomAddress("a jetton"),
          jetton1Address: randomAddress("another jetton"),
        }),
      })
    );
    expect(send.type).to.equal("success");
  });

  it("should set fees", async () => {
    let admin = randomAddress("admin");
    const sendOk = await contract.sendInternalMessage(
      internalMessage({
        from: admin,
        value: new BN("300000000"),
        body: router.setFees({
          jetton0Address: randomAddress("a jetton"),
          jetton1Address: randomAddress("another jetton"),
          newLPFee: new BN(2),
          newProtocolFee: new BN(1),
          newRefFee: new BN(1),
          newProtocolFeeAddress: randomAddress("partner"),
        }),
      })
    );
    expect(sendOk.type).to.equal("success");
    expect(sendOk.actionList.length).to.equal(1);
  });

  it("should lock/unlock trades", async () => {
    const sendWrongSender = await contract.sendInternalMessage(
      internalMessage({
        from: randomAddress(""),
        value: new BN("300000000"),
        body: router.lock(),
      })
    );
    expect(sendWrongSender.type).to.equal("failed");

    const send = await contract.sendInternalMessage(
      internalMessage({
        from: randomAddress("admin"),
        value: new BN("300000000"),
        body: router.lock(),
      })
    );
    expect(send.type).to.equal("success");

    const callGetData1 = await contract.invokeGetMethod("get_router_data", []);
    let newStatus = (callGetData1.result[0] as BN).toNumber() == 0 ? "unlocked" : "locked";
    expect(newStatus).to.equal("locked");

    let tokenWallet0 = randomAddress("a random token wallet"),
      tokenWallet1 = randomAddress("token wallet 2");
    const sendWithoutRef = await contract.sendInternalMessage(
      internalMessage({
        from: tokenWallet0,
        value: new BN("300000000"),
        body: router.swap({
          jettonAmount: new BN(100),
          fromAddress: randomAddress("from"),
          walletTokenBAddress: tokenWallet1,
          toAddress: randomAddress("from"),
          expectedOutput: new BN(100),
        }),
      })
    );
    expect(sendWithoutRef.type).to.equal("success");
    expect(sendWithoutRef.actionList.length).to.equal(1);

    let msgOut = (sendWithoutRef.actionList[0] as SendMsgAction).message;
    expect(msgOut.info.dest?.toString()).to.be.equal(tokenWallet0.toString()); // bounced back
    // skip everything expet last exit code
    let msgOutBody = msgOut.body.beginParse();
    msgOutBody.skip(msgOutBody.remaining - 32);
    expect(msgOutBody.readUint(32).toNumber()).to.equal(0xA0DBDCB);
    const send2 = await contract.sendInternalMessage(
      internalMessage({
        from: randomAddress("admin"),
        value: new BN("300000000"),
        body: router.unlock(),
      })
    );
    expect(send2.type).to.equal("success");

    const callGetData2 = await contract.invokeGetMethod("get_router_data", []);
    newStatus = (callGetData2.result[0] as BN).toNumber() == 0 ? "unlocked" : "locked";
    expect(newStatus).to.equal("unlocked");
  });


  it("should return contracts codes", async () => {
    const callGetRouterData = await contract.invokeGetMethod("get_router_data", []);
    let poolCodeHash = (callGetRouterData.result[3] as Cell).hash();
    let jettonLPWalletCodeHash = (callGetRouterData.result[4] as Cell).hash();
    let LPAccountCodeHash = (callGetRouterData.result[5] as Cell).hash();

    expect(poolCodeHash).to.deep.equal(Cell.fromBoc(fs.readFileSync("build/pool.cell"))[0].hash());
    expect(jettonLPWalletCodeHash).to.deep.equal(Cell.fromBoc(fs.readFileSync("build/lp_wallet.cell"))[0].hash());
    expect(LPAccountCodeHash).to.deep.equal(Cell.fromBoc(fs.readFileSync("build/lp_account.cell"))[0].hash());
  });
});
