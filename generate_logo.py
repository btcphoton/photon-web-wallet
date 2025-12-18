from PIL import Image, ImageDraw

# Create a 128x128 image with orange background
img = Image.new('RGB', (128, 128), color='#f7931a')
draw = ImageDraw.Draw(img)

# Define lightning bolt coordinates (approximate center)
# Points: (x, y)
bolt_points = [
    (74, 18),  # Top right start
    (40, 68),  # Middle left
    (62, 68),  # Middle indent
    (54, 110), # Bottom point
    (88, 60),  # Middle right
    (66, 60)   # Middle indent right
]

# Draw the lightning bolt in white
draw.polygon(bolt_points, fill='white')

# Save the image
img.save('public/logo.png')
print("Logo generated at public/logo.png")
