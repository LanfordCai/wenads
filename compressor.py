from PIL import Image
import os
import shutil

def process_image(input_path, output_path, size=(300, 300)):
    """
    Resize and optimize a PNG image
    :param input_path: Path to input image
    :param output_path: Path to save compressed image
    :param size: Target size (width, height)
    """
    # Create output directory if it doesn't exist
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    # Open and process the image
    with Image.open(input_path) as img:
        # Convert to RGBA if necessary to preserve transparency
        if img.mode != 'RGBA':
            img = img.convert('RGBA')
            
        # Resize image using LANCZOS resampling
        img = img.resize(size, Image.Resampling.LANCZOS)
        
        # Save the optimized PNG
        img.save(output_path, 'PNG', optimize=True)

def process_all_images(input_root="images", output_root="compressed_images"):
    """
    Process all PNG images in the input directory and its subdirectories
    """
    # Create the output root directory if it doesn't exist
    os.makedirs(output_root, exist_ok=True)
    
    # Walk through all directories and files
    for dirpath, dirnames, filenames in os.walk(input_root):
        # Process each file
        for filename in filenames:
            if filename.lower().endswith('.png'):
                # Construct input and output paths
                input_path = os.path.join(dirpath, filename)
                
                # Create relative path to maintain directory structure
                rel_path = os.path.relpath(dirpath, input_root)
                output_path = os.path.join(output_root, rel_path, filename)
                
                print(f"Processing: {input_path}")
                process_image(input_path, output_path)
                
                # Print size reduction for each image
                original_size = os.path.getsize(input_path)
                compressed_size = os.path.getsize(output_path)
                print(f"  Original size: {original_size/1024:.2f} KB")
                print(f"  Compressed size: {compressed_size/1024:.2f} KB")
                print(f"  Compression ratio: {compressed_size/original_size:.2%}")
                print()

if __name__ == "__main__":
    process_all_images()
    print("Image processing complete!")