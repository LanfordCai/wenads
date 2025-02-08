// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract WeNadsComponent is ERC1155, Ownable {
    using Strings for uint256;

    // Component types
    enum ComponentType {
        BACKGROUND,
        HAIRSTYLE,
        EYES,
        MOUTH,
        FLOWER
    }

    struct Template {
        string name;
        address creator;
        uint256 maxSupply;
        uint256 currentSupply;
        uint256 price;
        string imageData;  // Base64 encoded PNG
        bool isActive;
        ComponentType componentType;
    }

    // Mapping from template ID to Template struct
    mapping(uint256 => Template) private templates;
    uint256 public nextTemplateId = 1;

    // Token ID tracking
    uint256 public nextTokenId = 1;

    // Share percentage for creator
    uint256 public sharePercentage = 80;
    
    // Mapping from token ID to template ID
    mapping(uint256 => uint256) private tokenTemplate;

    // Mapping from creator address to template IDs
    mapping(address => uint256[]) private creatorTemplates;
    // Mapping from component type to template IDs
    mapping(ComponentType => uint256[]) private templatesByType;

    // PNG header constant used to save gas by not storing this standard prefix with each image
    // This is concatenated with the stored image data when serving the URI
    string constant PNG_HEADER = "iVBORw0KGgoAAAANSUhEUgAA";

    // Events
    event TemplateCreated(uint256 indexed templateId, address indexed creator, ComponentType indexed componentType);
    event TemplateMinted(uint256 indexed templateId, address indexed minter);
    event TemplatePriceUpdated(uint256 indexed templateId, uint256 newPrice);
    event TemplateStatusUpdated(uint256 indexed templateId, bool isActive);

    event TokenMinted(uint256 indexed tokenId, uint256 indexed templateId, address indexed minter);

    // Modifiers
    modifier onlyCreator(uint256 _templateId) {
        require(msg.sender == templates[_templateId].creator, "Only creator can perform this action");
        _;
    }

    // Add this with other state variables at the top
    uint256 public templateCreationPrice = 0.02 ether;

    // Add this with other state variables at the top
    mapping(uint256 => bool) public isTokenLocked;
    address public weNadsContract;

    // one of the user's token for a template
    // it means the user has at least one token for this template
    mapping(address => mapping(uint256 => uint256)) private userTemplateToken; // user => templateId => tokenId

    // ============ Constructor ============
    constructor() ERC1155("WeNads Component") Ownable(msg.sender) {
    }

    // ============ Core Template Functions ============
    function createTemplate(
        string memory _name,
        uint256 _maxSupply,
        uint256 _price,
        string memory _imageData, 
        ComponentType _componentType
    ) external payable returns (uint256) {
        require(msg.value == templateCreationPrice, "Must pay template creation price");
        
        // Remove header if it exists
        string memory cleanImageData = _removeHeader(_imageData);
        
        uint256 templateId = nextTemplateId++;
        
        templates[templateId] = Template({
            name: _name,
            creator: msg.sender,
            maxSupply: _maxSupply,
            currentSupply: 0,
            price: _price,
            imageData: cleanImageData,
            isActive: true,
            componentType: _componentType
        });

        creatorTemplates[msg.sender].push(templateId);
        templatesByType[_componentType].push(templateId);

        // Send the payment to contract owner
        payable(owner()).transfer(msg.value);

        emit TemplateCreated(templateId, msg.sender, _componentType);
        return templateId;
    }

    // You can keep the original mintComponent function for single mints
    function mintComponent(uint256 _templateId, address recipient) external payable returns (uint256) {
        uint256[] memory templateIds = new uint256[](1);
        templateIds[0] = _templateId;
        
        return mintComponents(templateIds, recipient)[0];
    }

    function mintComponents(uint256[] memory _templateIds, address recipient) public payable returns (uint256[] memory) {
        uint256 totalPrice = 0;
        uint256[] memory tokenIds = new uint256[](_templateIds.length);

        // First validate all templates and calculate total price
        for (uint256 i = 0; i < _templateIds.length; i++) {
            Template storage template = templates[_templateIds[i]];
            require(template.isActive, "Template is not active");
            require(template.currentSupply < template.maxSupply, "Max supply reached");
            totalPrice += template.price;
        }
        require(msg.value == totalPrice, "Incorrect payment amount");

        // Then mint all tokens
        for (uint256 i = 0; i < _templateIds.length; i++) {
            Template storage template = templates[_templateIds[i]];
            uint256 tokenId = nextTokenId++;
            tokenTemplate[tokenId] = _templateIds[i];
            tokenIds[i] = tokenId;

            uint256 creatorShare = (template.price * sharePercentage) / 100;
            payable(template.creator).transfer(creatorShare);
            payable(owner()).transfer(template.price - creatorShare);

            template.currentSupply++;
            _mint(recipient, tokenId, 1, "");
            
            userTemplateToken[recipient][_templateIds[i]] = tokenId;
            emit TemplateMinted(_templateIds[i], recipient);
        }

        return tokenIds;
    }

    // ============ Template Management Functions ============
    function updateTemplatePrice(uint256 _templateId, uint256 _newPrice) external onlyCreator(_templateId) {
        Template storage template = templates[_templateId];
        require(template.isActive, "Template is not active");
        
        template.price = _newPrice;
        emit TemplatePriceUpdated(_templateId, _newPrice);
    }

    function toggleTemplateStatus(uint256 _templateId) external onlyCreator(_templateId) {
        require(templates[_templateId].creator != address(0), "Template does not exist");
        templates[_templateId].isActive = !templates[_templateId].isActive;
        emit TemplateStatusUpdated(_templateId, templates[_templateId].isActive);
    }

    function setSharePercentage(uint256 _sharePercentage) external onlyOwner {
        require(_sharePercentage >= 60 && _sharePercentage <= 100, "Share percentage must be between 60 and 100");
        sharePercentage = _sharePercentage;
    }

    function updateTemplateName(uint256 _templateId, string memory _newName) external onlyCreator(_templateId) {
        require(templates[_templateId].isActive, "Template is not active");
        templates[_templateId].name = _newName;
    }

    function updateTemplateMaxSupply(uint256 _templateId, uint256 _newMaxSupply) external onlyCreator(_templateId) {
        Template storage template = templates[_templateId];
        require(template.isActive, "Template is not active");
        require(_newMaxSupply >= template.currentSupply, "New max supply too low");
        template.maxSupply = _newMaxSupply;
    }

    function setTemplateCreationPrice(uint256 _newPrice) external onlyOwner {
        require(_newPrice > 0, "Price must be greater than 0");
        templateCreationPrice = _newPrice;
    }

    // ============ View Functions ============
    function getTemplate(uint256 _templateId) external view returns (Template memory) {
        require(templates[_templateId].creator != address(0), "Template does not exist");
        return templates[_templateId];
    }

    function getTemplates(uint256[] calldata _templateIds) external view returns (Template[] memory) {
        Template[] memory result = new Template[](_templateIds.length);
        for (uint256 i = 0; i < _templateIds.length; i++) {
            require(templates[_templateIds[i]].creator != address(0), "Template does not exist");
            result[i] = templates[_templateIds[i]];
        }
        return result;
    }

    function getTemplateType(uint256 _templateId) external view returns (ComponentType) {
        require(templates[_templateId].creator != address(0), "Template does not exist");
        return templates[_templateId].componentType;
    }

    function getTemplatesOfCreator(address _creator) external view returns (uint256[] memory) {
        return creatorTemplates[_creator];
    }

    function getTemplatesOfType(ComponentType _componentType) external view returns (uint256[] memory) {
        return templatesByType[_componentType];
    }

        // Add new view functions
    function getTokenTemplate(uint256 _tokenId) external view returns (uint256) {
        require(tokenTemplate[_tokenId] != 0, "Token does not exist");
        return tokenTemplate[_tokenId];
    }

    function uri(uint256 _tokenId) public view virtual override returns (string memory) {
        uint256 templateId = tokenTemplate[_tokenId];
        Template storage template = templates[templateId];
        require(template.creator != address(0), "URI query for nonexistent token");
        require(template.isActive, "Template is not active");

        bytes memory json = abi.encodePacked(
            '{"name":"WeNads ',
            getComponentTypeName(template.componentType),
            ' #',
            Strings.toString(_tokenId),
            '", "description":"WeNads Component NFT", "image":"data:image/png;base64,',
            PNG_HEADER,
            template.imageData,
            '", "attributes":[{"trait_type":"Component Type","value":"',
            getComponentTypeName(template.componentType),
            '"}, {"trait_type":"Template ID","value":"',
            Strings.toString(templateId),
            '"}, {"trait_type":"Creator","value":"',
            Strings.toHexString(template.creator),
            '"}, {"trait_type":"Max Supply","value":"',
            Strings.toString(template.maxSupply),
            '"}, {"trait_type":"Current Supply","value":"',
            Strings.toString(template.currentSupply),
            '"}]}'
        );

        return string(
            abi.encodePacked(
                "data:application/json,",
                json
            )
        );
    }

    // ============ Internal Helper Functions ============
    function getComponentTypeName(ComponentType _type) internal pure returns (string memory) {
        if (_type == ComponentType.BACKGROUND) return "Background";
        if (_type == ComponentType.HAIRSTYLE) return "Hairstyle";
        if (_type == ComponentType.EYES) return "Eyes";
        if (_type == ComponentType.MOUTH) return "Mouth";
        if (_type == ComponentType.FLOWER) return "Flower";
        revert("Invalid component type");
    }

    function _removeHeader(string memory _imageData) internal pure returns (string memory) {
        bytes memory data = bytes(_imageData);
        bytes memory header = bytes(PNG_HEADER);
        
        if (data.length < header.length) {
            return _imageData;
        }
        
        bool hasHeader = true;
        for (uint i = 0; i < header.length; i++) {
            if (data[i] != header[i]) {
                hasHeader = false;
                break;
            }
        }
        
        if (!hasHeader) {
            return _imageData;
        }
        
        // Create new bytes array without header
        bytes memory result = new bytes(data.length - header.length);
        for (uint i = 0; i < result.length; i++) {
            result[i] = data[i + header.length];
        }
        
        return string(result);
    }

    // Add this function after constructor
    function setWeNadsContract(address _weNadsContract) external onlyOwner {
        require(weNadsContract == address(0), "WeNads contract already set");
        weNadsContract = _weNadsContract;
    }

    // Override _beforeTokenTransfer to prevent transfers of locked tokens
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts
    ) internal virtual override {
        require(!isTokenLocked[ids[0]], "Token is locked");
        
        // Update userTemplateToken mapping
        if (from != address(0)) { // not minting
            uint256 templateId = tokenTemplate[ids[0]];
            if (userTemplateToken[from][templateId] == ids[0]) {
                delete userTemplateToken[from][templateId];
            }
        }
        if (to != address(0)) { // not burning
            uint256 templateId = tokenTemplate[ids[0]];
            userTemplateToken[to][templateId] = ids[0];
        }
        
        super._update(from, to, ids, amounts);
    }

    // Add function to lock/unlock tokens (only callable by WeNads contract)
    function setTokenLockStatus(uint256 tokenId, bool locked, address tokenOwner) external {
        require(msg.sender == weNadsContract, "Only WeNads contract can lock/unlock tokens");
        require(balanceOf(tokenOwner, tokenId) == 1, "Must own token to lock/unlock");
        isTokenLocked[tokenId] = locked;
    }

    // Add this new view function
    function getUserTemplateToken(address user, uint256 templateId) external view returns (uint256) {
        uint256 tokenId = userTemplateToken[user][templateId];
        require(tokenId != 0 && balanceOf(user, tokenId) > 0, "User does not own this template");
        return tokenId;
    }

}
