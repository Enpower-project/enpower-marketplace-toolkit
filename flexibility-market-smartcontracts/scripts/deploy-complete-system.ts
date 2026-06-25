import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Core Infrastructure Deployment Script for Flexibility Marketplace
 *
 * Deploys only the core contracts:
 * - FlexibilityToken (ERC-20)
 * - Treasury
 * - FlexibilityNFT (ERC-1155)
 * - ParticipantRegistry
 * - MarketFactory
 *
 * Markets will be created from the frontend UI using MarketFactory
 * Participants will be registered from the backend/frontend
 */

async function main() {
  console.log("Starting core infrastructure deployment...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  // ==========================================
  // STEP 1: Deploy Core Infrastructure
  // ==========================================
  console.log("📦 Step 1: Deploying Core Infrastructure...");

  // Deploy FlexibilityToken (ERC-20)
  console.log("  Deploying FlexibilityToken...");
  const FlexTokenFactory = await ethers.getContractFactory("FlexibilityToken");
  const flexToken = await FlexTokenFactory.deploy(); // No constructor parameters
  await flexToken.waitForDeployment();
  const flexTokenAddress = await flexToken.getAddress();
  console.log("  ✅ FlexibilityToken deployed at:", flexTokenAddress);

  // Mint initial supply (deployer has MINTER_ROLE by default)
  console.log("  Minting initial token supply...");
  const INITIAL_SUPPLY = ethers.parseEther("1000000"); // 1M tokens
  await flexToken.mint(deployer.address, INITIAL_SUPPLY);
  console.log("  ✅ Minted", ethers.formatEther(INITIAL_SUPPLY), "FLEX tokens to deployer");

  // Deploy ParticipantRegistry
  console.log("  Deploying ParticipantRegistry...");
  const RegistryFactory = await ethers.getContractFactory("ParticipantRegistry");
  const registry = await RegistryFactory.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("  ✅ ParticipantRegistry deployed at:", registryAddress);

  // Deploy Treasury
  console.log("  Deploying Treasury...");
  const TreasuryFactory = await ethers.getContractFactory("Treasury");
  const platformAdmin = deployer.address; // In production, use dedicated address
  const treasury = await TreasuryFactory.deploy(flexTokenAddress, platformAdmin);
  await treasury.waitForDeployment();
  const treasuryAddress = await treasury.getAddress();
  console.log("  ✅ Treasury deployed at:", treasuryAddress);

  // Deploy FlexibilityNFT (ERC-1155)
  console.log("  Deploying FlexibilityNFT...");
  const NFTFactory = await ethers.getContractFactory("FlexibilityNFT");
  const nft = await NFTFactory.deploy();
  await nft.waitForDeployment();
  const nftAddress = await nft.getAddress();
  console.log("  ✅ FlexibilityNFT deployed at:", nftAddress);

  // Deploy MarketFactory (now requires ParticipantRegistry address)
  console.log("  Deploying MarketFactory...");
  const FactoryContract = await ethers.getContractFactory("MarketFactory");
  const factory = await FactoryContract.deploy(registryAddress); // Pass ParticipantRegistry address
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("  ✅ MarketFactory deployed at:", factoryAddress);
  console.log("  ℹ️  Linked to ParticipantRegistry:", registryAddress);

  console.log("\n✅ Core infrastructure deployed successfully!\n");

  // ==========================================
  // STEP 2: Copy ABIs to Backend
  // ==========================================
  console.log("📦 Step 2: Copying ABIs to Backend...\n");

  const backendContractsPath = path.join(__dirname, "..", "..", "marketplace-be", "src", "contracts");
  const artifactsPath = path.join(__dirname, "..", "artifacts", "contracts");

  // Create backend contracts directory if it doesn't exist
  if (!fs.existsSync(backendContractsPath)) {
    fs.mkdirSync(backendContractsPath, { recursive: true });
    console.log("  ✅ Created backend contracts directory");
  }

  // List of contracts to copy
  const contractsToCopy = [
    { name: "FlexibilityToken", path: "FlexibilityToken.sol/FlexibilityToken.json" },
    { name: "Treasury", path: "Treasury.sol/Treasury.json" },
    { name: "FlexibilityNFT", path: "FlexibilityNFT.sol/FlexibilityNFT.json" },
    { name: "ParticipantRegistry", path: "ParticipantRegistry.sol/ParticipantRegistry.json" },
    { name: "MarketFactory", path: "MarketFactory.sol/MarketFactory.json" },
    { name: "Market", path: "Market.sol/Market.json" },
    { name: "MarketSession", path: "MarketSession.sol/MarketSession.json" },
  ];

  // Copy each contract ABI
  for (const contract of contractsToCopy) {
    const sourcePath = path.join(artifactsPath, contract.path);
    const destPath = path.join(backendContractsPath, `${contract.name}.json`);

    try {
      const artifact = JSON.parse(fs.readFileSync(sourcePath, "utf8"));

      // Create a simplified version with just ABI and bytecode
      const contractData = {
        contractName: contract.name,
        abi: artifact.abi,
        bytecode: artifact.bytecode,
      };

      fs.writeFileSync(destPath, JSON.stringify(contractData, null, 2));
      console.log(`  ✅ Copied ${contract.name}.json`);
    } catch (error) {
      console.error(`  ❌ Error copying ${contract.name}:`, error);
    }
  }

  console.log("\n✅ ABIs copied to backend successfully!\n");

  // ==========================================
  // STEP 3: Update contractsInfo.ts
  // ==========================================
  console.log("📦 Step 3: Updating contractsInfo.ts...\n");

  const contractsInfoPath = path.join(backendContractsPath, "contractsInfo.ts");
  const contractsInfoContent = `export const FlexibilityTokenAddress = "${flexTokenAddress}";
export const ParticipantRegistryAddress = "${registryAddress}";
export const TreasuryAddress = "${treasuryAddress}";
export const FlexibilityNFTAddress = "${nftAddress}";
export const MarketFactoryAddress = "${factoryAddress}";
`;

  fs.writeFileSync(contractsInfoPath, contractsInfoContent);
  console.log("  ✅ contractsInfo.ts updated with deployment addresses\n");

  // ==========================================
  // STEP 4: Update .env file
  // ==========================================
  console.log("📦 Step 4: Updating .env file...\n");

  const envPath = path.join(__dirname, "..", "..", "marketplace-be", ".env");
  const network = await ethers.provider.getNetwork();
  const networkName = network.name === "unknown" ? "localhost" : network.name;

  // Determinar la URL del RPC según la red
  let rpcUrl = "http://127.0.0.1:8545"; // Default para localhost
  if (networkName === "localhost" || network.chainId === 31337n) {
    rpcUrl = "http://127.0.0.1:8545";
  }

  // Leer el archivo .env actual si existe
  let envContent = "";
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, "utf8");
  }

  // Función para actualizar o agregar una variable de entorno
  const updateEnvVariable = (content: string, key: string, value: string): string => {
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(content)) {
      return content.replace(regex, `${key}=${value}`);
    } else {
      return content + `\n${key}=${value}`;
    }
  };

  // Actualizar las variables necesarias
  const timestamp = new Date().toISOString();
  envContent = updateEnvVariable(envContent, "FLEXIBILITY_TOKEN_ADDRESS", flexTokenAddress);
  envContent = updateEnvVariable(envContent, "PARTICIPANT_REGISTRY_ADDRESS", registryAddress);
  envContent = updateEnvVariable(envContent, "TREASURY_ADDRESS", treasuryAddress);
  envContent = updateEnvVariable(envContent, "FLEXIBILITY_NFT_ADDRESS", nftAddress);
  envContent = updateEnvVariable(envContent, "MARKET_FACTORY_ADDRESS", factoryAddress);
  envContent = updateEnvVariable(envContent, "RPC_PROVIDER_URL", rpcUrl);
  envContent = updateEnvVariable(envContent, "ADMIN_PK", "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
  envContent = updateEnvVariable(envContent, "CONTRACTS_LAST_UPDATED", timestamp);

  // Escribir el archivo .env actualizado
  fs.writeFileSync(envPath, envContent.trim() + "\n");
  console.log("  ✅ .env file updated with deployment addresses\n");
  console.log(`  Network: ${networkName} (Chain ID: ${network.chainId})`);
  console.log(`  RPC URL: ${rpcUrl}\n`);

  // ==========================================
  // STEP 5: Summary and Save Deployment Info
  // ==========================================
  console.log("=" .repeat(60));
  console.log("📊 DEPLOYMENT SUMMARY");
  console.log("=" .repeat(60));
  console.log("\n🔧 Core Contracts:");
  console.log("  FlexibilityToken:       ", flexTokenAddress);
  console.log("  ParticipantRegistry:    ", registryAddress);
  console.log("  Treasury:               ", treasuryAddress);
  console.log("  FlexibilityNFT:         ", nftAddress);
  console.log("  MarketFactory:          ", factoryAddress);

  console.log("\n📦 Contract ABIs:");
  console.log("  Location:                marketplace-be/src/contracts/");
  console.log("  Files copied:            7 contracts (FlexibilityToken, Treasury, FlexibilityNFT,");
  console.log("                           ParticipantRegistry, MarketFactory, Market, MarketSession)");
  console.log("  contractsInfo.ts:        Updated with all contract addresses");

  console.log("\n⚙️  Backend Configuration:");
  console.log("  .env file:               Updated automatically");
  console.log("  RPC_PROVIDER_URL:        " + rpcUrl);
  console.log("  Network:                 " + networkName);

  console.log("\n💰 Initial Token Supply:");
  console.log("  Total Supply:            ", ethers.formatEther(INITIAL_SUPPLY), "FLEX");
  console.log("  Deployer Balance:        ", ethers.formatEther(await flexToken.balanceOf(deployer.address)), "FLEX");

  console.log("\n📋 Next Steps (from Frontend/Backend):");
  console.log("\n  1. Register Participants (via ParticipantRegistry):");
  console.log("     - Use registerParticipant(address, type, name, region)");
  console.log("     - Types: 0=MARKETPLACE_ADMIN, 2=FMO_LMO, 3=FRP, 4=FSP");
  console.log("     - Then qualify them: qualifyParticipant(address)");

  console.log("\n  2. Create Markets (via MarketFactory from Frontend):");
  console.log("     - Use createMarket(communityId, region, fmoLmoAddress)");
  console.log("     - FMO/LMO will own the created Market");

  console.log("\n  3. Configure Market:");
  console.log("     - Set ParticipantRegistry: market.setParticipantRegistry(registryAddress)");

  console.log("\n💡 Important Notes:");
  console.log("  ✅ ABIs are available in marketplace-be/src/contracts/ for backend integration");
  console.log("  ✅ Contract addresses updated in marketplace-be/src/contracts/contractsInfo.ts");
  console.log("  ✅ Backend .env file updated automatically with contract addresses");
  console.log("  ✅ Use MarketFactory from frontend to create markets dynamically");
  console.log("  ✅ Markets and participants will be managed from UI/Backend");
  console.log("  ✅ Deployer has MINTER_ROLE for FlexibilityToken (can mint more if needed)");

  console.log("\n" + "=".repeat(60));
  console.log("🎉 Deployment Complete!");
  console.log("=" .repeat(60) + "\n");

  // Save deployment addresses to file
  const deployment = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      FlexibilityToken: flexTokenAddress,
      ParticipantRegistry: registryAddress,
      Treasury: treasuryAddress,
      FlexibilityNFT: nftAddress,
      MarketFactory: factoryAddress,
    },
    initialTokenSupply: ethers.formatEther(INITIAL_SUPPLY) + " FLEX",
    abisLocation: "marketplace-be/src/contracts/",
    contractsInfoUpdated: true,
    envFileUpdated: true,
    rpcUrl: rpcUrl,
  };

  const deploymentPath = path.join(__dirname, "..", "deployments", `deployment-${Date.now()}.json`);
  fs.mkdirSync(path.join(__dirname, "..", "deployments"), { recursive: true });
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));

  console.log(`📄 Deployment info saved to: ${deploymentPath}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
