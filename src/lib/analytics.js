const KEY='nidhi-analytics-consent-v1'
export function consent(){try{return localStorage.getItem(KEY)==='yes'}catch{return false}}
export function setConsent(value){try{localStorage.setItem(KEY,value?'yes':'no')}catch{}}
export async function track(type,key='all'){
  if(!consent())return
  try{await fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',keepalive:true,body:JSON.stringify({type,key})})}catch{}
}
