import hre from "hardhat";

export async function deployContract(contractName: string, args: any[] = []) {
  const publicClient = await hre.viem.getPublicClient();
  const [deployer] = await hre.viem.getWalletClients();
  
  const contract = await hre.viem.deployContract(contractName, args);
  
  return {
    contract,
    waitForTransactionReceipt: publicClient.waitForTransactionReceipt
  };
} 