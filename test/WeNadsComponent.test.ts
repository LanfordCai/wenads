import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { getAddress } from "viem";
import { deployContract } from "./utils/deploy";
import { Template} from "./utils/types";
import hre from "hardhat";

describe("WeNadsComponent", function () {
  // Fixture that deploys the contract
  async function deployWeNadsFixture() {
    const [owner, creator, buyer] = await hre.viem.getWalletClients();
    const publicClient = await hre.viem.getPublicClient();
    
    const { contract, waitForTransactionReceipt } = await deployContract("WeNadsComponent");

    // Deploy utils contract
    const { contract: utilsContract } = await deployContract("WeNadsUtils", [contract.address]);

    // Get the template creation price from the contract
    const templateCreationPrice = await contract.read.templateCreationPrice() as bigint;

    return { 
      contract, 
      utilsContract,
      owner, 
      creator, 
      buyer,
      publicClient,
      waitForTransactionReceipt,
      templateCreationPrice
    };
  }

  describe("Template Creation", function () {
    it("Should create a template with correct parameters", async function () {
      const { contract, creator, waitForTransactionReceipt, templateCreationPrice } = await loadFixture(deployWeNadsFixture);
      const accessories1 = "iVBORw0KGgoAAAANSUhEUgAAAZAAAAGQC..."

      const templateParams = {
        name: "Test Template",
        maxSupply: 100n,
        price: 10000000000000000n, // 0.01 ETH
        imageData: accessories1,
        componentType: 0 // BACKGROUND
      };

      const tx = await contract.write.createTemplate(
        [
          templateParams.name,
          templateParams.maxSupply,
          templateParams.price,
          templateParams.imageData,
          templateParams.componentType
        ],
        {
          value: templateCreationPrice,
          account: creator.account.address
        }
      );
      await waitForTransactionReceipt({ hash: tx });

      const template = (await contract.read.getTemplate([1n])) as Template;
      

      const imageDataWithoutPngHeader = template.imageData.replace("iVBORw0KGgoAAAANSUhEUgAA", "");
      expect(template.name).to.equal(templateParams.name);
      expect(template.creator).to.equal(getAddress(creator.account.address));
      expect(template.maxSupply).to.equal(templateParams.maxSupply);
      expect(template.currentSupply).to.deep.equal(0n);
      expect(template.price).to.equal(templateParams.price);
      expect(template.imageData).to.equal(imageDataWithoutPngHeader);
      expect(template.isActive).to.be.true;
      expect(template.componentType).to.deep.equal(templateParams.componentType);
    });

    it("Should fail if template creation price is not paid", async function () {
      const { contract, creator } = await loadFixture(deployWeNadsFixture);

      await expect(contract.write.createTemplate(
        ["Test", 100n, 10000000000000000n, "base64EncodedImage", 0],
        {
          value: 0n,
          account: creator.account.address
        }
      )).to.be.rejectedWith("Must pay template creation price");
    });
  });

  describe("Minting", function () {
    let templateId: bigint;
    let mintPrice: bigint;
    let contract: any;
    let buyer: any;
    let creator: any;
    let waitForTransactionReceipt: any;
    let templateCreationPrice: bigint;

    beforeEach(async function () {
      const fixture = await loadFixture(deployWeNadsFixture);
      contract = fixture.contract;
      buyer = fixture.buyer;
      creator = fixture.creator;
      waitForTransactionReceipt = fixture.waitForTransactionReceipt;
      templateCreationPrice = fixture.templateCreationPrice;
      
      mintPrice = 10000000000000000n; // 0.01 ETH
      
      const createTx = await contract.write.createTemplate(
        ["Test", 100n, mintPrice, "base64EncodedImage", 0],
        {
          value: templateCreationPrice,
          account: creator.account.address
        }
      );
      const receipt = await waitForTransactionReceipt({ hash: createTx });
      
      const event = receipt.logs[0];
      if (!event.topics[1]) throw new Error("No templateId in event");
      templateId = BigInt(event.topics[1]);
    });

    it("Should mint a component successfully", async function () {
      const tx = await contract.write.mintComponent(
        [templateId, buyer.account.address],
        {
          value: mintPrice,
          account: buyer.account.address
        }
      );
      await waitForTransactionReceipt({ hash: tx });

      const balance = await contract.read.balanceOf([buyer.account.address, templateId]);
      expect(balance).to.equal(1n);

      // Add check for template's currentSupply
      const template = (await contract.read.getTemplate([templateId])) as Template;
      expect(template.currentSupply).to.equal(1n); // currentSupply should be 1
    });

    it("Should fail if price is not met", async function () {
      await expect(contract.write.mintComponent(
        [templateId, buyer.account.address],
        {
          value: 5000000000000000n, // Only half the required price
          account: buyer.account.address
        }
      )).to.be.rejectedWith("Incorrect payment amount");
    });
  });

  describe("Template Management", function () {
    it("Should allow creator to update template price", async function () {
      const { contract, creator, waitForTransactionReceipt, templateCreationPrice } = await loadFixture(deployWeNadsFixture);

      // Create template
      const createTx = await contract.write.createTemplate(
        ["Test", 100n, 2000000000000000n, "base64EncodedImage", 0],
        {
          value: templateCreationPrice,
          account: creator.account.address
        }
      );
      await waitForTransactionReceipt({ hash: createTx });

      // Update price
      const newPrice = 20000000000000000n;
      const updateTx = await contract.write.updateTemplatePrice(
        [1n, newPrice],
        {
          account: creator.account.address
        }
      );
      await waitForTransactionReceipt({ hash: updateTx });

      const template = (await contract.read.getTemplate([1n])) as Template;
      expect(template.price).to.equal(newPrice);
    });

    it("Should allow creator to toggle template status", async function () {
      const { contract, creator, waitForTransactionReceipt, templateCreationPrice } = await loadFixture(deployWeNadsFixture);

      // Create template
      const createTx = await contract.write.createTemplate(
        ["Test", 100n, 2000000000000000n, "base64EncodedImage", 0],
        {
          value: templateCreationPrice,
          account: creator.account.address
        }
      );
      await waitForTransactionReceipt({ hash: createTx });

      // Toggle status to inactive
      const toggleTx = await contract.write.toggleTemplateStatus(
        [1n],
        {
          account: creator.account.address
        }
      );
      await waitForTransactionReceipt({ hash: toggleTx });

      const template = (await contract.read.getTemplate([1n])) as Template;
      expect(template.isActive).to.be.false; // isActive should be false
    });

    it("Should allow creator to update template name", async function () {
      const { contract, creator, waitForTransactionReceipt, templateCreationPrice } = await loadFixture(deployWeNadsFixture);

      // Create template
      const createTx = await contract.write.createTemplate(
        ["Test", 100n, 2000000000000000n, "base64EncodedImage", 0],
        {
          value: templateCreationPrice,
          account: creator.account.address
        }
      );
      await waitForTransactionReceipt({ hash: createTx });

      // Update name
      const newName = "Updated Test";
      const updateTx = await contract.write.updateTemplateName(
        [1n, newName],
        {
          account: creator.account.address
        }
      );
      await waitForTransactionReceipt({ hash: updateTx });

      const template = (await contract.read.getTemplate([1n])) as Template;
      expect(template.name).to.equal(newName);
    });

    it("Should allow owner to update template creation price", async function () {
        const { contract, owner, waitForTransactionReceipt } = await loadFixture(deployWeNadsFixture);

        const newPrice = 200000000000000000n; // 0.2 ETH
        const tx = await contract.write.setTemplateCreationPrice(
            [newPrice],
            {
                account: owner.account.address
            }
        );
        await waitForTransactionReceipt({ hash: tx });

      const updatedPrice = await contract.read.templateCreationPrice();
      expect(updatedPrice).to.equal(newPrice);
    });

    it("Should prevent non-owner from updating template creation price", async function () {
      const { contract, creator } = await loadFixture(deployWeNadsFixture);

      const newPrice = 200000000000000000n; // 0.2 ETH
      await expect(contract.write.setTemplateCreationPrice(
        [newPrice],
        {
          account: creator.account.address
        }
      )).to.be.rejectedWith("OwnableUnauthorizedAccount");
    });

    it("Should prevent setting template creation price to zero", async function () {
      const { contract, owner } = await loadFixture(deployWeNadsFixture);

      await expect(contract.write.setTemplateCreationPrice(
        [0n],
        {
          account: owner.account.address
        }
      )).to.be.rejectedWith("Price must be greater than 0");
    });
  });

  describe("View Functions", function () {
    it("Should return correct templates for creator", async function () {
      const { contract, creator, waitForTransactionReceipt, templateCreationPrice } = await loadFixture(deployWeNadsFixture);

      // Create two templates
      const createTx1 = await contract.write.createTemplate(
        ["Test 1", 100n, 10000000000000000n, "base64EncodedImage", 0],
        {
          value: templateCreationPrice,
          account: creator.account.address
        }
      );
      await waitForTransactionReceipt({ hash: createTx1 });

      const createTx2 = await contract.write.createTemplate(
        ["Test 2", 100n, 10000000000000000n, "base64EncodedImage", 1],
        {
          value: templateCreationPrice,
          account: creator.account.address
        }
      );
      await waitForTransactionReceipt({ hash: createTx2 });

      const creatorTemplates = await contract.read.getTemplatesOfCreator([creator.account.address]);
      expect(creatorTemplates).to.deep.equal([1n, 2n]);
    });

    it("Should return correct templates by type", async function () {
      const { contract, creator, waitForTransactionReceipt, templateCreationPrice } = await loadFixture(deployWeNadsFixture);

      // Create templates of different types
      const createTx1 = await contract.write.createTemplate(
        ["Background", 100n, 10000000000000000n, "base64EncodedImage", 0],
        {
          value: templateCreationPrice,
          account: creator.account.address
        }
      );
      await waitForTransactionReceipt({ hash: createTx1 });

      const createTx2 = await contract.write.createTemplate(
        ["Head", 100n, 10000000000000000n, "base64EncodedImage", 1],
        {
          value: templateCreationPrice,
          account: creator.account.address
        }
      );
      await waitForTransactionReceipt({ hash: createTx2 });

      const backgroundTemplates = await contract.read.getTemplatesOfType([0]);
      const headTemplates = await contract.read.getTemplatesOfType([1]);

      expect(backgroundTemplates).to.deep.equal([1n]);
      expect(headTemplates).to.deep.equal([2n]);
    });

    it("Should return correct template data for getTemplate", async function () {
      const { contract, creator, waitForTransactionReceipt, templateCreationPrice } = await loadFixture(deployWeNadsFixture);

      const templateParams = {
        name: "Test Template",
        maxSupply: 100n,
        price: 10000000000000000n,
        imageData: "base64EncodedImage",
        componentType: 0
      };

      // Create template
      const createTx = await contract.write.createTemplate(
        [
          templateParams.name,
          templateParams.maxSupply,
          templateParams.price,
          templateParams.imageData,
          templateParams.componentType
        ],
        {
          value: templateCreationPrice,
          account: creator.account.address
        }
      );
      await waitForTransactionReceipt({ hash: createTx });

      const template = await contract.read.getTemplate([1n]) as Template;
      
      expect(template.name).to.equal(templateParams.name); // name
      expect(template.creator).to.equal(getAddress(creator.account.address)); // creator
      expect(template.maxSupply).to.equal(templateParams.maxSupply); // maxSupply
      expect(template.currentSupply).to.equal(0n); // currentSupply
      expect(template.price).to.equal(templateParams.price); // price
      expect(template.isActive).to.be.true; // isActive
      expect(template.componentType).to.equal(templateParams.componentType); // componentType
    });

    it("Should return correct template data for getTemplates", async function () {
      const { contract, creator, templateCreationPrice } = await loadFixture(deployWeNadsFixture);

      // Create two templates
      const template1Params = {
        name: "Template 1",
        maxSupply: 100n,
        price: 10000000000000000n,
        imageData: "base64EncodedImage1",
        componentType: 0
      };

      const template2Params = {
        name: "Template 2",
        maxSupply: 200n,
        price: 20000000000000000n,
        imageData: "base64EncodedImage2",
        componentType: 1
      };

      // Create first template
      await contract.write.createTemplate(
        [
          template1Params.name,
          template1Params.maxSupply,
          template1Params.price,
          template1Params.imageData,
          template1Params.componentType
        ],
        {
          value: templateCreationPrice,
          account: creator.account.address
        }
      );

      // Create second template
      await contract.write.createTemplate(
        [
          template2Params.name,
          template2Params.maxSupply,
          template2Params.price,
          template2Params.imageData,
          template2Params.componentType
        ],
        {
          value: templateCreationPrice,
          account: creator.account.address
        }
      );

      const templates = (await contract.read.getTemplates([[1n, 2n]])) as Template[];
      
      // Verify first template
      expect(templates[0].name).to.equal(template1Params.name);
      expect(templates[0].maxSupply).to.equal(template1Params.maxSupply);
      expect(templates[0].price).to.equal(template1Params.price);
      expect(templates[0].componentType).to.equal(template1Params.componentType);

      // Verify second template
      expect(templates[1].name).to.equal(template2Params.name);
      expect(templates[1].maxSupply).to.equal(template2Params.maxSupply);
      expect(templates[1].price).to.equal(template2Params.price);
      expect(templates[1].componentType).to.equal(template2Params.componentType);
    });

    it("Should revert when requesting non-existent template", async function () {
      const { contract } = await loadFixture(deployWeNadsFixture);

      await expect(contract.read.getTemplate([999n]))
        .to.be.rejectedWith("Template does not exist");
    });

    it("Should revert when requesting array with non-existent template", async function () {
      const { contract } = await loadFixture(deployWeNadsFixture);

      await expect(contract.read.getTemplates([[1n, 999n]]))
        .to.be.rejectedWith("Template does not exist");
    });

    it("Should return correct template ID for a token", async function () {
        const { contract, creator, buyer, waitForTransactionReceipt, templateCreationPrice } = await loadFixture(deployWeNadsFixture);

        // Create template
        const createTx = await contract.write.createTemplate(
            ["Test", 100n, 10000000000000000n, "base64EncodedImage", 0],
            {
                value: templateCreationPrice,
                account: creator.account.address
            }
        );
        await waitForTransactionReceipt({ hash: createTx });

        // Mint token
        const mintTx = await contract.write.mintComponent(
            [1n, buyer.account.address],
            {
                value: 10000000000000000n,
                account: buyer.account.address
            }
        );
        await waitForTransactionReceipt({ hash: mintTx });

        const templateId = await contract.read.getTokenTemplate([1n]);
        expect(templateId).to.equal(1n);
    });

    it("Should revert when getting template ID for non-existent token", async function () {
        const { contract } = await loadFixture(deployWeNadsFixture);

        await expect(contract.read.getTokenTemplate([999n]))
            .to.be.rejectedWith("Token does not exist");
    });
  });

  describe("Component Transfers", function () {
    let templateId: bigint;
    let tokenId: bigint;
    let contract: any;
    let weNadsContract: any;
    let buyer: any;
    let creator: any;
    let waitForTransactionReceipt: any;
    let templateCreationPrice: bigint;
    let mintPrice: bigint;

    beforeEach(async function () {
      const fixture = await loadFixture(deployWeNadsFixture);
      contract = fixture.contract;
      buyer = fixture.buyer;
      creator = fixture.creator;
      waitForTransactionReceipt = fixture.waitForTransactionReceipt;
      templateCreationPrice = fixture.templateCreationPrice;

      // Deploy mock WeNads contract
      const { contract: mockWeNads } = await deployContract("WeNads", [
        contract.address,
        fixture.utilsContract.address
      ]);
      weNadsContract = mockWeNads;

      // Set WeNads contract address
      const setTx = await contract.write.setWeNadsContract(
        [weNadsContract.address],
        { account: fixture.owner.account.address }
      );
      await waitForTransactionReceipt({ hash: setTx });

      // Impersonate the WeNads contract address
      await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [weNadsContract.address],
      });

      await hre.network.provider.request({
        method: "hardhat_setBalance",
        params: [weNadsContract.address, "0x1000000000000000000"],
      });

      mintPrice = 10000000000000000n; // 0.01 ETH

      // Create template
      const createTx = await contract.write.createTemplate(
        ["Test", 100n, mintPrice, "base64EncodedImage", 0],
        {
          value: templateCreationPrice,
          account: creator.account.address
        }
      );
      await waitForTransactionReceipt({ hash: createTx });
      templateId = 1n;

      // Mint a component using the correct mint price
      const mintTx = await contract.write.mintComponent(
        [templateId, buyer.account.address],
        {
          value: mintPrice,
          account: buyer.account.address
        }
      );
      await waitForTransactionReceipt({ hash: mintTx });
      tokenId = 1n;
    });

    afterEach(async function () {
      // Only stop impersonating if we successfully set up the contract
      if (weNadsContract?.address) {
        await hre.network.provider.request({
          method: "hardhat_stopImpersonatingAccount",
          params: [weNadsContract.address],
        });
      }
    });

    it("Should allow transfer of unlocked component", async function () {
      const [,,, receiver] = await hre.viem.getWalletClients();

      const tx = await contract.write.safeTransferFrom(
        [buyer.account.address, receiver.account.address, tokenId, 1n, "0x"],
        { account: buyer.account.address }
      );
      await waitForTransactionReceipt({ hash: tx });

      const newBalance = await contract.read.balanceOf([receiver.account.address, tokenId]);
      expect(newBalance).to.equal(1n);
    });

    it("Should prevent transfer of locked component", async function () {
      const [,,, receiver] = await hre.viem.getWalletClients();

      // Lock the token (simulating being part of an avatar)
      const lockTx = await contract.write.setTokenLockStatus(
        [tokenId, true, buyer.account.address],
        { account: weNadsContract.address }
      );
      await waitForTransactionReceipt({ hash: lockTx });

      // Attempt to transfer
      await expect(contract.write.safeTransferFrom(
        [buyer.account.address, receiver.account.address, tokenId, 1n, "0x"],
        { account: buyer.account.address }
      )).to.be.rejectedWith("Token is locked");
    });

    it("Should allow transfer after unlocking", async function () {
      const [,,, receiver] = await hre.viem.getWalletClients();

      // Lock the token
      const lockTx = await contract.write.setTokenLockStatus(
        [tokenId, true, buyer.account.address],
        { account: weNadsContract.address }
      );
      await waitForTransactionReceipt({ hash: lockTx });

      // Unlock the token
      const unlockTx = await contract.write.setTokenLockStatus(
        [tokenId, false, buyer.account.address],
        { account: weNadsContract.address }
      );
      await waitForTransactionReceipt({ hash: unlockTx });

      // Transfer should now succeed
      const transferTx = await contract.write.safeTransferFrom(
        [buyer.account.address, receiver.account.address, tokenId, 1n, "0x"],
        { account: buyer.account.address }
      );
      await waitForTransactionReceipt({ hash: transferTx });

      const newBalance = await contract.read.balanceOf([receiver.account.address, tokenId]);
      expect(newBalance).to.equal(1n);
    });

    it("Should only allow WeNads contract to lock/unlock tokens", async function () {
      // Attempt to lock token from non-WeNads address
      await expect(contract.write.setTokenLockStatus(
        [tokenId, true, buyer.account.address],
        { account: buyer.account.address }
      )).to.be.rejectedWith("Only WeNads contract can lock/unlock tokens");
    });

    it("Should only allow token owner to be locked/unlocked", async function () {
      const [,,, nonOwner] = await hre.viem.getWalletClients();

      // Attempt to lock token for non-owner
      await expect(contract.write.setTokenLockStatus(
        [tokenId, true, nonOwner.account.address],
        { account: weNadsContract.address }
      )).to.be.rejectedWith("Must own token to lock/unlock");
    });

    it("Should handle batch transfers correctly", async function () {
      const [,,, receiver] = await hre.viem.getWalletClients();

      // Mint another component
      const mintTx = await contract.write.mintComponent(
        [templateId, buyer.account.address],
        {
          value: 10000000000000000n,
          account: buyer.account.address
        }
      );
      await waitForTransactionReceipt({ hash: mintTx });
      const tokenId2 = 2n;

      // Transfer both tokens
      const tx = await contract.write.safeBatchTransferFrom(
        [
          buyer.account.address,
          receiver.account.address,
          [tokenId, tokenId2],
          [1n, 1n],
          "0x"
        ],
        { account: buyer.account.address }
      );
      await waitForTransactionReceipt({ hash: tx });

      const balance1 = await contract.read.balanceOf([receiver.account.address, tokenId]);
      const balance2 = await contract.read.balanceOf([receiver.account.address, tokenId2]);
      expect(balance1).to.equal(1n);
      expect(balance2).to.equal(1n);
    });
  });

  describe("URI Generation", function () {
    let contract: any;
    let creator: any;
    let waitForTransactionReceipt: any;
    let templateId: bigint;
    let tokenId: bigint;
    let templateCreationPrice: bigint;
    let mintPrice: bigint;

    beforeEach(async function () {
      const fixture = await loadFixture(deployWeNadsFixture);
      contract = fixture.contract;
      creator = fixture.creator;
      waitForTransactionReceipt = fixture.waitForTransactionReceipt;
      templateCreationPrice = fixture.templateCreationPrice;

      mintPrice = 10000000000000000n; // 0.01 ETH

      // Create a template
      const imageData = "iVBORw0KGgoAAAANSUhEUgAAAZAAAAGQCAMAAAC3Ycb+AAA..."
      const createTx = await contract.write.createTemplate(
        ["Test Template", 100n, mintPrice, imageData, 0],
        {
          value: templateCreationPrice,
          account: creator.account.address
        }
      );
      await waitForTransactionReceipt({ hash: createTx });
      templateId = 1n;

      // Mint a component using the correct mint price
      const mintTx = await contract.write.mintComponent(
        [templateId, creator.account.address],
        {
          value: mintPrice,
          account: creator.account.address
        }
      );
      await waitForTransactionReceipt({ hash: mintTx });
      tokenId = 1n;
    });

    it("Should return correct URI for a minted component", async function () {
      const uri = await contract.read.uri([tokenId]);
      
      // The URI is already in the format "data:application/json,{...}"
      const metadata = JSON.parse(uri.replace("data:application/json,", ""));

      // Verify metadata structure
      expect(metadata).to.have.property('name').that.includes('WeNads');
      expect(metadata).to.have.property('description', 'WeNads Component NFT');
      expect(metadata).to.have.property('image');
      
      // Verify image data is included and starts with data:image/png;base64
      expect(metadata.image).to.include('data:image/png;base64');
    });

    it("Should fail to get URI for non-existent token", async function () {
      const nonExistentTokenId = 999n;
      await expect(contract.read.uri([nonExistentTokenId]))
        .to.be.rejectedWith("URI query for nonexistent token");
    });

    it("Should include correct component type in metadata", async function () {
      const uri = await contract.read.uri([tokenId]);
      const metadata = JSON.parse(uri.replace("data:application/json,", ""));

      // Verify component type (0 = BACKGROUND)
      expect(metadata.attributes).to.deep.include({
        trait_type: "Component Type",
        value: "Background"
      });
    });

    it("Should return correct metadata for tokens of same template", async function () {
      // Mint another token from same template
      const mintTx = await contract.write.mintComponent(
        [templateId, creator.account.address],
        {
          value: 10000000000000000n,
          account: creator.account.address
        }
      );
      await waitForTransactionReceipt({ hash: mintTx });
      const tokenId2 = 2n;

      const uri1 = await contract.read.uri([tokenId]);
      const uri2 = await contract.read.uri([tokenId2]);

      // Get the metadata objects
      const metadata1 = JSON.parse(uri1.replace("data:application/json,", ""));
      const metadata2 = JSON.parse(uri2.replace("data:application/json,", ""));

      // Compare relevant fields that should be the same
      expect(metadata1.description).to.equal(metadata2.description);
      expect(metadata1.image).to.equal(metadata2.image);
      expect(metadata1.attributes[0]).to.deep.equal(metadata2.attributes[0]); // Component Type
      expect(metadata1.attributes[1]).to.deep.equal(metadata2.attributes[1]); // Template ID
      expect(metadata1.attributes[2]).to.deep.equal(metadata2.attributes[2]); // Creator
      expect(metadata1.attributes[3]).to.deep.equal(metadata2.attributes[3]); // Max Supply
    });
  });

  describe("Template Token Tracking", function () {
    let contract: any;
    let creator: any;
    let buyer: any;
    let templateId: bigint;
    let tokenId: bigint;
    let waitForTransactionReceipt: any;
    let templateCreationPrice: bigint;

    beforeEach(async function () {
      const fixture = await loadFixture(deployWeNadsFixture);
      contract = fixture.contract;
      creator = fixture.creator;
      buyer = fixture.buyer;
      waitForTransactionReceipt = fixture.waitForTransactionReceipt;
      templateCreationPrice = fixture.templateCreationPrice;

      // Create template
      const createTx = await contract.write.createTemplate(
        ["Test", 100n, 10000000000000000n, "base64EncodedImage", 0],
        {
          value: templateCreationPrice,
          account: creator.account.address
        }
      );
      await waitForTransactionReceipt({ hash: createTx });
      templateId = 1n;

      // Mint component
      const mintTx = await contract.write.mintComponent(
        [templateId, buyer.account.address],
        {
          value: 10000000000000000n,
          account: buyer.account.address
        }
      );
      await waitForTransactionReceipt({ hash: mintTx });
      tokenId = 1n;
    });

    it("Should return correct token ID for user's template", async function () {
      const userToken = await contract.read.getUserTemplateToken([
        buyer.account.address,
        templateId
      ]);
      expect(userToken).to.equal(tokenId);
    });

    it("Should fail if user doesn't own template token", async function () {
      await expect(contract.read.getUserTemplateToken([
        creator.account.address,
        templateId
      ])).to.be.rejectedWith("User does not own this template");
    });

    it("Should update tracking after token transfer", async function () {
      const [,,, receiver] = await hre.viem.getWalletClients();

      // Transfer token to new owner
      const transferTx = await contract.write.safeTransferFrom(
        [buyer.account.address, receiver.account.address, tokenId, 1n, "0x"],
        { account: buyer.account.address }
      );
      await waitForTransactionReceipt({ hash: transferTx });

      // Check new owner's token
      const newOwnerToken = await contract.read.getUserTemplateToken([
        receiver.account.address,
        templateId
      ]);
      expect(newOwnerToken).to.equal(tokenId);

      // Check old owner no longer has token
      await expect(contract.read.getUserTemplateToken([
        buyer.account.address,
        templateId
      ])).to.be.rejectedWith("User does not own this template");
    });

    it("Should fail for non-existent template", async function () {
      await expect(contract.read.getUserTemplateToken([
        buyer.account.address,
        999n
      ])).to.be.rejectedWith("User does not own this template");
    });
  });

  describe("Batch Minting", function () {
    let contract: any;
    let buyer: any;
    let creator: any;
    let waitForTransactionReceipt: any;
    let templateCreationPrice: bigint;
    let templateIds: bigint[];

    beforeEach(async function () {
        const fixture = await loadFixture(deployWeNadsFixture);
        contract = fixture.contract;
        buyer = fixture.buyer;
        creator = fixture.creator;
        waitForTransactionReceipt = fixture.waitForTransactionReceipt;
        templateCreationPrice = fixture.templateCreationPrice;
        templateIds = [];

        // Create two templates
        for (let i = 0; i < 2; i++) {
            const createTx = await contract.write.createTemplate(
                [`Test ${i}`, 100n, 10000000000000000n, "base64EncodedImage", i],
                {
                    value: templateCreationPrice,
                    account: creator.account.address
                }
            );
            await waitForTransactionReceipt({ hash: createTx });
            templateIds.push(BigInt(i + 1));
        }
    });

    it("Should mint multiple components in one transaction", async function () {
        const totalPrice = 20000000000000000n; // 0.02 ETH (0.01 ETH per template)
        
        const tx = await contract.write.mintComponents(
            [templateIds, buyer.account.address],
            {
                value: totalPrice,
                account: buyer.account.address
            }
        );
        await waitForTransactionReceipt({ hash: tx });

        // Check balances for both tokens
        const balance1 = await contract.read.balanceOf([buyer.account.address, 1n]);
        const balance2 = await contract.read.balanceOf([buyer.account.address, 2n]);
        expect(balance1).to.equal(1n);
        expect(balance2).to.equal(1n);
    });

    it("Should fail if total price is incorrect", async function () {
        const incorrectPrice = 15000000000000000n; // 0.015 ETH (not enough)
        
        await expect(contract.write.mintComponents(
            [templateIds, buyer.account.address],
            {
                value: incorrectPrice,
                account: buyer.account.address
            }
        )).to.be.rejectedWith("Incorrect payment amount");
    });

    it("Should update template current supply correctly", async function () {
        const totalPrice = 20000000000000000n;
        
        await contract.write.mintComponents(
            [templateIds, buyer.account.address],
            {
                value: totalPrice,
                account: buyer.account.address
            }
        );

        // Check current supply for both templates
        const template1 = await contract.read.getTemplate([1n]);
        const template2 = await contract.read.getTemplate([2n]);
        expect(template1.currentSupply).to.equal(1n);
        expect(template2.currentSupply).to.equal(1n);
    });

    it("Should fail if any template is inactive", async function () {
        // Deactivate first template
        await contract.write.toggleTemplateStatus(
            [templateIds[0]],
            { account: creator.account.address }
        );

        const totalPrice = 20000000000000000n;
        
        await expect(contract.write.mintComponents(
            [templateIds, buyer.account.address],
            {
                value: totalPrice,
                account: buyer.account.address
            }
        )).to.be.rejectedWith("Template is not active");
    });

    it("Should fail if any template reaches max supply", async function () {
        // Create template with max supply 1
        const createTx = await contract.write.createTemplate(
            ["Limited", 1n, 10000000000000000n, "base64EncodedImage", 2],
            {
                value: templateCreationPrice,
                account: creator.account.address
            }
        );
        await waitForTransactionReceipt({ hash: createTx });
        const limitedTemplateId = 3n;

        // Mint the only available token
        await contract.write.mintComponent(
            [limitedTemplateId, buyer.account.address],
            {
                value: 10000000000000000n,
                account: buyer.account.address
            }
        );

        // Try to mint it again in a batch
        await expect(contract.write.mintComponents(
            [[limitedTemplateId], buyer.account.address],
            {
                value: 10000000000000000n,
                account: buyer.account.address
            }
        )).to.be.rejectedWith("Max supply reached");
    });
  });
}); 