const fs=require('node:fs'); const {Resvg}=require('@resvg/resvg-js');
for(const [lang,title,lines,subtitle] of [
 ['en','Jas Miami Method',['Training. Fueling.','Recovery. In context.'],'A clearer next step, with or without a wearable.'],
 ['es','Jas Miami Method',['Entrenamiento. Alimentación.','Recuperación. Con contexto.'],'Un siguiente paso más claro, con o sin dispositivo.']
]){
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#faf7f0"/><path d="M0 580H1200" stroke="#a93228" stroke-width="10"/><text x="72" y="105" font-size="28" font-family="serif" fill="#a93228">'+title+'</text><text x="72" y="265" font-size="58" font-family="serif" fill="#24251f">'+lines[0]+'</text><text x="72" y="345" font-size="58" font-family="serif" fill="#24251f">'+lines[1]+'</text><text x="72" y="455" font-size="27" font-family="sans-serif" fill="#555b51">'+subtitle+'</text><text x="72" y="530" font-size="22" font-family="sans-serif" fill="#555b51">jasmiamimethod.fit</text></svg>';
 fs.writeFileSync('public/website-social-'+lang+'.svg',svg);fs.writeFileSync('public/website-social-'+lang+'.png',new Resvg(svg).render().asPng());
}
