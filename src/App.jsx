import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowDown, ArrowUpRight, Flower2, Heart, Music2, Pause, Play, Sparkles, X, Volume2 } from 'lucide-react'
import { photos } from './data/photos'
import { compliments as defaultCompliments } from './data/compliments'
import { consent, track } from './lib/analytics'
import ConsentBanner from './components/ConsentBanner'
import OwnerDashboard from './components/OwnerDashboard'

function LineText({ value }) { return <>{String(value || '').split('\\n').map((line, i) => <span key={i}>{i > 0 && <br/>}{line}</span>)}</> }

const reveal = { hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0, transition: { duration: .65, ease: [0.22,1,.36,1] } } }

function PhotoCard({ photo, index, onOpen, onFavorite }) {
  return <motion.article className={`photo-card card-${index % 6}`} variants={reveal} initial="hidden" whileInView="visible" viewport={{ once:true, amount:.12 }} whileHover={{ y:-6 }}>
    <button className="photo-open" onClick={() => onOpen(photo)} aria-label={`View ${photo.title}`}>
      <div className="photo-wrap"><img src={photo.src} alt={photo.alt || photo.title} loading="lazy"/><span className="photo-number">{String(index+1).padStart(2,'0')}</span></div>
      <div className="photo-meta"><span>{photo.kind}</span><h3>{photo.title}</h3><p>{photo.caption}</p></div>
    </button>
    <button className="photo-favourite" onClick={() => onFavorite(photo)} aria-label={`Favourite ${photo.title}`}><Heart size={14}/> {photo.favoriteLabel || 'My favourite'}</button>
  </motion.article>
}

