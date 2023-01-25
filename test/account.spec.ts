import chai, { expect, use } from "chai";
import chaiBN from "chai-bn";
import BN from "bn.js";
chai.use(chaiBN(BN));

import * as fs from "fs";
import { Cell, beginCell, Address, toNano, Slice } from "ton";
import { SmartContract, buildC7, SendMsgAction } from "ton-contract-executor";
import * as lp_account from "../contracts/lp_account";
import { internalMessage, randomAddress, setBalance, parseUri } from "./helpers";

describe("lp_account tests", () => {
    let contract: SmartContract,
        pool: Address,
        user: Address;

    beforeEach(async () => {
        pool = randomAddress("pool");
        user = randomAddress("user");
        contract = await SmartContract.fromCell(
            Cell.fromBoc(fs.readFileSync("build/lp_account.cell"))[0],
            lp_account.data({
                user: user,
                pool: pool,
                stored0: toNano(0),
                stored1: toNano(0),
            })
        );
    });

    it("should reset gas", async () => {
        setBalance(contract, toNano(5));

        const sendWrongAddress = await contract.sendInternalMessage(
            internalMessage({
                from: randomAddress("someone"),
                value: toNano(7000000000),
                body: lp_account.resetGas(),
            })
        );

        expect(sendWrongAddress.type).to.be.equal("failed");
        expect(sendWrongAddress.actionList.length).to.equal(0);

        const send = await contract.sendInternalMessage(
            internalMessage({
                from: user,
                value: toNano(7000000000),
                body: lp_account.resetGas(),
            })
        );

        expect(send.type).to.be.equal("success");
        expect(send.actionList.length).to.equal(1);
    });

    it("should store new liquidity and ask for minting", async () => {
        const sendWrongSender = await contract.sendInternalMessage(
            internalMessage({
                from: user,
                value: toNano(7000000000),
                body: lp_account.addLiquidity({
                    newAmount0: toNano(1),
                    newAmount1: toNano(0),
                    minLPOut: toNano(1),
                }),
            })
        );
        expect(sendWrongSender.type).to.be.equal("failed");

        const send = await contract.sendInternalMessage(
            internalMessage({
                from: pool,
                value: toNano(7000000000),
                body: lp_account.addLiquidity({
                    newAmount0: toNano(1),
                    newAmount1: toNano(0),
                    minLPOut: toNano(1),
                }),
            })
        );

        expect(send.type).to.be.equal("success");
        expect(send.actionList.length).to.equal(0);


        const sendCB = await contract.sendInternalMessage(
            internalMessage({
                from: pool,
                value: toNano(7000000000),
                body: lp_account.addLiquidity({
                    newAmount0: toNano(0),
                    newAmount1: toNano(10),
                    minLPOut: toNano(1),
                }),
            })
        );

        expect(sendCB.type).to.be.equal("success");
        expect(sendCB.actionList.length).to.equal(1);

        const sendRefund = await contract.sendInternalMessage(
            internalMessage({
                from: pool,
                value: toNano(7000000000),
                body: lp_account.addLiquidity({
                    newAmount0: toNano(0),
                    newAmount1: toNano(10),
                    minLPOut: toNano(0),
                }),
            })
        );

        expect(sendRefund.type).to.be.equal("success");
        expect(sendRefund.actionList.length).to.equal(0);

    });

    it("should ask for minting new liquidity directly", async () => {
        const sendWrongSender = await contract.sendInternalMessage(
            internalMessage({
                from: randomAddress("someone"),
                value: toNano(7000000000),
                body: lp_account.directAddLiquidity({
                    amount0: toNano(1),
                    amount1: toNano(0),
                    minLPOut: toNano(1),
                }),
            })
        );
        expect(sendWrongSender.type).to.be.equal("failed");

        const sendLowBalances = await contract.sendInternalMessage(
            internalMessage({
                from: user,
                value: toNano(7000000000),
                body: lp_account.directAddLiquidity({
                    amount0: toNano(1),
                    amount1: toNano(0),
                    minLPOut: toNano(1),
                }),
            })
        );
        expect(sendLowBalances.type).to.be.equal("failed");

        setBalance(contract, toNano(5));
        contract.setDataCell(
            lp_account.data({
                stored0: toNano(10),
                stored1: toNano(10),
                user: user,
                pool: pool,
            })
        );

        const send = await contract.sendInternalMessage(
            internalMessage({
                from: user,
                value: toNano(7000000000),
                body: lp_account.directAddLiquidity({
                    amount0: toNano(1),
                    amount1: toNano(3),
                    minLPOut: toNano(1),
                }),
            })
        );

        expect(send.type).to.be.equal("success");
        expect(send.actionList.length).to.equal(1);
    });


    it("should refund user", async () => {
        const sendWrongSender = await contract.sendInternalMessage(
            internalMessage({
                from: randomAddress("someone"),
                value: toNano(7000000000),
                body: lp_account.refundMe(),
            })
        );
        expect(sendWrongSender.type).to.be.equal("failed");

        const sendLowBalances = await contract.sendInternalMessage(
            internalMessage({
                from: user,
                value: toNano(7000000000),
                body: lp_account.refundMe(),
            })
        );
        expect(sendLowBalances.type).to.be.equal("failed");

        setBalance(contract, toNano(5));
        contract.setDataCell(
            lp_account.data({
                stored0: toNano(10),
                stored1: toNano(10),
                user: user,
                pool: pool,
            })
        );

        const send = await contract.sendInternalMessage(
            internalMessage({
                from: user,
                value: toNano(7000000000),
                body: lp_account.refundMe(),
            })
        );

        expect(send.type).to.be.equal("success");
        expect(send.actionList.length).to.equal(1);
    });
});