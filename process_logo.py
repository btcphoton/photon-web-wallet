from PIL import Image
import numpy as np

def process_logo():
    input_path = '/home/waheed/.gemini/antigravity/brain/a87bf339-2f80-4aea-8f2b-4ff165589965/uploaded_image_1765992774679.png'
    output_path = 'public/logo.png'

    try:
        # Open the image
        img = Image.open(input_path).convert("RGB")
        
        # Resize to 128x128 for extension icon
        new_img = img.resize((128, 128), Image.Resampling.LANCZOS)
        
        # Save
        new_img.save(output_path)
        print(f"Successfully processed and saved logo to {output_path}")
        
    except Exception as e:
        print(f"Error processing logo: {e}")

if __name__ == "__main__":
    process_logo()
