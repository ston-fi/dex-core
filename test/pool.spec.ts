import chai, { expect } from "chai";
import chaiBN from "chai-bn";
import BN from "bn.js";
chai.use(chaiBN(BN));

import * as fs from "fs";
import { Cell, beginCell, Address, toNano, Slice } from "ton";
import { SmartContract, buildC7, SendMsgAction } from "ton-contract-executor";
import * as pool from "../contracts/pool";
import { internalMessage, randomAddress, setBalance, parseUri, setNetworkConfig, zeroAddress } from "./helpers";

describe("pool tests", () => {
  let contract: SmartContract, routerAddress: Address;

  beforeEach(async () => {
    routerAddress = randomAddress("a valid pool");
    contract = await SmartContract.fromCell(
      Cell.fromBoc(fs.readFileSync("build/pool.cell"))[0],
      pool.data({
        routerAddress: routerAddress,
        lpFee: new BN(20),
        protocolFee: new BN(0),
        refFee: new BN(10),
        protocolFeesAddress: randomAddress("a valid protocol fee address"),
        collectedTokenAProtocolFees: new BN(0),
        collectedTokenBProtocolFees: new BN(0),
        wallet0: randomAddress("wallet0"),
        wallet1: randomAddress("wallet1"),
        reserve0: new BN(0),
        reserve1: new BN(0),
        supplyLP: new BN(0),
        LPWalletCode: Cell.fromBoc(fs.readFileSync("build/lp_wallet.cell"))[0],
        LPAccountCode: Cell.fromBoc(fs.readFileSync("build/lp_account.cell"))[0],
      })
    );
  });

  it("should mint lp tokens", async () => {
    setBalance(contract, toNano(5));
    contract = await SmartContract.fromCell(
      Cell.fromBoc(fs.readFileSync("build/pool.cell"))[0],
      pool.data({
        routerAddress: routerAddress,
        lpFee: new BN(20),
        protocolFee: new BN(0),
        refFee: new BN(10),
        protocolFeesAddress: randomAddress("a valid protocol fee address"),
        collectedTokenAProtocolFees: new BN(0),
        collectedTokenBProtocolFees: new BN(0),
        wallet0: randomAddress("wallet0"),
        wallet1: randomAddress("wallet1"),
        reserve0: new BN(0),
        reserve1: new BN(0),
        supplyLP: new BN(0),
        LPWalletCode: Cell.fromBoc(fs.readFileSync("build/lp_wallet.cell"))[0],
        LPAccountCode: Cell.fromBoc(fs.readFileSync("build/lp_account.cell"))[0],
      })
    );

    const sendToken0 = await contract.sendInternalMessage(
      internalMessage({
        from: routerAddress,
        value: toNano(7000000000),
        body: pool.provideLiquidity({
          fromAddress: randomAddress("user"),
          jettonAmount0: new BN(0),
          jettonAmount1: new BN(1000001),
          minLPOut: new BN(1),
        }),
      })
    );
    expect(sendToken0.type).to.be.equal("success");
    expect(sendToken0.actionList.length).to.equal(1);

    const sendToken1 = await contract.sendInternalMessage(
      internalMessage({
        from: routerAddress,
        value: toNano(7000000000),
        body: pool.provideLiquidity({
          fromAddress: randomAddress("user"),
          jettonAmount0: new BN(100000001),
          jettonAmount1: new BN(0),
          minLPOut: new BN(1),
        }),
      })
    );
    expect(sendToken1.type).to.be.equal("success");
    expect(sendToken1.actionList.length).to.equal(1);
  });

  it("should reset gas", async () => {
    setBalance(contract, toNano(5));
    const send = await contract.sendInternalMessage(
      internalMessage({
        from: routerAddress,
        value: toNano(70000000),
        body: pool.resetGas(),
      })
    );
    expect(send.type).to.be.equal("success");
    expect(send.actionList.length).to.be.equal(1);
  });

  it("should allow burning", async () => {
    setBalance(contract, toNano(5));
    setNetworkConfig(contract);
    contract.setDataCell(
      pool.data({
        routerAddress: routerAddress,
        lpFee: new BN(20),
        protocolFee: new BN(0),
        refFee: new BN(10),
        protocolFeesAddress: randomAddress("a valid protocol fee address"),
        collectedTokenAProtocolFees: new BN(0),
        collectedTokenBProtocolFees: new BN(0),
        wallet0: randomAddress("wallet0"),
        wallet1: randomAddress("wallet1"),
        reserve0: new BN(10000),
        reserve1: new BN(204030300),
        supplyLP: new BN(1000),
        LPWalletCode: Cell.fromBoc(fs.readFileSync("build/lp_wallet.cell"))[0],
        LPAccountCode: Cell.fromBoc(fs.readFileSync("build/lp_account.cell"))[0],
      })
    );

    const userAddress = beginCell().storeAddress(randomAddress("user1")).endCell();
    const callWalletAddress = await contract.invokeGetMethod("get_wallet_address", [{ type: "cell_slice", value: userAddress.toBoc({ idx: false }).toString("base64") }]);

    expect(callWalletAddress.type).to.equal("success");
    const userWalletAddress = (callWalletAddress.result[0] as Slice).readAddress() as Address;

    const sendWrongAmount = await contract.sendInternalMessage(
      internalMessage({
        from: userWalletAddress,
        value: toNano(70000000),
        body: pool.burnTokensNotification({
          fromAddress: randomAddress("user1"),
          jettonAmount: new BN(0),
          responseAddress: null,
        }),
      })
    );
    expect(sendWrongAmount.type).to.be.equal("failed");
    expect(sendWrongAmount.actionList.length).to.be.equal(0);

    const send = await contract.sendInternalMessage(
      internalMessage({
        from: userWalletAddress,
        value: toNano(1),
        body: pool.burnTokensNotification({
          fromAddress: randomAddress("user1"),
          jettonAmount: new BN(100),
          responseAddress: userWalletAddress,
        }),
      })
    );
    expect(send.type).to.be.equal("success");
    expect(send.actionList.length).to.be.equal(2);
    expect((send.actionList[1] as SendMsgAction).message.info.dest?.toString()).to.be.equal(routerAddress.toString());

    const callPoolData = await contract.invokeGetMethod("get_pool_data", []);
    // @ts-ignore
    expect(callPoolData.result[0] as BN).to.be.a.bignumber.that.is.lessThan(new BN(10000));
    // @ts-ignore
    expect(callPoolData.result[1] as BN).to.be.a.bignumber.that.is.lessThan(new BN(204030300));

  });

  it("should allow collecting fees", async () => {
    setBalance(contract, toNano(5));
    setNetworkConfig(contract);

    contract.setDataCell(
      pool.data({
        routerAddress: routerAddress,
        lpFee: new BN(20),
        protocolFee: new BN(0),
        refFee: new BN(10),
        protocolFeesAddress: zeroAddress,
        collectedTokenAProtocolFees: new BN(110),
        collectedTokenBProtocolFees: new BN(440),
        wallet0: randomAddress("wallet0"),
        wallet1: randomAddress("wallet1"),
        reserve0: new BN(1310),
        reserve1: new BN(203333),
        supplyLP: new BN(10000000),
        LPWalletCode: Cell.fromBoc(fs.readFileSync("build/lp_wallet.cell"))[0],
        LPAccountCode: Cell.fromBoc(fs.readFileSync("build/lp_account.cell"))[0],
      })
    );

    const sendCollectFeesNoFeeAddress = await contract.sendInternalMessage(
      internalMessage({
        from: routerAddress,
        value: toNano(0.5),
        body: pool.collectFees(),
      })
    );
    expect(sendCollectFeesNoFeeAddress.type).to.be.equal("failed");

    contract.setDataCell(
      pool.data({
        routerAddress: routerAddress,
        lpFee: new BN(20),
        protocolFee: new BN(0),
        refFee: new BN(10),
        protocolFeesAddress: randomAddress("a valid protocol fee address"),
        collectedTokenAProtocolFees: new BN(110),
        collectedTokenBProtocolFees: new BN(440),
        wallet0: randomAddress("wallet0"),
        wallet1: randomAddress("wallet1"),
        reserve0: new BN(1310),
        reserve1: new BN(203333),
        supplyLP: new BN(10000000),
        LPWalletCode: Cell.fromBoc(fs.readFileSync("build/lp_wallet.cell"))[0],
        LPAccountCode: Cell.fromBoc(fs.readFileSync("build/lp_account.cell"))[0],
      })
    );

    const sendCollectFees = await contract.sendInternalMessage(
      internalMessage({
        from: routerAddress,
        value: toNano(0.5),
        body: pool.collectFees(),
      })
    );
    expect(sendCollectFees.type).to.be.equal("success");
    expect(sendCollectFees.actionList.length).to.be.equal(1);
    expect(sendCollectFees.actionList[0].type).to.be.equal("send_msg");

    const sendGetPoolData = await contract.sendInternalMessage(
      internalMessage({
        from: randomAddress("wallet0"),
        value: toNano(0.5),
        body: pool.getPoolData(),
      })
    );

    expect(sendGetPoolData.actionList[1].type).to.be.equal("send_msg");
    let msgOut = (sendGetPoolData.actionList[1] as SendMsgAction).message;
    expect(msgOut.info.dest?.toString()).to.be.equal(randomAddress("wallet0").toString());
    let msgOutBody = msgOut.body.beginParse().readRef();
    msgOutBody.skip(4 + 4 + 4);
    msgOutBody.readAddress();
    expect(msgOutBody.readCoins().toNumber()).to.be.equal(0);

    contract.setDataCell(
      pool.data({
        routerAddress: routerAddress,
        lpFee: new BN(20),
        protocolFee: new BN(0),
        refFee: new BN(10),
        protocolFeesAddress: randomAddress("a valid protocol fee address"),
        collectedTokenAProtocolFees: new BN(11000000000000),
        collectedTokenBProtocolFees: new BN(4400000000000000),
        wallet0: randomAddress("wallet0"),
        wallet1: randomAddress("wallet1"),
        reserve0: new BN(1310),
        reserve1: new BN(203333),
        supplyLP: new BN(10000000),
        LPWalletCode: Cell.fromBoc(fs.readFileSync("build/lp_wallet.cell"))[0],
        LPAccountCode: Cell.fromBoc(fs.readFileSync("build/lp_account.cell"))[0],
      })
    );

    const sendCollectFeesLowGas = await contract.sendInternalMessage(
      internalMessage({
        from: randomAddress("user"),
        value: toNano(0.5),
        body: pool.collectFees(),
      })
    );
    expect(sendCollectFeesLowGas.type).to.be.equal("failed");

    const sendCollectFeesWithRewards = await contract.sendInternalMessage(
      internalMessage({
        from: randomAddress("user"),
        value: toNano(1.2),
        body: pool.collectFees(),
      })
    );

    expect(sendCollectFeesWithRewards.type).to.be.equal("success");
    expect(sendCollectFeesWithRewards.actionList.length).to.be.equal(2);
  });

  it("should allow swapping", async () => {
    let protocolFeesAddress = randomAddress("another valid protocol address");
    setBalance(contract, toNano(5));
    contract.setDataCell(
      pool.data({
        routerAddress: routerAddress,
        lpFee: new BN(20),
        protocolFee: new BN(0),
        refFee: new BN(10),
        protocolFeesAddress: randomAddress("a valid protocol fee address"),
        collectedTokenAProtocolFees: new BN(0),
        collectedTokenBProtocolFees: new BN(0),
        wallet0: randomAddress("wallet0"),
        wallet1: randomAddress("wallet1"),
        reserve0: new BN(1000000000000000),
        reserve1: new BN(1000000000000000),
        supplyLP: new BN(10000000),
        LPWalletCode: Cell.fromBoc(fs.readFileSync("build/lp_wallet.cell"))[0],
        LPAccountCode: Cell.fromBoc(fs.readFileSync("build/lp_account.cell"))[0],
      })
    );

    const sendChangeFees = await contract.sendInternalMessage(
      internalMessage({
        from: routerAddress,
        value: toNano(0.1),
        body: pool.setFees({
          newLPFee: new BN(100),
          newProtocolFees: new BN(0),
          newRefFee: new BN(10),
          newProtocolFeeAddress: protocolFeesAddress,
        }),
      })
    );
    expect(sendChangeFees.type).to.be.equal("success");

    const callGetFees = await contract.invokeGetMethod("get_pool_data", []);

    expect(callGetFees.result[4] as BN).to.be.a.bignumber.that.is.equal(new BN(100));
    expect(callGetFees.result[5] as BN).to.be.a.bignumber.that.is.equal(new BN(0));
    expect(callGetFees.result[6] as BN).to.be.a.bignumber.that.is.equal(new BN(10));

    const callGetOutputs = await contract.invokeGetMethod("get_expected_outputs", [
      { type: "int", value: "20000000000" },
      { type: "cell_slice", value: (beginCell().storeAddress(randomAddress("wallet0")).endCell()).toBoc({ idx: false }).toString("base64") },
    ]);

    expect(callGetOutputs.result[0] as BN).to.be.a.bignumber.that.is.equal(new BN(19799607967));

    const sendSwapWrongSender = await contract.sendInternalMessage(
      internalMessage({
        from: randomAddress(""),
        value: toNano(0.1),
        body: pool.swap({
          fromAddress: randomAddress("user1"),
          jettonAmount: new BN("20000000000"),
          tokenWallet: randomAddress("wallet1"),
          toAddress: randomAddress("user1"),
          minOutput: new BN("200"),
        }),
      })
    );
    expect(sendSwapWrongSender.type).to.be.equal("failed");

    const sendSwap = await contract.sendInternalMessage(
      internalMessage({
        from: routerAddress,
        value: toNano(0.1),
        body: pool.swap({
          fromAddress: randomAddress("user1"),
          jettonAmount: new BN("20000000000"),
          tokenWallet: randomAddress("wallet0"),
          toAddress: randomAddress("user1"),
          minOutput: new BN("200"),
        }),
      })
    );

    expect(sendSwap.type).to.be.equal("success");
    expect(sendSwap.actionList.length).to.be.equal(1);
    expect(sendSwap.actionList[0].type).to.be.equal("send_msg");
    let msgOutSwap = (sendSwap.actionList[0] as SendMsgAction).message;
    expect(msgOutSwap.info.dest?.toString()).to.be.equal(routerAddress.toString());

    let msgOutSwapBody = msgOutSwap.body.beginParse().readRef();
    msgOutSwapBody.readCoins();
    msgOutSwapBody.readAddress();
    let receivedToken = msgOutSwapBody.readCoins();
    // @ts-ignore
    expect(receivedToken).to.be.a.bignumber.that.is.equal(callGetOutputs.result[0] as BN);

    const sendGetExpectedAfterSwap = await contract.sendInternalMessage(
      internalMessage({
        from: randomAddress("someone"),
        value: toNano(0.1),
        body: pool.getExpectedOutputs({
          jettonAmount: new BN(20000000000),
          tokenSent: randomAddress("wallet0"),
        })
      })
    );

    expect(sendGetExpectedAfterSwap.type).to.be.equal("success");
    let msgOut = (sendGetExpectedAfterSwap.actionList[1] as SendMsgAction).message;
    expect(msgOut.info.dest?.toString()).to.be.equal(randomAddress("someone").toString());
    let msgOutBody = msgOut.body.beginParse();
    msgOutBody.skip(32 + 64);
    // @ts-ignore
    expect(msgOutBody.readCoins()).to.be.a.bignumber.that.is.below(receivedToken);
  });

  it("should send back token when reject swap", async () => {
    setBalance(contract, toNano(5));
    contract.setDataCell(
      pool.data({
        routerAddress: routerAddress,
        lpFee: new BN(20),
        protocolFee: new BN(0),
        refFee: new BN(10),
        protocolFeesAddress: randomAddress("a valid protocol fee address"),
        collectedTokenAProtocolFees: new BN(0),
        collectedTokenBProtocolFees: new BN(0),
        wallet0: randomAddress("wallet0"),
        wallet1: randomAddress("wallet1"),
        reserve0: new BN(1000),
        reserve1: new BN(10000),
        supplyLP: new BN(0),
        LPWalletCode: Cell.fromBoc(fs.readFileSync("build/lp_wallet.cell"))[0],
        LPAccountCode: Cell.fromBoc(fs.readFileSync("build/lp_account.cell"))[0],
      })
    );

    const send = await contract.sendInternalMessage(
      internalMessage({
        from: routerAddress,
        value: toNano(0.1),
        body: pool.swap({
          fromAddress: randomAddress("user1"),
          jettonAmount: new BN("20"),
          tokenWallet: randomAddress("wallet1"),
          minOutput: new BN("20000000"),
          toAddress: randomAddress("to"),
        }),
      })
    );

    expect(send.type).to.be.equal("success");
    expect(send.actionList.length).to.be.equal(1);
    expect(send.actionList[0].type).to.be.equal("send_msg");

    let msgOut = (send.actionList[0] as SendMsgAction).message;
    expect(msgOut.info.dest?.toString()).to.be.equal(routerAddress.toString());

    let tokenOut = msgOut.body.beginParse().readRef();
    expect(tokenOut.readCoins().toString()).to.be.equal("0");
    expect(tokenOut.readAddress()?.toString()).to.be.equal(randomAddress("wallet0").toString());
    expect(tokenOut.readCoins().toString()).to.be.equal("20");
    expect(tokenOut.readAddress()?.toString()).to.be.equal(randomAddress("wallet1").toString());

  });

  it("should swap with referall", async () => {
    setBalance(contract, toNano(5));
    setNetworkConfig(contract);
    contract.setDataCell(
      pool.data({
        routerAddress: routerAddress,
        lpFee: new BN(20),
        protocolFee: new BN(0),
        refFee: new BN(10),
        protocolFeesAddress: randomAddress("a valid protocol fee address"),
        collectedTokenAProtocolFees: new BN(0),
        collectedTokenBProtocolFees: new BN(0),
        wallet0: randomAddress("wallet0"),
        wallet1: randomAddress("wallet1"),
        reserve0: new BN("1000000000000000000000000000000000"),
        reserve1: new BN("1000000000000000000000000000000000"),
        supplyLP: new BN(100000),
        LPWalletCode: Cell.fromBoc(fs.readFileSync("build/lp_wallet.cell"))[0],
        LPAccountCode: Cell.fromBoc(fs.readFileSync("build/lp_account.cell"))[0],
      })
    );

    const sendWithRef = await contract.sendInternalMessage(
      internalMessage({
        from: routerAddress,
        value: toNano(1),
        body: pool.swap({
          fromAddress: randomAddress("user1"),
          jettonAmount: new BN("20000"),
          tokenWallet: randomAddress("wallet1"),
          minOutput: new BN("0"),
          toAddress: randomAddress("user1"),
          hasRef: true,
          refAddress: randomAddress("ref"),
        }),
      })
    );
    expect(sendWithRef.type).to.be.equal("success");
    expect(sendWithRef.actionList.length).to.be.equal(2);
    expect(sendWithRef.actionList[0].type).to.be.equal("send_msg");
    expect(sendWithRef.actionList[1].type).to.be.equal("send_msg");

    let msgOutUser = (sendWithRef.actionList[1] as SendMsgAction).message;
    expect(msgOutUser.info.dest?.toString()).to.be.equal(routerAddress.toString());

    let tokenOutUser = msgOutUser.body.beginParse().readRef();
    expect(tokenOutUser.readCoins()).to.be.a.bignumber.that.is.equal(new BN(19939));
    expect(tokenOutUser.readAddress()?.toString()).to.be.equal(randomAddress("wallet0").toString());

    let msgOutRef = (sendWithRef.actionList[0] as SendMsgAction).message;
    expect(msgOutRef.info.dest?.toString()).to.be.equal(routerAddress.toString());

    let tokenOutRef = msgOutRef.body.beginParse().readRef();
    expect(tokenOutRef.readCoins()).to.be.a.bignumber.that.is.equal(new BN(20));
    expect(tokenOutRef.readAddress()?.toString()).to.be.equal(randomAddress("wallet0").toString());
  });

  it("should generate a valid jetton URI", async () => {
    let anotherAddress = randomAddress("another address");
    contract.setC7(
      buildC7({
        myself: anotherAddress,
      })
    );
    const call2 = await contract.invokeGetMethod("get_jetton_data", []);
    expect(parseUri(call2.result[3] as Cell)).to.be.equal("https://lp.ston.fi/" + anotherAddress.toString().toUpperCase() + ".json");
  });
});
