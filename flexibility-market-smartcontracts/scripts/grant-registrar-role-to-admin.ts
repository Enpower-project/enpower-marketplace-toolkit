import { ethers } from "hardhat";

/**
 * Script to grant REGISTRAR_ROLE to the admin wallet in ParticipantRegistry
 * This allows the backend admin wallet to register and qualify participants
 */

async function main() {
  console.log("Starting REGISTRAR_ROLE grant process...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Executing with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  // Admin wallet address (from ADMIN_PK in .env)
  const adminWalletAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

  // ParticipantRegistry address (update this with your deployed address)
  const PARTICIPANT_REGISTRY_ADDRESS = '0x35D2F51DBC8b401B11fA3FE04423E0f5cd9fEDb4';

  if (!PARTICIPANT_REGISTRY_ADDRESS) {
    throw new Error("PARTICIPANT_REGISTRY_ADDRESS not found in environment");
  }

  console.log("ParticipantRegistry address:", PARTICIPANT_REGISTRY_ADDRESS);
  console.log("Admin wallet address:", adminWalletAddress);
  console.log("");

  // Get ParticipantRegistry contract
  const ParticipantRegistry = await ethers.getContractFactory("ParticipantRegistry");
  const registry = ParticipantRegistry.attach(PARTICIPANT_REGISTRY_ADDRESS) as any;

  // REGISTRAR_ROLE hash
  const REGISTRAR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("REGISTRAR_ROLE"));
  console.log("REGISTRAR_ROLE hash:", REGISTRAR_ROLE);

  // Check if admin already has the role - use explicit function signature
  const hasRole = await registry["hasRole(bytes32,address)"](REGISTRAR_ROLE, adminWalletAddress);

  if (hasRole) {
    console.log("✅ Admin wallet already has REGISTRAR_ROLE");
  } else {
    console.log("⚠️  Admin wallet does NOT have REGISTRAR_ROLE");
    console.log("Granting REGISTRAR_ROLE to admin wallet...");

    const grantRoleTx = await registry["grantRole(bytes32,address)"](REGISTRAR_ROLE, adminWalletAddress);
    console.log("Transaction sent:", grantRoleTx.hash);

    const receipt = await grantRoleTx.wait();
    console.log("✅ REGISTRAR_ROLE granted successfully!");
    console.log("Transaction confirmed in block:", receipt.blockNumber);

    // Verify
    const hasRoleAfter = await registry["hasRole(bytes32,address)"](REGISTRAR_ROLE, adminWalletAddress);
    console.log("Verification - Admin has REGISTRAR_ROLE:", hasRoleAfter);
  }

  console.log("\n🎉 Script completed successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
