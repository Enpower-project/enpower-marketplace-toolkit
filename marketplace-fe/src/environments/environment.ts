export const environment = {
  production: false,
  keycloakUrl: 'https://auth.enpower.comsensus.eu',
  apiGatewayUrl: 'http://localhost:3000',
  apiUrl: 'http://localhost:3000',
  featureFlagX: true,
  keycloakRealm: 'enpower-marketplace',
  keycloakClientId: 'frontend',

  // Blockchain configuration
  rpcProviderUrl: 'http://127.0.0.1:8545',
  contracts: {
    FLEXIBILITY_TOKEN: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    PARTICIPANT_REGISTRY: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
    TREASURY: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
    FLEXIBILITY_NFT: '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9',
    MARKET_FACTORY: '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707',
  }
};
