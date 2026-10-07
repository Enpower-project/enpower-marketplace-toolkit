import * as fs from "fs";

const deploymentsPath =
  process.env.DEPLOYMENTS_PATH || "/shared/deployments.json";

if (!fs.existsSync(deploymentsPath)) {
  throw new Error(
    `❌ deployments.json no encontrado en ${deploymentsPath}`
  );
}

const deployments = JSON.parse(
  fs.readFileSync(deploymentsPath, "utf8")
);

export const CONTRACT_ADDRESSES = {
  FlexibilityToken: deployments.FlexibilityToken,
  Treasury: deployments.Treasury,
  FlexibilityNFT: deployments.FlexibilityNFT,
  ParticipantRegistry: deployments.ParticipantRegistry,
  MarketFactory: deployments.MarketFactory,
};
