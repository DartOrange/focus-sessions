"""Draw the original three-stroke Focus Sessions mark. Requires Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw

image = Image.new('RGB', (1024, 1024), '#101E25')
draw = ImageDraw.Draw(image)
draw.ellipse((185,185,839,839), outline='#2B4047', width=12)
for x, top, bottom in [(385,420,604),(487,348,676),(589,420,604)]:
    draw.rounded_rectangle((x,top,x+50,bottom), radius=25, fill='#C5F28C')
image.save(Path(__file__).resolve().parent.parent / 'assets/icon.png')