function PublicSite() {
  const [entered,setEntered] = useState(false)
  const [active,setActive] = useState(null)
  const [letter,setLetter] = useState(false)
  const [compliment,setCompliment] = useState('')
  const [musicOn,setMusicOn] = useState(false)
  const [selectedStyle,setSelectedStyle] = useState('')
  const [zoom,setZoom] = useState(1)
  const galleryRef = useRef(null)
  const [siteContent,setSiteContent] = useState({photos,quotes:defaultCompliments,keepsakeImages:['/keepsakes/birthday-artwork.jpg','/keepsakes/film-poster-artwork.jpg'],copy:{},qualities:[],pollOptions:[],keepsakeDetails:[]})
  const copy = siteContent.copy || {}
  const t = (key, fallback='') => copy[key] || fallback
  const audio = useRef(null)
  useEffect(() => { fetch('/api/content').then(r=>r.ok?r.json():null).then(c=>{if(c){setSiteContent(c);if(c.copy?.siteName)document.title=c.copy.siteName}}).catch(()=>{}) }, [])
  useEffect(() => {
    let observer
    const start = () => {
      if (!consent() || observer) return
      const seen = new Set()
      observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const section = entry.target.getAttribute('data-track-section')
            if (section && !seen.has(section)) { seen.add(section); track('section_view', section) }
          }
        })
      }, { threshold: 0.35 })
      document.querySelectorAll('[data-track-section]').forEach(node => observer.observe(node))
    }
    start()
    const changed = () => { if (consent()) start(); else if (observer) { observer.disconnect(); observer = null } }
    window.addEventListener('nidhi-consent-changed', changed)
    return () => { if (observer) observer.disconnect(); window.removeEventListener('nidhi-consent-changed', changed) }
  }, [])

  useEffect(() => {
    const rail = galleryRef.current
    if (!rail || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => {
      if (document.hidden || active) return
      const max = rail.scrollWidth - rail.clientWidth
      if (max <= 0) return
      if (rail.scrollLeft >= max - 8) rail.scrollTo({ left: 0, behavior: 'smooth' })
      else rail.scrollBy({ left: Math.min(rail.clientWidth * .72, 340), behavior: 'smooth' })
    }, 5200)
    return () => window.clearInterval(timer)
  }, [active])
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') { setActive(null); setLetter(false); setZoom(1) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const slideGallery = direction => {
    if (!galleryRef.current) return
    galleryRef.current.scrollBy({ left: direction * Math.min(galleryRef.current.clientWidth * .82, 420), behavior: 'smooth' })
  }
  const toggleMusic = async () => {
    if (!audio.current) return
    if (musicOn) { audio.current.pause(); setMusicOn(false); return }
    try { await audio.current.play(); setMusicOn(true) }
    catch { alert('Optional music: add your licensed track as public/music/your-song.mp3 first.') }
  }
  const newCompliment = () => {
    track('compliment_refresh')
    const pool = (siteContent.quotes || defaultCompliments).filter(x => x !== compliment)
    const choices = pool.length ? pool : (siteContent.quotes || defaultCompliments)
    setCompliment(choices[Math.floor(Math.random()*choices.length)] || '')
  }

  return <main>
    <div className="ambient" aria-hidden="true"><i>✿</i><i>✧</i><i>❀</i><i>✳</i></div>
    <AnimatePresence>{!entered && <motion.div className="welcome" initial={{opacity:1}} exit={{opacity:0,scale:1.025}} transition={{duration:.7}}>
      <div className="welcome-frame"><span className="tiny-label">{t('welcomeEyebrow','A LITTLE SOMETHING, JUST FOR YOU')}</span><div className="welcome-flower">✿</div><p className="script">{t('welcomeScript','a little world for')}</p><h1>{t('welcomeName','Nidhi')}<span>.</span></h1><p className="welcome-copy">{t('welcomeDescription','A small collection of lovely moments, kind thoughts, and a little appreciation.')}</p><button className="pill-btn" onClick={()=>setEntered(true)}>{t('welcomeButton','Step inside')} <ArrowUpRight size={16}/></button><small>{t('welcomeFooter','MADE WITH CARE · 2026')}</small></div>
    </motion.div>}</AnimatePresence>
    <audio ref={audio} src="/music/your-song.mp3" loop preload="none"/>
    <header className="topbar"><a className="wordmark" href="#home">{t('siteName','Nidhi Little World')}<span>✿</span></a><nav><a href="#gallery">{t('navGallery','Gallery')}</a><a href="#little-things">{t('navAppreciation','Appreciation')}</a><a href="#note">{t('navNote','A note')}</a></nav><button className="music-btn" onClick={toggleMusic}>{musicOn?<Pause size={15}/>:<Play size={15}/>}<span>{musicOn?t('musicPause','Pause'):t('musicButton','Music')}</span></button></header>

    <section className="hero" id="home" data-track-section="home">
      <div className="hero-copy"><p className="eyebrow"><span/> {t('heroEyebrow','A LITTLE PAGE, MADE WITH APPRECIATION')}</p><h2><LineText value={t('heroTitle','Some people make\\nordinary days feel\\na little brighter.')}/></h2><p className="hero-text">{t('heroDescription','This is a tiny corner of the internet to celebrate the lovely things that make you, you. No big occasion needed.')}</p><a className="under-link" href="#gallery">{t('heroLink','TAKE A LITTLE LOOK')} <ArrowDown size={14}/></a></div>
      <div className="hero-visual"><div className="orbit o1"/><div className="orbit o2"/><div className="hero-photo"><img src={siteContent.photos[0]?.src || "/images/nidhi-original.jpg"} alt={siteContent.photos[0]?.alt || siteContent.photos[0]?.title || "Original portrait"} fetchPriority="high"/><div className="photo-stamp"><LineText value={t('heroStamp','a lovely\\nmoment')}/></div></div><span className="float-note note-a">{t('heroFloatOne','a little sunshine ✿')}</span><span className="float-note note-b">{t('heroFloatTwo','simply you')}</span><span className="hero-spark">✧</span></div>
      <div className="hero-index">01 <span/> {t('heroIndex','A LITTLE INTRO')}</div>
    </section>

    <section className="gallery section-pad" id="gallery" data-track-section="gallery">
      <div className="section-title"><p className="eyebrow centered">{t('galleryEyebrow','THE PHOTO CORNER · 01')}</p><h2><LineText value={t('galleryTitle','A gallery of little\\nlovely things.')}/></h2><p>{t('galleryDescription','Different looks, different moods — one little collection made to feel warm, thoughtful, and full of colour.')}</p></div>
      <div className="gallery-toolbar"><span>{t('gallerySliderLabel','15 MOMENTS · DRAG TO EXPLORE')}</span><div><button onClick={()=>slideGallery(-1)} aria-label="Previous photos">←</button><button onClick={()=>slideGallery(1)} aria-label="Next photos">→</button></div></div><div className="gallery-grid" ref={galleryRef}>{siteContent.photos.map((p,i)=><PhotoCard key={p.src} photo={{...p,favoriteLabel:t('favoriteButton','My favourite')}} index={i} onOpen={setActive} onFavorite={p=>track('photo_favorite',`slot-${siteContent.photos.indexOf(p)+1}`)}/>)}</div>
      <p className="gallery-note">{t('galleryNote','A CREATIVE COLLECTION · ORIGINAL PHOTO IS IDENTIFIED SEPARATELY')}</p>
    </section>

    <section className="appreciation" id="little-things" data-track-section="appreciation"><div className="appreciation-inner section-pad">
      <p className="eyebrow centered">{t('appreciationEyebrow','A FEW THINGS WORTH CELEBRATING · 02')}</p><h2><LineText value={t('appreciationTitle','Never forget how lovely\\nit is to be you.')}/></h2>
      <div className="qualities">{(siteContent.qualities?.length?siteContent.qualities:[{number:'01 /',title:'Your individuality',description:'There is no one else quite like you. That\'s a pretty wonderful thing.'},{number:'02 /',title:'Your smile',description:'A small reminder that simple things can brighten an ordinary day.'},{number:'03 /',title:'Your own pace',description:'Keep becoming who you want to be. Your journey is yours alone.'}]).map((q,i)=><article key={i}><span>{q.number}</span><h3>{q.title}</h3><p>{q.description}</p></article>)}</div>
      <div className="compliment"><Sparkles size={19}/><p>{compliment || t('complimentFallback','Tap below for a little reminder you deserve to hear.')}</p><button onClick={newCompliment}>{t('complimentButton','A little reminder')} <ArrowUpRight size={15}/></button></div>
    </div></section>

    <section className="style-poll section-pad" data-track-section="appreciation">
      <p className="eyebrow centered">{t('pollEyebrow','A TINY OPTIONAL QUESTION')}</p>
      <h2>{t('pollTitle','Which style do you like most?')}</h2>
      <p className="poll-copy">{t('pollDescription','Pick a favourite if you feel like it. Your choice is counted only if you opted into anonymous analytics.')}</p>
      <div className="style-options">
        {(siteContent.pollOptions?.length?siteContent.pollOptions:[{key:'indian',label:'Indian traditional'},{key:'western',label:'Western looks'},{key:'floral',label:'Floral aesthetic'},{key:'minimal',label:'Minimal & elegant'},{key:'all',label:'A mix of everything'}]).map(({key,label})=><button className={selectedStyle===key?'chosen':''} key={key} onClick={()=>{setSelectedStyle(key);track('style_preference',key)}}>{label}</button>)}
      </div>
    </section>
    <section className="keepsake section-pad" data-track-section="keepsakes"><div className="keepsake-copy"><p className="eyebrow">{t('keepsakeEyebrow','LITTLE KEEPSAKES · 03')}</p><h2><LineText value={t('keepsakeTitle','Some things are\\nworth keeping.')}/></h2><p>{t('keepsakeDescription','A couple of creative poster-style keepsakes from the collection. A little colour, a little nostalgia, and a lot of care.')}</p></div><div className="keepsake-art">{[0,1].map(i=><figure key={i}><img src={siteContent.keepsakeImages?.[i] || (i===0?"/keepsakes/birthday-artwork.jpg":"/keepsakes/film-poster-artwork.jpg")} alt={siteContent.keepsakeDetails?.[i]?.alt || (i===0?"Birthday poster artwork":"Film poster artwork")}/><figcaption><strong>{siteContent.keepsakeDetails?.[i]?.title || (i===0?"Birthday keepsake":"Film poster")}</strong><span>{siteContent.keepsakeDetails?.[i]?.description || "A little keepsake from the collection."}</span></figcaption></figure>)}</div></section>

    <section className="letter-section section-pad" id="note" data-track-section="note"><div className="letter-flower">❀</div><p className="eyebrow centered">{t('letterEyebrow','A NOTE, JUST BECAUSE · 04')}</p><h2><LineText value={t('letterTitle','A little note\\nfor you, Nidhi.')}/></h2><p>{t('letterDescription','Not a big speech. Just a few genuine words, wrapped up with care.')}</p><button className="pill-btn" onClick={()=>{setLetter(true);track('letter_open')}}>{t('letterButton','Open your little letter')} <ArrowUpRight size={16}/></button></section>

    <section className="feedback-strip">
      <p>{t('feedbackPrompt','Before you go, how did this little page feel?')}</p>
      <div>{[['beautiful',t('feedbackBeautiful','Beautiful')],['liked_photos',t('feedbackPhotos','Loved the photos')],['liked_letter',t('feedbackLetter','The note was my favourite')],['liked_design',t('feedbackDesign','Loved the design')],['not_for_me',t('feedbackNotForMe','Not quite my style')]].map(([key,label])=><button key={key} onClick={()=>track('feedback_choice',key)}>{label}</button>)}</div>
      <small>{t('feedbackDisclaimer','Optional · No message or personal details are collected.')}</small>
    </section>
    <footer className="footer"><div className="footer-flower">✿</div><p className="eyebrow centered">{t('footerEyebrow','A LITTLE REMINDER TO TAKE WITH YOU')}</p><h2><LineText value={t('footerTitle','Keep being\\nwonderfully you.')}/></h2><p>{t('footerDescription','Wishing you more reasons to smile, more moments to cherish, and all the good things you deserve.')}</p><div className="signature">{t('footerSignature','made with appreciation')} <Heart size={13} fill="currentColor"/></div><button className="privacy-settings" onClick={()=>window.dispatchEvent(new Event('nidhi-open-consent'))}>{t('privacyButton','Privacy settings')}</button><small>{t('footerCopyright','A LITTLE WORLD FOR NIDHI · 2026')}</small></footer>

    <AnimatePresence>{active && <motion.div className="overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={()=>{setActive(null);setZoom(1)}}><button className="close" aria-label="Close" onClick={()=>{setActive(null);setZoom(1)}}><X/></button><motion.div className="lightbox" initial={{scale:.94,y:16}} animate={{scale:1,y:0}} onClick={e=>e.stopPropagation()}><div className="lightbox-image-stage"><img src={active.src} alt={active.alt || active.title} style={{transform:`scale(${zoom})`}}/></div><div className="zoom-tools"><button onClick={()=>setZoom(z=>Math.max(.8,z-.2))} aria-label="Zoom out">−</button><span>{Math.round(zoom*100)}%</span><button onClick={()=>setZoom(z=>Math.min(2.2,z+.2))} aria-label="Zoom in">+</button><button onClick={()=>setZoom(1)}>Reset</button></div><div><span>{active.kind}</span><h3>{active.title}</h3><p>{active.caption}</p></div></motion.div></motion.div>}
    {letter && <motion.div className="overlay paper-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={()=>setLetter(false)}><button className="close" aria-label="Close" onClick={()=>setLetter(false)}><X/></button><motion.article className="paper" initial={{y:25,scale:.97}} animate={{y:0,scale:1}} onClick={e=>e.stopPropagation()}><span className="paper-flower">✿</span><p className="eyebrow centered">{t('letterModalEyebrow','A SMALL NOTE FOR YOU')}</p><h2>{t('letterGreeting','Hey Nidhi,')}</h2><p>{t('letterParagraphOne','I wanted to make something a little different instead of sending an ordinary message.')}</p><p>{t('letterParagraphTwo','This is simply a small way of appreciating you. Your individuality and the little things that make you who you are deserve to be celebrated.')}</p><p>{t('letterParagraphThree','I hope this little surprise brings a smile to your face. Keep being yourself, keep growing, and never forget that you deserve kindness and happiness.')}</p><p className="signoff">{t('letterSignoff','With appreciation,')}<br/><em>{t('letterSignature',"someone who thinks you're pretty wonderful.")}</em></p><button className="paper-close" onClick={()=>setLetter(false)}>{t('letterClose','Close this note')}</button></motion.article></motion.div>}</AnimatePresence>
    <ConsentBanner />
    <div className="mobile-footer-mark">✿ {t('footerCopyright','A LITTLE WORLD FOR NIDHI · 2026')} ✿</div>
  </main>
}
export default function App(){ return window.location.pathname.startsWith('/owner-dashboard') ? <OwnerDashboard/> : <PublicSite/> }
