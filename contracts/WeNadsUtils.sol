// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/Strings.sol";
import "./WeNadsComponent.sol";
import "./lib/SmallSolady.sol";

contract WeNadsUtils {
    using Strings for uint256;
    WeNadsComponent public immutable componentContract;

    string constant PNG_HEADER = "iVBORw0KGgoAAAANSUhEUgAA";
    string constant bodyUri = "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";

    constructor(address _componentContract) {
        componentContract = WeNadsComponent(_componentContract);
    }

    struct AvatarData {
        string name;
        uint256 backgroundId;
        uint256 headId;
        uint256 eyesId;
        uint256 mouthId;
        uint256 accessoryId;
    }

    function generateTokenURI(AvatarData memory avatar) external view returns (string memory) {
        // Get image URIs from component contract
        WeNadsComponent.Template memory bg = componentContract.getTemplate(componentContract.getTokenTemplate(avatar.backgroundId));
        WeNadsComponent.Template memory head = componentContract.getTemplate(componentContract.getTokenTemplate(avatar.headId));
        WeNadsComponent.Template memory eyes = componentContract.getTemplate(componentContract.getTokenTemplate(avatar.eyesId));
        WeNadsComponent.Template memory mouth = componentContract.getTemplate(componentContract.getTokenTemplate(avatar.mouthId));
        WeNadsComponent.Template memory accessory = componentContract.getTemplate(componentContract.getTokenTemplate(avatar.accessoryId));

        string memory svg = generateSVG(bg.imageData, head.imageData, eyes.imageData, mouth.imageData, accessory.imageData);
        
        return formatJSON(avatar, svg);
    }

    function generateSVG(
        string memory backgroundUri,
        string memory headUri,
        string memory eyesUri,
        string memory mouthUri,
        string memory accessoryUri
    ) public pure returns (string memory) {
        return string(abi.encodePacked(
            '<svg viewBox="0 0 72 72" width="256" height="256" xmlns="http://www.w3.org/2000/svg">',
            generateImageLayer(backgroundUri),
            generateImageLayer(bodyUri),
            generateImageLayer(headUri),
            generateImageLayer(eyesUri),
            generateImageLayer(mouthUri),
            generateImageLayer(accessoryUri),
            '</svg>'
        ));
    }

    function generateImageLayer(string memory imageUri) internal pure returns (string memory) {
        return string(abi.encodePacked(
            '<foreignObject x="0" y="0" width="100%" height="100%">',
            '<div xmlns="http://www.w3.org/1999/xhtml">',
            '<img width="100%" height="100%" src="data:image/png;base64,', 
            PNG_HEADER,
            imageUri,
            '" alt="Layer" />',
            '</div>',
            '</foreignObject>'
        ));
    }

    function formatJSON(AvatarData memory avatar, string memory svg) public pure returns (string memory) {
        // Base64 encode the SVG using Solady's implementation
        string memory base64EncodedSvg = string(
            abi.encodePacked(
                "data:image/svg+xml;base64,",
                SmallSolady.encode(bytes(svg))
            )
        );

        return string(abi.encodePacked(
            'data:application/json,{"name":"',
            avatar.name,
            '", "description":"WeNads Avatar NFT", ',
            '"image": "', base64EncodedSvg, '",',
            '"attributes":[',
            '{"trait_type":"Background","value":"', avatar.backgroundId.toString(), '"},',
            '{"trait_type":"Head","value":"', avatar.headId.toString(), '"},',
            '{"trait_type":"Eyes","value":"', avatar.eyesId.toString(), '"},',
            '{"trait_type":"Mouth","value":"', avatar.mouthId.toString(), '"},',
            '{"trait_type":"Accessory","value":"', avatar.accessoryId.toString(), '"}',
            ']}'
        ));
    }
} 