// For object-style responses (from read.getTemplate())
export type Template = {
  name: string,
  creator: string,
  maxSupply: bigint,
  currentSupply: bigint,
  price: bigint,
  imageData: string,
  isActive: boolean,
  componentType: number
};

export type Avatar = {
  backgroundId: bigint,   // backgroundId
  headId: bigint,   // headId
  eyesId: bigint,   // eyesId
  mouthId: bigint,   // mouthId
  accessoryId: bigint,   // accessoryId
  name: string    // name
};