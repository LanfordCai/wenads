import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";
import "@nomicfoundation/hardhat-ignition";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      viaIR: true
    }
  },
  networks: {
    monadDevnet: {
      url: "https://rpc-devnet.monadinfra.com/rpc/3fe540e310bbb6ef0b9f16cd23073b0a",
      chainId: 20143,
      accounts: [process.env.PRIVATE_KEY as string]
    },
    hardhat: {
      mining: {
        auto: true,
        interval: 5000
      }
    }
  }
};

export default config;
