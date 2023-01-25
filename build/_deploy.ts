import axios from "axios";
import axiosThrottle from "axios-request-throttle";
axiosThrottle.use(axios, { requestsPerSecond: 0.5 });

import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import glob from "fast-glob";
import { Address, Cell, CellMessage, CommonMessageInfo, fromNano, InternalMessage, StateInit, toNano } from "ton";
import { TonClient, WalletContract, WalletV3R2Source, contractAddress, SendMode } from "ton";
import { mnemonicNew, mnemonicToWalletKey } from "ton-crypto";

async function main() {
  console.log(`=================================================================`);
  console.log(`Deploy script running, let's find some contracts to deploy..`);

  let chain: string,
    endpointUrl: string;
  if (process.env.TESTNET || process.env.npm_lifecycle_event == "deploy:testnet") {
    console.log(`\n* We are working with 'testnet' (https://t.me/testgiver_ton_bot will give you testnet TON)`);
    endpointUrl = "https://testnet.toncenter.com/api/v2/jsonRPC";
  } else {
    console.log(`\n* We are working with 'mainnet'`);
    endpointUrl = "https://mainnet.tonhubapi.com/jsonRPC";
  }

  // initialize globals
  const client = new TonClient({ endpoint: endpointUrl, apiKey: process.env.API_KEY });
  const newContractFunding = toNano(0.1); // this will be (almost in full) the balance of a new deployed contract and allow it to pay rent
  const workchain = 0;

  const deployConfigEnv = ".env";
  let deployerMnemonic;
  if (!process.env.DEPLOYER_MNEMONIC) {
    console.log(` - ERROR: No DEPLOYER_MNEMONIC env variable found, please add it to env`);
    process.exit(1);
  } else {
    console.log(`\n* Config file '${deployConfigEnv}' found and will be used for deployment!`);
    deployerMnemonic = process.env.DEPLOYER_MNEMONIC;
  }

  // open the wallet and make sure it has enough TON
  const walletKey = await mnemonicToWalletKey(deployerMnemonic.split(" "));
  const walletContract = WalletContract.create(client, WalletV3R2Source.create({ publicKey: walletKey.publicKey, workchain }));
  console.log(` - Wallet address used to deploy from is: ${walletContract.address.toFriendly()}`);
  const walletBalance = await client.getBalance(walletContract.address);
  await sleep(3 * 1000);
  if (walletBalance.lt(toNano(0.2))) {
    console.log(` - ERROR: Wallet has less than 0.2 TON for gas (${fromNano(walletBalance)} TON), please send some TON for gas first`);
    process.exit(1);
  } else {
    console.log(` - Wallet balance is ${fromNano(walletBalance)} TON, which will be used for gas`);
  }

  const rootContracts = glob.sync(["build/*.deploy.ts"]);
  for (const rootContract of rootContracts) {
    console.log(`\n* Found root contract '${rootContract} - let's deploy it':`);
    const contractName = path.parse(path.parse(rootContract).name).name;

    const deployInitScript = require(__dirname + "/../" + rootContract);
    if (typeof deployInitScript.initData !== "function") {
      console.log(` - ERROR: '${rootContract}' does not have 'initData()' function`);
      process.exit(1);
    }
    const initDataCell = deployInitScript.initData() as Cell;

    if (typeof deployInitScript.initMessage !== "function") {
      console.log(` - ERROR: '${rootContract}' does not have 'initMessage()' function`);
      process.exit(1);
    }
    const initMessageCell = deployInitScript.initMessage() as Cell | null;

    const cellArtifact = `build/${contractName}.cell`;
    if (!fs.existsSync(cellArtifact)) {
      console.log(` - ERROR: '${cellArtifact}' not found, did you build?`);
      process.exit(1);
    }
    const initCodeCell = Cell.fromBoc(fs.readFileSync(cellArtifact))[0];

    const newContractAddress = contractAddress({ workchain, initialData: initDataCell, initialCode: initCodeCell });
    console.log(` - Based on your init code+data, your new contract address is: ${newContractAddress.toFriendly()}`);
    if (await client.isContractDeployed(newContractAddress)) {
      console.log(` - Looks like the contract is already deployed in this address, skipping deployment`);
      continue;
    }
    await sleep(2000);

    console.log(` - Let's deploy the contract on-chain..`);
    const seqno = await walletContract.getSeqNo();
    await sleep(2000);

    const transfer = walletContract.createTransfer({
      secretKey: walletKey.secretKey,
      seqno: seqno,
      sendMode: SendMode.PAY_GAS_SEPARATLY + SendMode.IGNORE_ERRORS,
      order: new InternalMessage({
        to: newContractAddress,
        value: newContractFunding,
        bounce: false,
        body: new CommonMessageInfo({
          stateInit: new StateInit({ data: initDataCell, code: initCodeCell }),
          body: initMessageCell !== null ? new CellMessage(initMessageCell) : null,
        }),
      }),
    });
    await client.sendExternalMessage(walletContract, transfer);
    await sleep(1000);
    console.log(` - Deploy transaction sent successfully`);

    console.log(` - Waiting up to 75 seconds to check if the contract was actually deployed..`);
    for (let attempt = 0; attempt < 30; attempt++) {
      await sleep(2500);
      const seqnoAfter = await walletContract.getSeqNo();
      if (seqnoAfter > seqno) break;
    }
    await sleep(5 * 1000);
    if (await client.isContractDeployed(newContractAddress)) {
      console.log(` - SUCCESS! Contract deployed successfully to address: ${newContractAddress.toFriendly()}`);
      await sleep(1000);
      const contractBalance = await client.getBalance(newContractAddress);
      console.log(` - New contract balance is now ${fromNano(contractBalance)} TON, make sure it has enough to pay rent`);
    } else {
      console.log(` - FAILURE! Contract address still looks uninitialized: ${newContractAddress.toFriendly()}`);
    }
  }

  console.log(``);
}

main();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
