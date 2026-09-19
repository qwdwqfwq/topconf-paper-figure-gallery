from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[1]; files=sorted((ROOT/'images').glob('*/final/*.jpg'))[:6]
font=ImageFont.load_default(); frames=[]
for i,p in enumerate(files):
    im=Image.open(p).convert('RGB'); im.thumbnail((900,560)); canvas=Image.new('RGB',(960,680),'#f6f7fb');
    canvas.paste(im,((960-im.width)//2,70)); d=ImageDraw.Draw(canvas); d.text((30,25), 'Top-Conf Figure Gallery', fill='#1c2333',font=font)
    label='Search: gaussian' if i<3 else 'Lightbox: Figure 1 / paper link'; d.rounded_rectangle((30,610,930,655), radius=10, fill='#1c2333'); d.text((48,625),label,fill='white',font=font); frames.append(canvas)
out=ROOT/'docs/demo.gif'; frames[0].save(out,save_all=True,append_images=frames[1:],duration=650,loop=0,optimize=True); print(out)
