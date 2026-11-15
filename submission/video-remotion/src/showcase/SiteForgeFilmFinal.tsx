// SITE//FORGE final 30 s demo film (NASA Space Apps 2026). Captures from screens_v7 (main 11924de, local production build), upscaled 1600x900 -> 1920x1080.
// Tokens from siteforge-eight-wine.vercel.app CSS: bg #050505, text #F5F5F5, muted #A3A3A3, earth #8FD3FF, sun #FFC46B, glass borders. Display font Sora.
import React from 'react';
import {AbsoluteFill, Audio, Easing, Img, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {loadFont as lSora} from '@remotion/google-fonts/Sora';
import {loadFont as lMono} from '@remotion/google-fonts/JetBrainsMono';
const SANS = lSora('normal', {weights: ['400', '600', '700'], subsets: ['latin']}).fontFamily;
const MONO = lMono('normal', {weights: ['500'], subsets: ['latin']}).fontFamily;
const BG = '#050505', ELEV = '#0E0E0F', TEXT = '#F5F5F5', TEXT2 = '#D4D4D4', MUTED = '#A3A3A3', EARTH = '#8FD3FF', SUN = '#FFC46B', BORDER = 'rgba(255,255,255,.16)';
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const io = Easing.bezier(0.65, 0, 0.35, 1);
const B = 18;
const sp = (f: number, d: number, fps: number, cfg = {damping: 14, stiffness: 170}) => spring({frame: f - d, fps, config: cfg});
const SRC_DATA = 'NASA LOLA (PGDA 78/90) · JPL Horizons';
const SRC_MOON = 'LROC WAC mosaic (NASA/GSFC/ASU) · NASA LOLA relief';
const Wordmark: React.FC<{s: number}> = ({s}) => <span style={{fontFamily: SANS, fontWeight: 600, fontSize: s, letterSpacing: '0.18em', color: TEXT, whiteSpace: 'nowrap'}}>SITE<span style={{color: EARTH}}>//</span>FORGE</span>;
const Kinetic: React.FC<{text: string; hi?: string; size: number; delay?: number; color?: string; weight?: number}> = ({text, hi = '', size, delay = 0, color = TEXT, weight = 700}) => {
  const f = useCurrentFrame(); const {fps} = useVideoConfig(); const strip = (x: string) => x.replace(/[.,:|()]/g, '');
  const words = text.split(' '); const mark = new Set<number>();
  hi.split('+').filter(Boolean).forEach((ph) => { const pw = ph.trim().split(' ').map(strip); for (let i = 0; i + pw.length <= words.length; i++) { if (pw.every((x, j) => strip(words[i + j]) === x)) { pw.forEach((_, j) => mark.add(i + j)); break; } } });
  return <div style={{fontFamily: SANS, fontWeight: weight, letterSpacing: '-0.03em', lineHeight: 1.12, fontSize: size, color}}>
    {words.map((w0, i) => { const br = w0.endsWith('|'); const w = br ? w0.slice(0, -1) : w0; const p = sp(f, delay + i * 2, fps);
      return <React.Fragment key={i}><span style={{display: 'inline-block', marginRight: '0.24em', opacity: Math.min(1, p * 2), transform: `translateY(${(1 - p) * 0.45}em)`, color: mark.has(i) ? EARTH : color}}>{w}</span>{br && <br />}</React.Fragment>; })}
  </div>; };
// ---------- layout (16:9) ----------
const L = {x: 210, y: 104, w: 1500, h: 752, bar: 56, capTop: 884, capLeft: 210, capW: 1500, cap: 66, capLong: 56};
const Stars: React.FC<{n?: number}> = ({n = 46}) => { const f = useCurrentFrame();
  return <>{Array.from({length: n}, (_, i) => ({x: (i * 397 + 53) % 1920, y: (i * 211 + 17) % 1080, r: 1 + (i % 3) * 0.6, o: 0.12 + ((i * 7) % 10) / 40})).map((s, i) =>
    <div key={i} style={{position: 'absolute', left: s.x, top: s.y, width: s.r * 2, height: s.r * 2, borderRadius: '50%', background: '#fff', opacity: s.o * (0.75 + 0.25 * Math.sin(f / 11 + i))}} />)}</>; };
const Stage: React.FC = () => { const f = useCurrentFrame();
  return <AbsoluteFill style={{background: BG}}><Stars />
    <div style={{position: 'absolute', right: -520 + Math.sin(f / 70) * 20, top: -640, width: 1400, height: 1400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(143,211,255,0.16) 0%, rgba(143,211,255,0.05) 40%, rgba(5,5,5,0) 70%)'}} /></AbsoluteFill>; };
const Caption: React.FC<{text: string; hi?: string; delay?: number}> = ({text, hi, delay = 4}) => {
  const size = text.length > 44 ? 52 : text.length > 36 ? L.capLong : L.cap;
  return <div style={{position: 'absolute', left: L.capLeft, width: L.capW, top: L.capTop}}><Kinetic text={text} hi={hi} size={size} delay={delay} /></div>; };
const Chapter: React.FC<{text: string; n: string}> = ({text, n}) => { const f = useCurrentFrame(); const {fps} = useVideoConfig(); const p = sp(f, 0, fps);
  return <div style={{position: 'absolute', left: 60, top: 34, display: 'flex', alignItems: 'center', gap: 14, fontFamily: SANS, fontWeight: 600, fontSize: 30, letterSpacing: '0.16em', textTransform: 'uppercase', color: TEXT,
    opacity: p, transform: `translateX(${(1 - p) * -30}px)`}}><span style={{fontFamily: MONO, fontWeight: 500, letterSpacing: 0, border: `1.5px solid ${EARTH}`, color: EARTH, borderRadius: 999, padding: '1px 14px', fontSize: 28}}>{n}</span>{text}</div>; };
const Chip: React.FC<{t: string; accent?: boolean; d?: number}> = ({t, accent, d = 6}) => { const f = useCurrentFrame(); const {fps} = useVideoConfig(); const p = sp(f, d, fps);
  return <span style={{fontFamily: MONO, fontWeight: 500, fontSize: 28, color: accent ? BG : TEXT2, background: accent ? EARTH : 'rgba(255,255,255,.05)', border: `1.5px solid ${accent ? EARTH : BORDER}`, borderRadius: 999, padding: '2px 16px', lineHeight: 1.3, transform: `scale(${p})`, opacity: p, whiteSpace: 'nowrap'}}>{t}</span>; };
const TopRight: React.FC<{items: {t: string; accent?: boolean}[]}> = ({items}) => <div style={{position: 'absolute', right: 60, top: 32, display: 'flex', gap: 12}}>{items.map((it, i) => <Chip key={it.t} t={it.t} accent={it.accent} d={6 + i * 4} />)}</div>;
const AiMark: React.FC = () => <div style={{position: 'absolute', right: 60, bottom: 28, fontFamily: MONO, fontWeight: 500, fontSize: 28, color: MUTED, opacity: 0.9}}>AI-generated voice</div>;
// ---------- framed window over a capture ----------
type Box = [number, number, number, number];
type Cam = {f: number; cx: number; cy: number; w: number; h: number};
type Spot = {box: Box | ((f: number) => Box); from: number; to?: number};
type CalloutT = {text: string; from: number; to?: number; spot: number; icon?: 'earth' | 'sun'};
type Layer = {src: string; from?: number; wipe?: [number, number]; dy?: number};
const Dot: React.FC<{c: string; s: number}> = ({c, s}) => <span style={{width: s, height: s, borderRadius: '50%', background: c, boxShadow: `0 0 ${s}px ${c}`, flexShrink: 0}} />;
const Window: React.FC<{layers: Layer[]; keys: Cam[]; spots?: Spot[]; callouts?: CalloutT[]; tilt?: number; label: string}> = ({layers, keys, spots = [], callouts = [], tilt = -7, label}) => {
  const f = useCurrentFrame(); const {fps} = useVideoConfig(); const p = sp(f, -3, fps, {damping: 17, stiffness: 120});
  const fw = 1920, fh = 1080, iw = L.w, ih = L.h - L.bar;
  const zs = keys.map((k) => Math.min(iw / k.w, ih / k.h));
  const lerp = (vals: number[]) => keys.length === 1 ? vals[0] : interpolate(f, keys.map((k) => k.f), vals, {...clamp, easing: io});
  const z = Math.max(lerp(zs), iw / fw, ih / fh);
  const cx0 = lerp(keys.map((k) => k.cx)), cy0 = lerp(keys.map((k) => k.cy));
  const cx = Math.min(Math.max(cx0, iw / 2 / z), fw - iw / 2 / z), cy = Math.min(Math.max(cy0, ih / 2 / z), fh - ih / 2 / z);
  const tx = iw / 2 - cx * z, ty = ih / 2 - cy * z;
  const bx = (s: Spot) => typeof s.box === 'function' ? s.box(f) : s.box;
  const toS = (b: Box) => ({x: tx + b[0] * z, y: ty + b[1] * z, w: (b[2] - b[0]) * z, h: (b[3] - b[1]) * z});
  const alpha = (s: {from: number; to?: number}) => interpolate(f, [s.from, s.from + 8], [0, 1], clamp) * (s.to ? interpolate(f, [s.to, s.to + 6], [1, 0], clamp) : 1);
  const dim = Math.max(0, ...spots.map(alpha));
  return <div style={{position: 'absolute', left: L.x, top: L.y, width: L.w, height: L.h, perspective: 2400}}>
    <div style={{position: 'absolute', inset: 0, background: ELEV, borderRadius: 22, overflow: 'hidden', border: `1.5px solid ${BORDER}`, boxShadow: '0 50px 110px -30px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,.04), 0 0 80px -20px rgba(143,211,255,0.18)', opacity: Math.min(1, p * 2),
      transform: `translateY(${(1 - p) * 150}px) rotateX(${(1 - p) * 12}deg) rotateY(${tilt * (1 - p) + interpolate(f, [0, 180], [0, 1.1], clamp)}deg)`}}>
      <div style={{height: L.bar, display: 'flex', alignItems: 'center', gap: 16, padding: '0 24px', background: 'rgba(255,255,255,.04)', borderBottom: `1.5px solid ${BORDER}`}}>
        <Wordmark s={28} /><span style={{marginLeft: 'auto', fontFamily: MONO, fontWeight: 500, fontSize: 28, color: TEXT2, whiteSpace: 'nowrap'}}>{label}</span></div>
      <div style={{position: 'relative', width: iw, height: ih, overflow: 'hidden', background: BG}}>
        <div style={{position: 'absolute', left: tx, top: ty, width: fw, height: fh, transformOrigin: '0 0', transform: `scale(${z})`}}>
          {layers.map((ly, i) => { const o = ly.from === undefined ? 1 : interpolate(f, [ly.from, ly.from + 8], [0, 1], clamp); if (o <= 0) return null;
            return ly.src.endsWith('.mp4') ? <OffthreadVideo key={i} src={staticFile(ly.src)} muted style={{position: 'absolute', width: fw, height: fh, opacity: o}} />
              : ly.wipe ? (() => { const wp = interpolate(f, ly.wipe!, [0, 100], {...clamp, easing: io}); return <React.Fragment key={i}>
                <Img src={staticFile(ly.src)} style={{position: 'absolute', top: ly.dy ?? 0, width: fw, height: fh, clipPath: `inset(0 ${100 - wp}% 0 0)`}} />
                {wp > 0 && wp < 100 && <div style={{position: 'absolute', left: fw * wp / 100 - 3, top: 0, width: 6, height: fh, background: EARTH, boxShadow: `0 0 30px ${EARTH}`}} />}</React.Fragment>; })()
              : <Img key={i} src={staticFile(ly.src)} style={{position: 'absolute', width: fw, height: fh, opacity: o}} />; })}</div>
        {dim > 0 && <svg width={iw} height={ih} style={{position: 'absolute', inset: 0}}><defs><mask id="m"><rect width={iw} height={ih} fill="white" />
          {spots.map((s, i) => { const a = alpha(s); if (a <= 0) return null; const r = toS(bx(s)); const pad = 10; return <rect key={i} x={r.x - pad} y={r.y - pad} width={r.w + 2 * pad} height={r.h + 2 * pad} rx={16} fill="black" opacity={a} />; })}</mask></defs>
          <rect width={iw} height={ih} fill={`rgba(5,5,5,${0.62 * dim})`} mask="url(#m)" /></svg>}
        {spots.map((s, i) => { const a = alpha(s); if (a <= 0) return null; const r = toS(bx(s)); const pad = 10;
          return <div key={i} style={{position: 'absolute', left: r.x - pad, top: r.y - pad, width: r.w + 2 * pad, height: r.h + 2 * pad, borderRadius: 16, border: `4px solid rgba(143,211,255,${a})`, boxShadow: `0 0 30px rgba(143,211,255,${0.35 * a})`}} />; })}
        {callouts.map((co, i) => { const r = toS(bx(spots[co.spot])); const pp = sp(f, co.from, fps, {damping: 11, stiffness: 190});
          const out = co.to ? interpolate(f, [co.to, co.to + 6], [1, 0], clamp) : 1; if (f < co.from || out <= 0) return null;
          const k = 0.62; const size = Math.min(54, (iw - 40 - 90) / (co.text.length * k + 2.4)); const estW = co.text.length * size * k + size * 2.4 + 30;
          const hgt = size * 1.9; const below = r.y + r.h + 28 + hgt < ih; const top = below ? r.y + r.h + 28 : Math.max(12, r.y - 28 - hgt);
          const left = Math.min(Math.max(20, r.x + r.w / 2 - estW / 2), iw - estW - 20);
          return <div key={i} style={{position: 'absolute', left, top, zIndex: 20, transform: `scale(${pp * out}) rotate(${-1.5 * pp}deg)`, opacity: Math.min(1, pp * 2) * out, transformOrigin: 'center'}}>
            <div style={{display: 'flex', alignItems: 'center', gap: size * 0.4, background: 'rgba(14,14,15,0.92)', border: `1.5px solid ${BORDER}`, borderRadius: 999, padding: `${size * 0.28}px ${size * 0.7}px ${size * 0.28}px ${size * 0.5}px`,
              fontFamily: SANS, fontWeight: 700, fontSize: size, letterSpacing: '-0.02em', color: TEXT, boxShadow: `0 24px 50px -10px rgba(0,0,0,0.85), 0 0 0 3px ${co.icon === 'sun' ? SUN : EARTH}`, whiteSpace: 'nowrap'}}>
              <Dot c={co.icon === 'sun' ? SUN : EARTH} s={size * 0.42} />{co.text}</div></div>; })}
      </div>
    </div></div>; };
// ---------- mast gauge (left margin), steps match the app's 0/2/5/10/20 m control ----------
const STEPS = ['0 m', '2 m', '5 m', '10 m', '20 m'];
const Gauge: React.FC<{lvl: (f: number) => number}> = ({lvl}) => { const f = useCurrentFrame(); const {fps} = useVideoConfig(); const p = sp(f, 4, fps);
  const top = 220, bot = 800, v = lvl(f), y = bot - (bot - top) * v / 4;
  return <div style={{position: 'absolute', left: 0, top: 0, width: 210, height: 1080, opacity: p, transform: `translateX(${(1 - p) * -40}px)`}}>
    <div style={{position: 'absolute', left: 36, top: 160, fontFamily: MONO, fontWeight: 500, fontSize: 28, color: MUTED}}>MAST</div>
    <div style={{position: 'absolute', left: 52, top, width: 8, height: bot - top, borderRadius: 4, background: 'rgba(255,255,255,.1)'}} />
    <div style={{position: 'absolute', left: 52, top: y, width: 8, height: bot - y, borderRadius: 4, background: EARTH, boxShadow: `0 0 18px ${EARTH}`}} />
    <div style={{position: 'absolute', left: 40, top: y - 16, width: 32, height: 32, borderRadius: '50%', background: TEXT, border: `4px solid ${EARTH}`}} />
    {STEPS.map((s, i) => { const yy = bot - (bot - top) * i / 4; const on = Math.abs(v - i) < 0.35;
      return <div key={s} style={{position: 'absolute', left: 92, top: yy - 20, fontFamily: MONO, fontWeight: 500, fontSize: on ? 34 : 28, color: on ? EARTH : MUTED, whiteSpace: 'nowrap'}}>{s}</div>; })}
  </div>; };
// ---------- scenes ----------
type Cut = {d: number; kind: 'hook' | 'end' | 'win'; layers?: Layer[]; keys?: Cam[]; spots?: Spot[]; callouts?: CalloutT[]; cap?: string; hi?: string; chapter?: [string, string]; label?: string; tilt?: number; hits?: number[]; gauge?: (f: number) => number};
const img = (n: string) => `showcase/siteforge-final/${n}.png`;
const LBL = 'Ridge A · 1 Nov–1 Dec 2026 UTC';
const PANO_KEYS: Cam[] = [{f: 0, cx: 960, cy: 540, w: 1400, h: 860}, {f: 10, cx: 960, cy: 540, w: 1400, h: 860}, {f: 44, cx: 960, cy: 545, w: 1300, h: 660}];
const cuts: Cut[] = [
  {d: 138, kind: 'hook'},
  {d: 224, kind: 'win', layers: [{src: img('desktop_05a_panorama_0m')}], chapter: ['01', 'Ground level'], label: 'Ridge A · 0 m · view from the ground',
    cap: 'Ridge A · 0 m · Sun 426 h · Earth 199 h of 720 h', hi: '199 h',
    keys: PANO_KEYS, spots: [{box: [559, 403, 925, 478], from: 60, to: 120}, {box: [315, 759, 1169, 825], from: 128}],
    callouts: [{text: 'Sun and Earth blocked', from: 66, to: 120, spot: 0}, {text: 'Blocked · 1 Nov–1 Dec 2026 UTC', from: 134, spot: 1}], hits: [66, 134]},
  {d: 108, kind: 'win', layers: [{src: img('desktop_05a_panorama_0m')}, {src: img('desktop_05b_panorama_5m'), wipe: [8, 44], dy: 10}], chapter: ['02', 'Raise the mast'], label: 'Ridge A · 0 m → 5 m mast', tilt: 7,
    cap: '5 m mast · Sun 720 h (100%) · Earth 359.5 h', hi: '720 h (100%) + 359.5 h',
    keys: [{f: 0, cx: 960, cy: 545, w: 1300, h: 660}],
    spots: [{box: [315, 759, 1169, 825], from: 52}], callouts: [{text: 'Both in view', from: 58, spot: 0}], hits: [44, 58]},
  {d: 96, kind: 'win', layers: [{src: img('desktop_03_sky_paths_5m')}], chapter: ['03', 'Sky gained'], label: 'Ridge A · 5 m · 3D, 4× vertical relief',
    cap: 'Sky gained at 5 m: Sun +294.0 h · Earth +160.5 h', hi: 'Sky gained',
    keys: [{f: 0, cx: 960, cy: 540, w: 1920, h: 1080}, {f: 8, cx: 960, cy: 540, w: 1920, h: 1080}, {f: 40, cx: 700, cy: 450, w: 1400, h: 650}],
    spots: [{box: [0, 200, 1425, 403], from: 44}], callouts: [{text: 'Green = sky the mast gains', from: 50, spot: 0}], hits: [50]},
  {d: 74, kind: 'win', layers: [{src: img('desktop_04_raise_mast_20m')}], chapter: ['04', '20 m'], label: LBL, tilt: 7,
    cap: '20 m · Earth 382 h · same as 10 m', hi: '382 h',
    keys: [{f: 0, cx: 1500, cy: 360, w: 1125, h: 525}],
    spots: [{box: [1681, 146, 1894, 310], from: 10}], callouts: [{text: 'No gain over 10 m', from: 18, spot: 0}], hits: [18]},
  {d: 176, kind: 'win', layers: [{src: img('desktop_08_optimizer_result')}], chapter: ['05', 'Optimize'], label: LBL,
    cap: '130 configurations · 17 feasible · 5 m recommended', hi: '5 m recommended',
    keys: [{f: 0, cx: 960, cy: 540, w: 1920, h: 1080}, {f: 10, cx: 960, cy: 540, w: 1920, h: 1080}, {f: 44, cx: 375, cy: 650, w: 750, h: 525}],
    spots: [{box: [50, 460, 538, 505], from: 56}], callouts: [{text: 'Recommended: 5 m', from: 62, spot: 0}], hits: [62]},
  {d: 66, kind: 'end'},
];
export const SFF_DUR = cuts.reduce((a, s) => a + s.d, 0);
const STARTS = cuts.map((_, i) => cuts.slice(0, i).reduce((a, s) => a + s.d, 0));
export const SFF_CUTS = cuts.map((c, i) => ({start: STARTS[i], d: c.d, cap: c.cap ?? null}));
// voiceover (edge-tts, trimmed) start frame + length
export const VOF = [{f: 4, n: 131}, {f: 140, n: 227}, {f: 370, n: 194}, {f: 570, n: 55}, {f: 640, n: 174}, {f: 822, n: 44}];
// ---------- hook: 3D Moon from the hero capture ----------
const MOON = 'ellipse(385px 452px at 945px 560px)';
const Para: React.FC = () => <div style={{position: 'absolute', left: 420, top: 270, width: 190, height: 140, background: BG, filter: 'blur(10px)'}} />;
const Hook: React.FC = () => { const f = useCurrentFrame(); const {fps} = useVideoConfig();
  const z = interpolate(f, [0, 138], [1.0, 1.12], clamp); const p = sp(f, 4, fps), q = sp(f, 18, fps);
  return <AbsoluteFill style={{background: BG}}><Stars n={60} />
    <div style={{position: 'absolute', left: 1330 - 897 * z, top: 560 - 560 * z, width: 1920, height: 1080, transformOrigin: '0 0', transform: `scale(${z})`, opacity: interpolate(f, [0, 12], [0, 1], clamp)}}>
      <Img src={staticFile(img('desktop_01_hero'))} style={{position: 'absolute', width: 1920, height: 1080, clipPath: MOON}} />
      <Img src={staticFile(img('desktop_01_hero'))} style={{position: 'absolute', width: 1920, height: 1080, clipPath: 'inset(869px 708px 60px 700px round 14px)'}} /></div>
    <AbsoluteFill style={{background: 'linear-gradient(90deg, #050505 0%, rgba(5,5,5,0.9) 30%, rgba(5,5,5,0) 55%)'}} />
    <div style={{position: 'absolute', left: 120, top: 360, width: 1000}}>
      <div style={{opacity: p, transform: `translateY(${(1 - p) * 40}px)`}}><Wordmark s={96} /></div>
      <div style={{marginTop: 40}}><Kinetic text="Lunar Landing Site Navigator" hi="Navigator" size={60} delay={18} weight={600} color={TEXT2} /></div>
      <div style={{marginTop: 46, opacity: q, fontFamily: MONO, fontWeight: 500, fontSize: 30, color: MUTED}}>Azotadores de Agentes · NASA Space Apps 2026</div>
    </div>
    <div style={{position: 'absolute', left: 120, bottom: 52, fontFamily: MONO, fontWeight: 500, fontSize: 28, color: MUTED}}>{SRC_MOON}</div>
  </AbsoluteFill>; };
const End: React.FC = () => { const f = useCurrentFrame(); const {fps} = useVideoConfig(); const p = sp(f, 0, fps), r = sp(f, 10, fps), m = sp(f, 0, fps, {damping: 30, stiffness: 40});
  return <AbsoluteFill style={{background: BG}}><Stars />
    <div style={{position: 'absolute', left: 1520 - 897 * 1.0, top: 560 - 560 * 1.0, width: 1920, height: 1080, opacity: 0.6 * m, transformOrigin: '0 0', transform: `scale(${1.0 * (1.04 - 0.04 * m)})`}}>
      <Img src={staticFile(img('desktop_01_hero'))} style={{width: 1920, height: 1080, clipPath: MOON}} />
      <div style={{position: 'absolute', left: 680, top: 850, width: 560, height: 190, background: BG, filter: 'blur(14px)'}} /></div>
    <AbsoluteFill style={{background: 'linear-gradient(90deg, #050505 0%, rgba(5,5,5,0.96) 44%, rgba(5,5,5,0.15) 66%, rgba(5,5,5,0.15) 100%), linear-gradient(0deg, #050505 0%, rgba(5,5,5,0) 30%), linear-gradient(180deg, #050505 0%, rgba(5,5,5,0) 30%)'}} />
    <div style={{position: 'absolute', left: 150, top: 230, width: 1640}}>
      <div style={{opacity: p, transform: `translateY(${(1 - p) * 30}px)`}}><Wordmark s={96} /></div>
      <div style={{marginTop: 40}}><Kinetic text="Try it live." hi="live." size={80} delay={4} /></div>
      <div style={{marginTop: 44, opacity: r, transform: `translateY(${(1 - r) * 24}px)`}}>
        <span style={{display: 'inline-block', background: 'rgba(255,255,255,.06)', border: `1.5px solid ${BORDER}`, color: TEXT, borderRadius: 999, padding: '14px 36px', fontFamily: MONO, fontWeight: 500, fontSize: 50, boxShadow: `0 0 0 3px ${EARTH}, 0 0 40px -6px rgba(143,211,255,0.5)`}}>siteforge-moon.vercel.app</span></div>
      <div style={{marginTop: 46, fontFamily: MONO, fontWeight: 500, fontSize: 30, color: TEXT2, opacity: r}}>Azotadores de Agentes · Lunar Landing Site Navigator</div>
      <div style={{marginTop: 14, fontFamily: MONO, fontWeight: 500, fontSize: 28, color: MUTED, opacity: r}}>AI-generated voice · NASA LOLA · JPL Horizons · LROC</div>
    </div>
  </AbsoluteFill>; };
const duck = (fr: number) => { let g = 1; VOF.forEach((v) => { g = Math.min(g, interpolate(fr, [v.f - 6, v.f + 2, v.f + v.n + 4, v.f + v.n + 16], [1, 0.42, 0.42, 1], clamp)); }); return g; };
const CutWipe: React.FC<{children: React.ReactNode; first?: boolean}> = ({children, first}) => { const f = useCurrentFrame();
  const y = first ? 0 : interpolate(f, [0, 8], [100, 0], {...clamp, easing: Easing.out(Easing.cubic)});
  return <AbsoluteFill style={{clipPath: `inset(${y}% 0 0 0)`}}>{children}
    {!first && y > 0 && <div style={{position: 'absolute', left: 0, right: 0, top: `${y}%`, height: 6, background: EARTH, boxShadow: `0 0 24px ${EARTH}`}} />}</AbsoluteFill>; };
const Scene: React.FC<{c: Cut}> = ({c}) => {
  if (c.kind === 'hook') return <Hook />;
  if (c.kind === 'end') return <End />;
  return <><Stage />
    <Window layers={c.layers!} keys={c.keys!} spots={c.spots} callouts={c.callouts} tilt={c.tilt} label={c.label!} />
    {c.gauge && <Gauge lvl={c.gauge} />}
    {c.chapter && <Chapter n={c.chapter[0]} text={c.chapter[1]} />}<TopRight items={[{t: SRC_DATA}]} />
    {c.cap && <Caption text={c.cap} hi={c.hi} />}</>; };
export const SiteForgeFilmFinal: React.FC = () => <AbsoluteFill style={{background: BG, overflow: 'hidden'}}>
  <Audio src={staticFile('audio/siteforge-final/bed.wav')} volume={(fr) => 0.6 * duck(fr) * interpolate(fr, [SFF_DUR - 24, SFF_DUR - 1], [1, 0], clamp)} />
  {VOF.map((v, i) => <Sequence key={'vo' + i} from={v.f} durationInFrames={v.n + 6}><Audio src={staticFile(`audio/siteforge-final/vo${i + 1}.wav`)} volume={1.0} /></Sequence>)}
  {cuts.map((c, i) => <Sequence key={i} from={STARTS[i]} durationInFrames={c.d}><CutWipe first={i === 0}><Scene c={c} /></CutWipe></Sequence>)}
  <AiMark />
  {STARTS.slice(1).map((s) => <Sequence key={'w' + s} from={s - 6} durationInFrames={24}><Audio src={staticFile('audio/siteforge-final/whoosh.wav')} volume={s === STARTS[cuts.length - 1] ? 0 : 0.25} /></Sequence>)}
  {cuts.flatMap((c, i) => (c.hits || []).map((h) => <Sequence key={`h${i}-${h}`} from={STARTS[i] + h} durationInFrames={12}><Audio src={staticFile('audio/siteforge-final/hit.wav')} volume={0.3} /></Sequence>))}
  <Sequence from={STARTS[cuts.length - 1] + 18} durationInFrames={48}><Audio src={staticFile('audio/siteforge-final/chime.wav')} volume={0.3} /></Sequence>
</AbsoluteFill>;
