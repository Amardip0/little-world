import {useEffect,useState} from 'react'
import {setConsent} from '../lib/analytics'
export default function ConsentBanner(){
 const [show,setShow]=useState(()=>{try{return localStorage.getItem('nidhi-analytics-consent-v1')===null}catch{return false}})
 useEffect(()=>{const open=()=>setShow(true);window.addEventListener('nidhi-open-consent',open);return()=>window.removeEventListener('nidhi-open-consent',open)},[])
 if(!show)return null
 const choose=v=>{setConsent(v);setShow(false);window.dispatchEvent(new Event('nidhi-consent-changed'))}
 return <aside className="consent-banner"><div><strong>A small privacy choice</strong><p>May this page count anonymous combined interactions, such as section views and favourites? No names or contact details are collected; IP addresses are not stored; there is no camera access or individual visitor profiling.</p></div><div className="consent-actions"><button onClick={()=>choose(true)}>Allow anonymous analytics</button><button className="quiet" onClick={()=>choose(false)}>No thanks</button></div></aside>
}
