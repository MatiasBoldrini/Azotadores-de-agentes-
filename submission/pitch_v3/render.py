import asyncio, pathlib
from playwright.async_api import async_playwright
D=pathlib.Path(__file__).parent
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome')
        pg=await b.new_page(viewport={'width':1920,'height':1080})
        await pg.goto((D/'index.html').as_uri()); await pg.evaluate('document.fonts.ready')
        await pg.wait_for_timeout(500)
        n=await pg.evaluate("document.querySelectorAll('.slide').length")
        (D/'png').mkdir(exist_ok=True)
        # overflow check: elements whose box exceeds slide or which overflow their own box
        for k in range(n):
            await pg.goto((D/'index.html').as_uri()+f'#{k+1}'); await pg.reload(); await pg.wait_for_timeout(300)
            issues=await pg.evaluate("""()=>{const s=document.querySelector('.slide.active');const R=s.getBoundingClientRect();const out=[];
              s.querySelectorAll('*').forEach(e=>{if(e.closest('aside'))return;const r=e.getBoundingClientRect();if(!r.width)return;
                if(r.right>R.right+1||r.bottom>R.bottom+1||r.left<R.left-1||r.top<R.top-1){ if(!e.closest('.hero')) out.push('OUT '+e.className+' '+e.tagName+' '+(e.textContent||'').slice(0,30))}
                if(e.scrollWidth>e.clientWidth+1&&getComputedStyle(e).overflow!='visible')out.push('CLIP '+e.className)});return out}""")
            print(k+1, issues)
            await pg.evaluate("const h=document.getElementById('hud'); if(h)h.style.display='none'; const n=document.getElementById('notes'); if(n)n.classList.remove('on');")
            await pg.screenshot(path=str(D/'png'/f'slide{k+1}.png'))
        await pg.emulate_media(media='print')
        await pg.pdf(path=str(D/'pitch.pdf'),width='1920px',height='1080px',print_background=True,margin={'top':'0','bottom':'0','left':'0','right':'0'})
        await b.close()
asyncio.run(main())
