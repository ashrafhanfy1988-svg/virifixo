"use strict";
const express=require("express"),app=express();
const PORT=Number(process.env.PORT)||10000,VERSION="5.5",API_KEY=process.env.YOUTUBE_API_KEY||"";
const ORIGINS=new Set(["https://ashrafhanfy1988-svg.github.io"]);
app.disable("x-powered-by");
app.use((req,res,next)=>{
  res.setHeader("X-Content-Type-Options","nosniff");res.setHeader("Referrer-Policy","strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options","DENY");res.setHeader("Cache-Control","no-store");
  const o=req.headers.origin;if(o&&ORIGINS.has(o)){res.setHeader("Access-Control-Allow-Origin",o);res.setHeader("Vary","Origin");res.setHeader("Access-Control-Allow-Methods","GET, POST, OPTIONS");res.setHeader("Access-Control-Allow-Headers","Content-Type");}
  if(req.method==="OPTIONS")return o&&ORIGINS.has(o)?res.sendStatus(204):res.sendStatus(403);next();
});
app.use(express.json({limit:"10kb",strict:true}));
app.get("/",(q,s)=>s.json({service:"VIRIFIXO API",status:"running",version:VERSION,provider:"YouTube Data API v3",configured:!!API_KEY}));
app.get("/health",(q,s)=>s.status(API_KEY?200:503).json({ok:!!API_KEY,service:"VIRIFIXO API",status:API_KEY?"ready":"configuration_required",version:VERSION,provider:"YouTube Data API v3"}));
function parse(type,value){
 if(typeof value!=="string"||value.length>2048)throw Error("أدخل رابط YouTube صحيحاً لا يتجاوز 2048 حرفاً.");
 let u;try{u=new URL(value)}catch{throw Error("الرابط غير صالح.")}
 const h=u.hostname.toLowerCase().replace(/^www\./,"");
 if(u.protocol!=="https:"||u.username||u.password||u.port||!["youtube.com","m.youtube.com","youtu.be"].includes(h))throw Error("يسمح فقط بروابط YouTube الآمنة.");
 if(type==="video"){let id=h==="youtu.be"?u.pathname.split("/").filter(Boolean)[0]||"":u.pathname==="/watch"?u.searchParams.get("v")||"":(u.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)||[])[1]||"";if(!/^[A-Za-z0-9_-]{11}$/.test(id))throw Error("أدخل رابط فيديو YouTube صالحاً.");return {id};}
 if(h==="youtu.be")throw Error("أدخل رابط قناة وليس رابط فيديو.");
 let m=u.pathname.match(/^\/channel\/(UC[A-Za-z0-9_-]{22})\/?$/);if(m)return {id:m[1]};
 m=u.pathname.match(/^\/@([A-Za-z0-9._-]{3,})\/?$/);if(m)return {forHandle:m[1]};
 m=u.pathname.match(/^\/user\/([A-Za-z0-9._-]+)\/?$/);if(m)return {forUsername:m[1]};
 throw Error("يدعم فحص القنوات روابط /@handle أو /channel/UC… أو /user/username.");
}
async function api(resource,params){
 if(!API_KEY){let e=Error("يلزم إعداد YOUTUBE_API_KEY في Render لتفعيل YouTube Data API v3.");e.status=503;throw e;}
 const u=new URL("https://www.googleapis.com/youtube/v3/"+resource);for(const [k,v] of Object.entries({...params,key:API_KEY}))if(v!==undefined&&v!==null&&v!=="")u.searchParams.set(k,String(v));
 const r=await fetch(u,{signal:AbortSignal.timeout(15000)}),d=await r.json().catch(()=>({}));
 if(!r.ok){const why=d?.error?.errors?.[0]?.reason||"",msg=why==="quotaExceeded"||why==="dailyLimitExceeded"?"تم استنفاد حصة YouTube API اليومية. حاول لاحقاً.":d?.error?.message||"تعذر الاتصال بواجهة YouTube Data API.";let e=Error(msg);e.status=r.status===403?502:r.status;throw e;}return d;
}
const thumb=t=>t?.maxres?.url||t?.high?.url||t?.medium?.url||t?.default?.url||"";
const val=v=>v===undefined||v===null?null:v;
async function video(id){
 const d=await api("videos",{part:"snippet,statistics,contentDetails",id,maxResults:1}),x=d.items?.[0];
 if(!x){let e=Error("لم يعثر YouTube Data API على فيديو متاح. قد يكون محذوفاً أو خاصاً.");e.status=404;throw e;}
 const s=x.snippet||{},st=x.statistics||{},m=(x.contentDetails?.duration||"").match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
 const duration=m?Number(m[1]||0)*3600+Number(m[2]||0)*60+Number(m[3]||0):null;
 return {ok:true,type:"video",version:VERSION,videoId:id,title:s.title||"",channelTitle:s.channelTitle||"",channelId:s.channelId||"",channelUrl:s.channelId?"https://www.youtube.com/channel/"+s.channelId:"",thumbnailUrl:thumb(s.thumbnails),description:s.description||"",statistics:{views:val(st.viewCount),likes:val(st.likeCount),comments:val(st.commentCount),durationSeconds:duration,publishDate:s.publishedAt||null},source:"YouTube Data API v3",note:"بيانات عامة أعادتها YouTube Data API v3 وقت الفحص؛ عدم توفر بعض الحقول لا يعني وجود تلاعب، والبيانات لا تثبت أصالة المحتوى."};
}
async function channel(ref){
 const d=await api("channels",{part:"snippet,statistics",maxResults:1,...ref}),x=d.items?.[0];
 if(!x){let e=Error("لم يعثر YouTube Data API على قناة عامة مطابقة.");e.status=404;throw e;}
 const s=x.snippet||{},st=x.statistics||{};
 return {ok:true,type:"channel",version:VERSION,title:s.title||"",channelTitle:s.title||"",channelId:x.id||"",channelUrl:"https://www.youtube.com/channel/"+x.id,description:s.description||"",thumbnailUrl:thumb(s.thumbnails),statistics:{subscribers:val(st.subscriberCount),videoCount:val(st.videoCount),totalViews:val(st.viewCount),joinedDate:s.publishedAt||null},source:"YouTube Data API v3",note:"بيانات عامة أعادتها YouTube Data API v3؛ قد تكون أعداد المشتركين مخفية. هذه البيانات لا تثبت هوية القناة أو أصالة محتواها."};
}
app.post("/api/verify",async(q,s)=>{
 const b=q.body;if(!b||typeof b!=="object"||Array.isArray(b))return s.status(400).json({ok:false,error:"أرسل طلب JSON صحيحاً."});
 if(!["video","channel"].includes(b.type))return s.status(400).json({ok:false,error:"نوع الفحص يجب أن يكون video أو channel."});
 try{const r=parse(b.type,b.url);return s.json(b.type==="video"?await video(r.id):await channel(r));}
 catch(e){console.error("VIRIFIXO verification error:",e.message);return s.status(e.status||(/timeout|aborted/i.test(e.message)?504:400)).json({ok:false,error:e.message||"تعذر إتمام الفحص."});}
});
app.use((q,s)=>s.status(404).json({ok:false,error:"المسار المطلوب غير موجود."}));
app.use((e,q,s,n)=>{if(s.headersSent)return n(e);if(e instanceof SyntaxError&&e.status===400&&"body"in e)return s.status(400).json({ok:false,error:"صيغة JSON غير صحيحة."});console.error("VIRIFIXO API error:",e.message);return s.status(500).json({ok:false,error:"حدث خطأ داخلي في الخادم."});});
app.listen(PORT,"0.0.0.0",()=>console.log("VIRIFIXO API "+VERSION+" listening on port "+PORT));
