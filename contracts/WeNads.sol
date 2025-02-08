// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "./WeNadsComponent.sol";
import "./WeNadsUtils.sol";

contract WeNads is ERC721Enumerable, Ownable, ERC1155Holder {
    using Strings for uint256;

    // Reference to the component contract
    WeNadsComponent public componentContract;

    // Add utils contract reference
    WeNadsUtils public utils;

    // Add error for transfer attempt
    error SoulboundTokenCannotBeTransferred();

    // Add error for multiple token ownership attempt
    error AddressAlreadyOwnsWeNad();

    // Avatar structure
    struct Avatar {
        uint256 backgroundId;
        uint256 headId;
        uint256 eyesId;
        uint256 mouthId;
        uint256 accessoryId;
        string name;
    }

    // Mapping from avatar ID to Avatar struct
    mapping(uint256 => Avatar) private avatars;
    
    // Next avatar ID tracker
    uint256 private nextAvatarId = 1;

    // Events
    event AvatarCreated(
        uint256 indexed avatarId,
        uint256 backgroundId,
        uint256 headId,
        uint256 eyesId,
        uint256 mouthId,
        uint256 accessoryId
    );
    event AvatarNameUpdated(uint256 indexed avatarId, string newName);

    constructor(address _componentContract, address _utilsContract) ERC721("WeNads", "WENADS") Ownable(msg.sender) {
        componentContract = WeNadsComponent(_componentContract);
        utils = WeNadsUtils(_utilsContract);
    }

    function createAvatar(
        uint256 _backgroundTemplateId,
        uint256 _headTemplateId,
        uint256 _eyesTemplateId,
        uint256 _mouthTemplateId,
        uint256 _accessoryTemplateId,
        string memory _name
    ) external payable {
        // Add check for existing ownership
        if (balanceOf(msg.sender) > 0) {
            revert AddressAlreadyOwnsWeNad();
        }

        // Destructure tuples to get prices
        WeNadsComponent.Template memory background = componentContract.getTemplate(_backgroundTemplateId);
        WeNadsComponent.Template memory head = componentContract.getTemplate(_headTemplateId);
        WeNadsComponent.Template memory eyes = componentContract.getTemplate(_eyesTemplateId);
        WeNadsComponent.Template memory mouth = componentContract.getTemplate(_mouthTemplateId);
        WeNadsComponent.Template memory accessory = componentContract.getTemplate(_accessoryTemplateId);

        uint256 totalCost = background.price + head.price + eyes.price + mouth.price + accessory.price;
        require(msg.value >= totalCost, "Insufficient payment");

        // Create array of template IDs
        uint256[] memory templateIds = new uint256[](5);
        templateIds[0] = _backgroundTemplateId;
        templateIds[1] = _headTemplateId;
        templateIds[2] = _eyesTemplateId;
        templateIds[3] = _mouthTemplateId;
        templateIds[4] = _accessoryTemplateId;

        // Mint all components at once
        uint256[] memory componentIds = componentContract.mintComponents{value: totalCost}(templateIds, msg.sender);

        // Create avatar
        uint256 avatarId = nextAvatarId++;
        avatars[avatarId] = Avatar({
            backgroundId: componentIds[0],
            headId: componentIds[1],
            eyesId: componentIds[2],
            mouthId: componentIds[3],
            accessoryId: componentIds[4],
            name: _name
        });

        // Mint avatar NFT
        _mint(msg.sender, avatarId);

        emit AvatarCreated(
            avatarId,
            componentIds[0],
            componentIds[1],
            componentIds[2],
            componentIds[3],
            componentIds[4]
        );

        // Lock all components
        for (uint256 i = 0; i < componentIds.length; i++) {
            componentContract.setTokenLockStatus(componentIds[i], true, msg.sender);
        }

        // Refund excess payment if any
        if (msg.value > totalCost) {
            payable(msg.sender).transfer(msg.value - totalCost);
        }
    }

    function updateAvatarName(uint256 _avatarId, string memory _newName) external {
        require(_isAuthorized(_ownerOf(_avatarId), msg.sender, _avatarId), "Not authorized");
        avatars[_avatarId].name = _newName;
        emit AvatarNameUpdated(_avatarId, _newName);
    }

    function changeComponent(
        uint256 _avatarId,
        uint256 _componentId,
        WeNadsComponent.ComponentType _componentType
    ) public {
        require(_isAuthorized(_ownerOf(_avatarId), msg.sender, _avatarId), "Not authorized");
        
        // Verify the sender owns the component
        require(componentContract.balanceOf(msg.sender, _componentId) > 0, "Must own component");

        // Verify component type matches
        uint256 templateId = componentContract.getTokenTemplate(_componentId);
        require(componentContract.getTemplateType(templateId) == _componentType, 
            "Invalid component type");

        Avatar storage avatar = avatars[_avatarId];
        uint256 oldComponentId;

        // Get the old component ID and update with new one
        if (_componentType == WeNadsComponent.ComponentType.BACKGROUND) {
            oldComponentId = avatar.backgroundId;
            componentContract.setTokenLockStatus(oldComponentId, false, msg.sender);
            componentContract.setTokenLockStatus(_componentId, true, msg.sender);
            avatar.backgroundId = _componentId;
        } else if (_componentType == WeNadsComponent.ComponentType.HAIRSTYLE) {
            oldComponentId = avatar.headId;
            componentContract.setTokenLockStatus(oldComponentId, false, msg.sender);
            componentContract.setTokenLockStatus(_componentId, true, msg.sender);
            avatar.headId = _componentId;
        } else if (_componentType == WeNadsComponent.ComponentType.EYES) {
            oldComponentId = avatar.eyesId;
            componentContract.setTokenLockStatus(oldComponentId, false, msg.sender);
            componentContract.setTokenLockStatus(_componentId, true, msg.sender);
            avatar.eyesId = _componentId;
        } else if (_componentType == WeNadsComponent.ComponentType.MOUTH) {
            oldComponentId = avatar.mouthId;
            componentContract.setTokenLockStatus(oldComponentId, false, msg.sender);
            componentContract.setTokenLockStatus(_componentId, true, msg.sender);
            avatar.mouthId = _componentId;
        } else if (_componentType == WeNadsComponent.ComponentType.FLOWER) {
            oldComponentId = avatar.accessoryId;
            componentContract.setTokenLockStatus(oldComponentId, false, msg.sender);
            componentContract.setTokenLockStatus(_componentId, true, msg.sender);
            avatar.accessoryId = _componentId;
        }
    }

    function changeComponents(
        uint256 _avatarId,
        uint256 _backgroundId,
        uint256 _headId,
        uint256 _eyesId,
        uint256 _mouthId,
        uint256 _accessoryId
    ) external {
        require(_isAuthorized(_ownerOf(_avatarId), msg.sender, _avatarId), "Not authorized");
        
        if (_backgroundId != 0) {
            changeComponent(_avatarId, _backgroundId, WeNadsComponent.ComponentType.BACKGROUND);
        }
        
        if (_headId != 0) {
            changeComponent(_avatarId, _headId, WeNadsComponent.ComponentType.HAIRSTYLE);
        }
        
        if (_eyesId != 0) {
            changeComponent(_avatarId, _eyesId, WeNadsComponent.ComponentType.EYES);
        }
        
        if (_mouthId != 0) {
            changeComponent(_avatarId, _mouthId, WeNadsComponent.ComponentType.MOUTH);
        }
        
        if (_accessoryId != 0) {
            changeComponent(_avatarId, _accessoryId, WeNadsComponent.ComponentType.FLOWER);
        }
    }

    // Override _update to prevent transfers
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal virtual override returns (address) {
        address from = _ownerOf(tokenId);
        
        // Allow minting (from zero address) but prevent transfers between non-zero addresses
        if (from != address(0) && to != address(0)) {
            revert SoulboundTokenCannotBeTransferred();
        }
        
        return super._update(to, tokenId, auth);
    }

    // Add burn function (optional, depending on if you want to allow burning)
    function burn(uint256 tokenId) public {
        require(_isAuthorized(_ownerOf(tokenId), msg.sender, tokenId), "Not authorized");
        
        // Unlock and transfer components back to contract or handle as needed
        Avatar storage avatar = avatars[tokenId];
        address componentOwner = _ownerOf(tokenId);
        
        componentContract.setTokenLockStatus(avatar.backgroundId, false, componentOwner);
        componentContract.setTokenLockStatus(avatar.headId, false, componentOwner);
        componentContract.setTokenLockStatus(avatar.eyesId, false, componentOwner);
        componentContract.setTokenLockStatus(avatar.mouthId, false, componentOwner);
        componentContract.setTokenLockStatus(avatar.accessoryId, false, componentOwner);
        
        _update(address(0), tokenId, msg.sender);
    }

    function tokenURI(uint256 _tokenId) public view virtual override returns (string memory) {
        _requireOwned(_tokenId); // Use OpenZeppelin's built-in check that throws proper error
        Avatar storage avatar = avatars[_tokenId];

        // Create AvatarData struct for utils contract
        WeNadsUtils.AvatarData memory avatarData = WeNadsUtils.AvatarData({
            name: avatar.name,
            backgroundId: avatar.backgroundId,
            headId: avatar.headId,
            eyesId: avatar.eyesId,
            mouthId: avatar.mouthId,
            accessoryId: avatar.accessoryId
        });

        return utils.generateTokenURI(avatarData);
    }

    function getAvatar(uint256 _tokenId) public view returns (Avatar memory) {
        _requireOwned(_tokenId); // Verify token exists and is owned
        return avatars[_tokenId];
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC721Enumerable, ERC1155Holder)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
