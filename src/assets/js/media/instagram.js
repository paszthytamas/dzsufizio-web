// Mount the official caption-free player when a card approaches the viewport.
let instagramScript = null;
let instagramFrame = 0;
const reelMounts = new Map();

function loadInstagram(){
 if(window.instgrm?.Embeds?.process)return Promise.resolve(true);
 if(!instagramScript)instagramScript=new Promise(resolve=>{
  const script=document.createElement('script');
  script.src='https://www.instagram.com/embed.js';
  script.async=true;
  const timer=setTimeout(()=>resolve(false),4000);
  function done(ok){clearTimeout(timer);resolve(ok)}
  script.addEventListener('load',()=>done(Boolean(window.instgrm?.Embeds?.process)),{once:true});
  script.addEventListener('error',()=>done(false),{once:true});
  document.head.append(script);
 });
 return instagramScript;
}
function processInstagram(){
 if(!instagramFrame)instagramFrame=requestAnimationFrame(()=>{
  instagramFrame=0;
  try{window.instgrm?.Embeds?.process()}catch(error){/* The slot will use the direct player. */}
 });
}
function mountReel(slot,useScript){
 if(reelMounts.has(slot)||slot.closest('[hidden],details:not([open])'))return;
 const permalink=new URL(slot.dataset.igPermalink);
 if(permalink.origin!=='https://www.instagram.com'||!/^\/reel\/[A-Za-z0-9_-]+\/$/.test(permalink.pathname))return;
 const mount=slot.querySelector('.ig-mount');
 const title=slot.dataset.igTitle+' – Instagram';
 let observer=null,resizeObserver=null,timer=null;
 function stop(){
  observer?.disconnect();resizeObserver?.disconnect();clearTimeout(timer);
  mount.replaceChildren();mount.inert=true;slot.classList.remove('is-ready');
  reelMounts.delete(slot);
 }
 function ready(frame,measured=false){
  function show(){
   if(reelMounts.get(slot)!==stop||!mount.contains(frame))return;
   // Instagram briefly reports the height of its loading state. Keep the still
   // visible until the viewer has measured the actual card.
   if(measured&&Number(frame.getAttribute('height'))<190)return;
   resizeObserver?.disconnect();clearTimeout(timer);
   mount.inert=false;
   slot.classList.add('is-ready');
  }
  if(measured){
   resizeObserver=new MutationObserver(show);
   resizeObserver.observe(frame,{attributes:true,attributeFilter:['height']});
   show();
  } else {
   frame.addEventListener('load',show,{once:true});
  }
 }
 function direct(){
  if(reelMounts.get(slot)!==stop)return;
  observer?.disconnect();resizeObserver?.disconnect();
  const frame=document.createElement('iframe');
  frame.className='ig-direct';frame.title=title;
  frame.referrerPolicy='strict-origin-when-cross-origin';
  frame.allow='encrypted-media; picture-in-picture; fullscreen';
  frame.allowFullscreen=true;
  ready(frame);
  frame.src=new URL('embed/',permalink).href;
  mount.replaceChildren(frame);
 }
 reelMounts.set(slot,stop);
 if(!useScript){direct();return}
 loadInstagram().then(official=>{
  if(reelMounts.get(slot)!==stop)return;
  if(!official){direct();return}
  const block=document.createElement('blockquote');
  block.className='instagram-media';
  block.dataset.instgrmPermalink=permalink.href;
  block.dataset.instgrmVersion='14';
  const link=document.createElement('a');link.href=permalink.href;link.textContent='Megnyitás az Instagramon';
  block.append(link);
  observer=new MutationObserver(()=>{
   const frame=mount.querySelector('iframe');
   if(!frame)return;
   observer.disconnect();
   frame.title=title;
   ready(frame,true);
  });
  observer.observe(mount,{childList:true,subtree:true});
  mount.append(block);
  timer=setTimeout(direct,6500);
  processInstagram();
 });
}
export function initInstagram(page,{useScript=true}={}){
 const slots=page.querySelectorAll('[data-ig-permalink]');
 if(!slots.length)return;
 let reelObserver;
 if('IntersectionObserver' in window){
  reelObserver=new IntersectionObserver(entries=>{
   for(const {isIntersecting,target} of entries)if(isIntersecting){mountReel(target,useScript);reelObserver.unobserve(target)}
  },{rootMargin:'420px 0px'});
  slots.forEach(slot=>reelObserver.observe(slot));
 }else slots.forEach(slot=>mountReel(slot,useScript));
 return ()=>{
  reelObserver?.disconnect();
  slots.forEach(slot=>reelMounts.get(slot)?.());
 };
}
