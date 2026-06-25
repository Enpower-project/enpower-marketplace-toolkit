import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: process.env.HARDHAT_RPC_URL || "http://127.0.0.1:8545",
      chainId: 31337,
    },
    ...(process.env.REMOTE_RPC_URL && process.env.DEPLOYER_PRIVATE_KEY
      ? {
          remoteNode: {
            url: process.env.REMOTE_RPC_URL,
            accounts: [process.env.DEPLOYER_PRIVATE_KEY],
          },
        }
      : {}),
  },
};

export default config;
