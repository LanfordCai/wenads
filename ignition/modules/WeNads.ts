import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("WeNads", (m) => {
  // First deploy the component contract
  const weNadsComponent = m.contract("WeNadsComponent");

  // Deploy utils contract with component address
  const weNadsUtils = m.contract("WeNadsUtils", [weNadsComponent]);

  // Deploy main contract with component and utils addresses
  const weNads = m.contract("WeNads", [weNadsComponent, weNadsUtils]);

  // Set WeNads contract address in component contract
  m.call(weNadsComponent, "setWeNadsContract", [weNads]);

  return { weNadsComponent, weNadsUtils, weNads };
}); 