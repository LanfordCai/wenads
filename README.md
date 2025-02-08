# WeNads

WeNads is a Soulbound Token (SBT) collection with a unique twist: each wallet address is entitled to only one NFT. Breaking away from traditional SBT constraints, WeNads empowers you to customize your avatar's components whenever inspiration strikes! What sets us apart? Each component exists as a tradeable NFT, and here's what makes it special: you can design, mint, and market your own component templates, fostering a genuinely community-driven ecosystem. Best of all, every asset lives permanently on-chain!🔥

This repo is for smart contracts

## Project Structure

```
├── contracts/          # Smart contracts
├── test/              # Test files
├── ignition/          # Ignition deployment modules
├── scripts/           # Deployment and interaction scripts
└── hardhat.config.ts  # Hardhat configuration
```

## Testing

To run the test suite:

```shell
npx hardhat test
```

## Deployment

To deploy the contract to a local network:

1. Start a local node:
```shell
npx hardhat node
```

2. Deploy using Ignition:
```shell
npx hardhat ignition deploy ./ignition/modules/Lock.ts
```

## License

This project is licensed under the MIT License.