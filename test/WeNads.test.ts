import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { getAddress } from "viem";
import { deployContract } from "./utils/deploy";
import { Avatar, Template} from "./utils/types";
import hre from "hardhat";

describe("WeNads", function () {
  async function deployWeNadsFixture() {
    const [owner, creator, buyer] = await hre.viem.getWalletClients();
    const publicClient = await hre.viem.getPublicClient();
    
    // Deploy component contract first
    const { contract: componentContract, waitForTransactionReceipt } = await deployContract("WeNadsComponent");
    
    // Deploy utils contract
    const { contract: utilsContract } = await deployContract("WeNadsUtils", [componentContract.address]);

    // Deploy WeNads with both contract addresses
    const { contract: weNadsContract } = await deployContract("WeNads", [
      componentContract.address,
      utilsContract.address
    ]);

    // Set WeNads contract address in component contract
    const tx = await componentContract.write.setWeNadsContract(
      [weNadsContract.address],
      { account: owner.account.address }
    );
    await waitForTransactionReceipt({ hash: tx });

    // Create template for each component type
    const templateCreationPrice = await componentContract.read.templateCreationPrice();
    const mintPrice = 2000000000000000n; // 0.01 ETH
    const templates = [];

    // Real image data for each component type (truncated for readability)
    const backgroundImage = "iVBORw0KGgoAAAANSUhEUgAAAQAAAAEAAQMA"; // Background PNG data
    const headImage = "iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAMAAABrrF";      // Head PNG data  
    const eyesImage = "iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAMAAABrrF";      // Eyes PNG data
    const mouthImage = "iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAMAAABrr";     // Mouth PNG data
    const accessoryImage = "iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAMAA"; // Accessory PNG data

    const clearBackgroundImage = "AQAAAAEAAQMA";

    const componentImages = [
      backgroundImage,
      headImage, 
      eyesImage,
      mouthImage,
      accessoryImage
    ];

    // Create one template for each component type
    for (let i = 0; i < 5; i++) {
      const tx = await componentContract.write.createTemplate(
        [
          `Component ${i}`,
          100n,
          mintPrice,
          componentImages[i],
          i
        ],
        {
          value: templateCreationPrice,
          account: creator.account.address
        }
      );
      await waitForTransactionReceipt({ hash: tx });
      templates.push(BigInt(i + 1));
    }

    return { 
      weNadsContract,
      componentContract,
      utilsContract,
      owner, 
      creator, 
      buyer,
      publicClient,
      waitForTransactionReceipt,
      templates,
      clearBackgroundImage,
      mintPrice
    };
  }

  describe("Avatar Creation", function () {
    it("Should create an avatar with all components", async function () {
      const { weNadsContract, componentContract, templates, clearBackgroundImage, creator, buyer, mintPrice, waitForTransactionReceipt } = await loadFixture(deployWeNadsFixture);

      const totalCost = mintPrice * 5n;
      const tx = await weNadsContract.write.createAvatar(
        [templates[0], templates[1], templates[2], templates[3], templates[4], "Test Avatar"],
        {
          value: totalCost,
          account: buyer.account.address
        }
      );
      await waitForTransactionReceipt({ hash: tx });

      // Check avatar ownership
      const ownerOf = await weNadsContract.read.ownerOf([1n]);
      expect(ownerOf).to.equal(getAddress(buyer.account.address));

      // Check avatar data
      const avatar = await weNadsContract.read.getAvatar([1n]) as Avatar;
      expect(avatar.name).to.equal("Test Avatar");
      expect(avatar.backgroundId).to.equal(1n);
      expect(avatar.headId).to.equal(2n);
      expect(avatar.eyesId).to.equal(3n);
      expect(avatar.mouthId).to.equal(4n);
      expect(avatar.accessoryId).to.equal(5n);

      // Check component ownership using balanceOf instead of ownerOf
      const balance = await componentContract.read.balanceOf([buyer.account.address, avatar.backgroundId]);
      expect(balance).to.equal(1n);

      const background = await componentContract.read.getTemplate([avatar.backgroundId]) as Template;
      expect(background.name).to.equal("Component 0");
      expect(background.creator).to.equal(getAddress(creator.account.address));
      expect(background.maxSupply).to.equal(100n);
      expect(background.currentSupply).to.equal(1n);
      expect(background.price).to.equal(mintPrice);
      expect(background.imageData).to.equal(clearBackgroundImage);
      expect(background.isActive).to.equal(true);
      expect(background.componentType).to.equal(0);
    });

    it("Should fail if insufficient payment", async function () {
      const { weNadsContract, templates, buyer, mintPrice } = await loadFixture(deployWeNadsFixture);

      const insufficientPayment = mintPrice * 4n; // Only paying for 4 components
      await expect(weNadsContract.write.createAvatar(
        [templates[0], templates[1], templates[2], templates[3], templates[4], "Test Avatar"],
        {
          value: insufficientPayment,
          account: buyer.account.address
        }
      )).to.be.rejectedWith("Insufficient payment");
    });
  });

  describe("Avatar Management", function () {
    it("Should update avatar name", async function () {
      const { weNadsContract, templates, buyer, mintPrice, waitForTransactionReceipt } = await loadFixture(deployWeNadsFixture);

      // Create avatar first
      const createTx = await weNadsContract.write.createAvatar(
        [templates[0], templates[1], templates[2], templates[3], templates[4], "Test Avatar"],
        {
          value: mintPrice * 5n,
          account: buyer.account.address
        }
      );
      await waitForTransactionReceipt({ hash: createTx });

      // Update name
      const updateTx = await weNadsContract.write.updateAvatarName(
        [1n, "New Name"],
        {
          account: buyer.account.address
        }
      );
      await waitForTransactionReceipt({ hash: updateTx });

      const avatar = await weNadsContract.read.getAvatar([1n]) as Avatar;
      expect(avatar.name).to.equal("New Name");
    });

    it("Should change component", async function () {
      const { weNadsContract, componentContract, templates, buyer, mintPrice, waitForTransactionReceipt } = await loadFixture(deployWeNadsFixture);

      // Create avatar
      const createTx = await weNadsContract.write.createAvatar(
        [templates[0], templates[1], templates[2], templates[3], templates[4], "Test Avatar"],
        {
          value: mintPrice * 5n,
          account: buyer.account.address
        }
      );
      await waitForTransactionReceipt({ hash: createTx });

      // Mint a new background component
      const mintTx = await componentContract.write.mintComponent(
        [templates[0], buyer.account.address],
        {
          value: mintPrice,
          account: buyer.account.address
        }
      );
      await waitForTransactionReceipt({ hash: mintTx });

      // Change background component
      const changeTx = await weNadsContract.write.changeComponent(
        [1n, 6n, 0n],
        {
          account: buyer.account.address
        }
      );
      await waitForTransactionReceipt({ hash: changeTx });

      const avatar = await weNadsContract.read.getAvatar([1n]) as Avatar;
      expect(avatar.backgroundId).to.equal(6n);
    });
  });

  describe("Token URI", function () {
    it("Should return correct token URI", async function () {
      const { weNadsContract, templates, buyer, mintPrice, waitForTransactionReceipt } = await loadFixture(deployWeNadsFixture);

      // Create avatar
      const tx = await weNadsContract.write.createAvatar(
        [templates[0], templates[1], templates[2], templates[3], templates[4], "Test Avatar"],
        {
          value: mintPrice * 5n,
          account: buyer.account.address
        }
      );
      await waitForTransactionReceipt({ hash: tx });

      const tokenUri = await weNadsContract.read.tokenURI([1n]);
      expect(tokenUri).to.include("Test Avatar");
      expect(tokenUri).to.include("WeNads Avatar NFT");
    });
  });

  describe("Avatar Transfers", function () {
    it("Should fail to transfer avatar as it is soulbound", async function () {
      const { weNadsContract, templates, buyer, mintPrice, waitForTransactionReceipt } = await loadFixture(deployWeNadsFixture);
      const [,,, newOwner] = await hre.viem.getWalletClients();

      // Create avatar first
      const totalCost = mintPrice * 5n;
      const createTx = await weNadsContract.write.createAvatar(
        [templates[0], templates[1], templates[2], templates[3], templates[4], "Test Avatar"],
        {
          value: totalCost,
          account: buyer.account.address
        }
      );
      await waitForTransactionReceipt({ hash: createTx });

      // Attempt to transfer avatar should fail
      await expect(weNadsContract.write.transferFrom(
        [buyer.account.address, newOwner.account.address, 1n],
        {
          account: buyer.account.address
        }
      )).to.be.rejectedWith("SoulboundTokenCannotBeTransferred");
    });

    it("Should allow burning of avatar and unlock components", async function () {
      const { weNadsContract, componentContract, templates, buyer, mintPrice, waitForTransactionReceipt } = await loadFixture(deployWeNadsFixture);

      // Create avatar first
      const totalCost = mintPrice * 5n;
      const createTx = await weNadsContract.write.createAvatar(
        [templates[0], templates[1], templates[2], templates[3], templates[4], "Test Avatar"],
        {
          value: totalCost,
          account: buyer.account.address
        }
      );
      await waitForTransactionReceipt({ hash: createTx });

      // Get component IDs before burning
      const avatar = await weNadsContract.read.getAvatar([1n]) as Avatar;
      const componentIds = [
        avatar.backgroundId,
        avatar.headId,
        avatar.eyesId,
        avatar.mouthId,
        avatar.accessoryId
      ];

      // Burn the avatar
      const burnTx = await weNadsContract.write.burn(
        [1n],
        {
          account: buyer.account.address
        }
      );
      await waitForTransactionReceipt({ hash: burnTx });

      // Verify avatar is burned
      await expect(weNadsContract.read.ownerOf([1n]))
        .to.be.rejectedWith("ERC721NonexistentToken");

      // Verify components are unlocked
      for (const componentId of componentIds) {
        const isLocked = await componentContract.read.isTokenLocked([componentId]);
        expect(isLocked).to.be.false;
      }
    });

    it("Should not allow non-owner to burn avatar", async function () {
      const { weNadsContract, templates, buyer, mintPrice, waitForTransactionReceipt } = await loadFixture(deployWeNadsFixture);
      const [,,, otherUser] = await hre.viem.getWalletClients();

      // Create avatar
      const createTx = await weNadsContract.write.createAvatar(
        [templates[0], templates[1], templates[2], templates[3], templates[4], "Test Avatar"],
        {
          value: mintPrice * 5n,
          account: buyer.account.address
        }
      );
      await waitForTransactionReceipt({ hash: createTx });

      // Attempt to burn from non-owner should fail
      await expect(weNadsContract.write.burn(
        [1n],
        {
          account: otherUser.account.address
        }
      )).to.be.rejectedWith("Not authorized");
    });
});

  describe("Component Changes", function () {
    it("Should fail to change component with wrong type", async function () {
      const { weNadsContract, componentContract, templates, buyer, mintPrice, waitForTransactionReceipt } = await loadFixture(deployWeNadsFixture);

      // Create avatar
      const createTx = await weNadsContract.write.createAvatar(
        [templates[0], templates[1], templates[2], templates[3], templates[4], "Test Avatar"],
        {
          value: mintPrice * 5n,
          account: buyer.account.address
        }
      );
      await waitForTransactionReceipt({ hash: createTx });

      // Mint a head component (type 1)
      const mintTx = await componentContract.write.mintComponent(
        [templates[1], buyer.account.address],
        {
          value: mintPrice,
          account: buyer.account.address
        }
      );
      await waitForTransactionReceipt({ hash: mintTx });

      // Try to use head component as background (type 0)
      await expect(weNadsContract.write.changeComponent(
        [1n, 6n, 0n], // avatarId, componentId, BACKGROUND type
        {
          account: buyer.account.address
        }
      )).to.be.rejectedWith("Invalid component type");
    });

    it("Should fail to change component if not owned", async function () {
      const { weNadsContract, componentContract, templates, buyer, mintPrice, waitForTransactionReceipt } = await loadFixture(deployWeNadsFixture);
      const [,,, otherUser] = await hre.viem.getWalletClients();

      // Create avatar
      const createTx = await weNadsContract.write.createAvatar(
        [templates[0], templates[1], templates[2], templates[3], templates[4], "Test Avatar"],
        {
          value: mintPrice * 5n,
          account: buyer.account.address
        }
      );
      await waitForTransactionReceipt({ hash: createTx });

      // Mint a background component to other user
      const mintTx = await componentContract.write.mintComponent(
        [templates[0], otherUser.account.address],
        {
          value: mintPrice,
          account: otherUser.account.address
        }
      );
      await waitForTransactionReceipt({ hash: mintTx });

      // Try to use other user's component
      await expect(weNadsContract.write.changeComponent(
        [1n, 6n, 0n],
        {
          account: buyer.account.address
        }
      )).to.be.rejectedWith("Must own component");
    });

    it("Should change multiple components at once", async function () {
      const { weNadsContract, componentContract, templates, buyer, mintPrice, waitForTransactionReceipt } = await loadFixture(deployWeNadsFixture);

      // Create initial avatar
      const createTx = await weNadsContract.write.createAvatar(
        [templates[0], templates[1], templates[2], templates[3], templates[4], "Test Avatar"],
        {
          value: mintPrice * 5n,
          account: buyer.account.address
        }
      );
      await waitForTransactionReceipt({ hash: createTx });

      // Mint new components
      const mintTx1 = await componentContract.write.mintComponent(
        [templates[0], buyer.account.address], // new background
        {
          value: mintPrice,
          account: buyer.account.address
        }
      );
      await waitForTransactionReceipt({ hash: mintTx1 });

      const mintTx2 = await componentContract.write.mintComponent(
        [templates[1], buyer.account.address], // new head
        {
          value: mintPrice,
          account: buyer.account.address
        }
      );
      await waitForTransactionReceipt({ hash: mintTx2 });

      // Change multiple components
      const changeTx = await weNadsContract.write.changeComponents(
        [
          1n,        // avatarId
          6n,        // new backgroundId
          7n,        // new headId
          0n,        // keep existing eyes
          0n,        // keep existing mouth
          0n         // keep existing accessory
        ],
        {
          account: buyer.account.address
        }
      );
      await waitForTransactionReceipt({ hash: changeTx });

      // Verify changes
      const avatar = await weNadsContract.read.getAvatar([1n]) as Avatar;
      expect(avatar.backgroundId).to.equal(6n);
      expect(avatar.headId).to.equal(7n);
      expect(avatar.eyesId).to.equal(3n);    // unchanged
      expect(avatar.mouthId).to.equal(4n);   // unchanged
      expect(avatar.accessoryId).to.equal(5n); // unchanged
    });
  });

  describe("Edge Cases", function () {
    it("Should fail to query non-existent avatar", async function () {
      const { weNadsContract } = await loadFixture(deployWeNadsFixture);

      await expect(weNadsContract.read.tokenURI([999n]))
        .to.be.rejectedWith("ERC721NonexistentToken");
    });

  it("Should refund excess payment when creating avatar", async function () {
    const { weNadsContract, templates, buyer, mintPrice, publicClient, waitForTransactionReceipt } = await loadFixture(deployWeNadsFixture);

    const totalCost = mintPrice * 5n; // Cost for all 5 components
    const excessPayment = totalCost + 1000000000000000000n; // Add 1 ETH extra
    
    // Get initial balance
    const initialBalance = await publicClient.getBalance({address: buyer.account.address});

    // Create avatar with excess payment
    const tx = await weNadsContract.write.createAvatar(
      [templates[0], templates[1], templates[2], templates[3], templates[4], "Test Avatar"],
      {
        value: excessPayment,
        account: buyer.account.address
      }
    );
    const receipt = await waitForTransactionReceipt({ hash: tx });

    // Get final balance
    const finalBalance = await publicClient.getBalance({address: buyer.account.address});
    
    // Calculate gas cost
    const gasUsed = receipt.gasUsed;
    const gasPrice = receipt.effectiveGasPrice;
    const gasCost = gasUsed * gasPrice;

    // Expected balance should be: initial - totalCost - gasCost
    const expectedBalance = initialBalance - totalCost - gasCost;
    
    // Actual balance should be within 0.0001 ETH of expected due to gas estimation variations
    const difference = expectedBalance - finalBalance;
    expect(difference < 10000000000000n).to.be.true; // Difference should be less than 0.0001 ETH
  });

  it("Should fail to get non-existent avatar", async function () {
    const { weNadsContract } = await loadFixture(deployWeNadsFixture);

    await expect(weNadsContract.read.getAvatar([999n]))
        .to.be.rejectedWith("ERC721NonexistentToken");
  });
  });

  describe("Deployment", function () {
    it("Should set the correct utils contract", async function () {
      const { weNadsContract, utilsContract } = await loadFixture(deployWeNadsFixture);
      const utils = await weNadsContract.read.utils() as string;
      expect(getAddress(utils)).to.equal(getAddress(utilsContract.address));
    });
  });

  describe("Complete Avatar Creation and URI", function () {
    it("Should create a complete avatar and return correct tokenURI", async function () {
      const { weNadsContract, componentContract, templates, buyer, mintPrice, waitForTransactionReceipt } = await loadFixture(deployWeNadsFixture);

      // Create avatar with all components
      const totalCost = mintPrice * 5n;
      const avatarName = "Complete Test Avatar";
      const createTx = await weNadsContract.write.createAvatar(
        [
          templates[0], // background
          templates[1], // head
          templates[2], // eyes
          templates[3], // mouth
          templates[4], // accessory
          avatarName
        ],
        {
          value: totalCost,
          account: buyer.account.address
        }
      );
      await waitForTransactionReceipt({ hash: createTx });

      // Get the tokenURI
      const tokenUri = await weNadsContract.read.tokenURI([1n]) as string;

      // Verify URI contains all expected data
      expect(tokenUri).to.include(avatarName);
      expect(tokenUri).to.include("WeNads Avatar NFT");

      // Verify it contains references to all components
      const avatar = await weNadsContract.read.getAvatar([1n]) as Avatar;
      
      // Check that all components exist and are owned by the buyer
      const componentIds = [
        avatar.backgroundId,
        avatar.headId,
        avatar.eyesId,
        avatar.mouthId,
        avatar.accessoryId
      ];

      for (const componentId of componentIds) {
        const balance = await componentContract.read.balanceOf([buyer.account.address, componentId]);
        expect(balance).to.equal(1n);

        // Verify components are locked
        const isLocked = await componentContract.read.isTokenLocked([componentId]);
        expect(isLocked).to.be.true;
      }

      let uriJson = JSON.parse(tokenUri.replace("data:application/json,", ""));

      // Verify JSON structure
      expect(uriJson).to.have.property("name").that.includes(avatarName);
      expect(uriJson).to.have.property("description").that.equals("WeNads Avatar NFT");
      expect(uriJson).to.have.property("image").that.includes("data:image/svg+xml");
      expect(uriJson).to.have.property("attributes").that.is.an("array");

      // Verify SVG contains all component images
      const svgImage = uriJson.image;
      expect(svgImage).to.include("data:image/svg+xml;base64,");

      // Decode base64 SVG and verify content
      const base64Svg = svgImage.replace("data:image/svg+xml;base64,", "");
      const decodedSvg = Buffer.from(base64Svg, 'base64').toString();
      // Verify SVG structure
      expect(decodedSvg).to.include("<svg");
      expect(decodedSvg).to.include("</svg>");
      expect(decodedSvg).to.include("<foreignObject");

      // Count the number of foreignObject elements (should be one for each component)
      const foreignObjectCount = (decodedSvg.match(/<foreignObject/g) || []).length;
      expect(foreignObjectCount).to.equal(5 + 1); // One for each component + one for the body
    });
  });

  describe("Soulbound and Single Ownership Behavior", function () {
    it("Should prevent an address from owning multiple WeNads", async function () {
        const { weNadsContract, templates, buyer, mintPrice } = await loadFixture(deployWeNadsFixture);

        // Create first avatar
        const totalCost = mintPrice * 5n;
        const tx = await weNadsContract.write.createAvatar(
            [templates[0], templates[1], templates[2], templates[3], templates[4], "First Avatar"],
            {
                value: totalCost,
                account: buyer.account.address
            }
        );

        // Attempt to create second avatar
        await expect(weNadsContract.write.createAvatar(
            [templates[0], templates[1], templates[2], templates[3], templates[4], "Second Avatar"],
            {
                value: totalCost,
                account: buyer.account.address
            }
        )).to.be.rejectedWith("AddressAlreadyOwnsWeNad");
    });

    it("Should prevent transfer of WeNad between addresses", async function () {
        const { weNadsContract, templates, buyer, creator, mintPrice, waitForTransactionReceipt } = await loadFixture(deployWeNadsFixture);

        // Create avatar
        const totalCost = mintPrice * 5n;
        const tx = await weNadsContract.write.createAvatar(
            [templates[0], templates[1], templates[2], templates[3], templates[4], "Test Avatar"],
            {
                value: totalCost,
                account: buyer.account.address
            }
        );
        await waitForTransactionReceipt({ hash: tx });

        // Attempt to transfer
        await expect(weNadsContract.write.transferFrom(
            [buyer.account.address, creator.account.address, 1n],
            {
                account: buyer.account.address
            }
        )).to.be.rejectedWith("SoulboundTokenCannotBeTransferred");
    });

    it("Should allow burning of WeNad", async function () {
        const { weNadsContract, templates, buyer, mintPrice, waitForTransactionReceipt } = await loadFixture(deployWeNadsFixture);

        // Create avatar
        const totalCost = mintPrice * 5n;
        const tx = await weNadsContract.write.createAvatar(
            [templates[0], templates[1], templates[2], templates[3], templates[4], "Test Avatar"],
            {
                value: totalCost,
                account: buyer.account.address
            }
        );
        await waitForTransactionReceipt({ hash: tx });

        // Burn the token
        const burnTx = await weNadsContract.write.burn(
            [1n],
            {
                account: buyer.account.address
            }
        );
        await waitForTransactionReceipt({ hash: burnTx });

        // Verify token is burned
        await expect(weNadsContract.read.ownerOf([1n]))
            .to.be.rejectedWith("ERC721NonexistentToken");

        // Verify user can mint a new WeNad after burning
        const newTx = await weNadsContract.write.createAvatar(
            [templates[0], templates[1], templates[2], templates[3], templates[4], "New Avatar"],
            {
                value: totalCost,
                account: buyer.account.address
            }
        );
        await waitForTransactionReceipt({ hash: newTx });

        const newOwner = await weNadsContract.read.ownerOf([2n]);
        expect(newOwner).to.equal(getAddress(buyer.account.address));
    });
});
}); 