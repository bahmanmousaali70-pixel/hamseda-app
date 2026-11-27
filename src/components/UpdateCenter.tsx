import React,{useCallback,useEffect,useState} from 'react';
import {Bell,CheckCircle2,Download,RefreshCw} from 'lucide-react';
type Release={tag_name:string;html_url:string;body?:string;assets?:{name:string;browser_download_url:string;size:number}[];prerelease:boolean;created_at:string};
const REPO='bahmanmousaali70-pixel/hamseda-app';
function version(s:string){const m=s.match(/(\d+)\.(\d+)\.(\d+)/);return m?m.slice(1).map(Number):[0,0,0];}
function newer(a:string,b:string){const x=version(a),y=version(b);for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i];}return false;}
export const UpdateCenter:React.FC=()=>{
 const [release,setRelease]=useState<Release|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[checked,setChecked]=useState(false),[permission,setPermission]=useState(typeof Notification!=='undefined'?Notification.permission:'unsupported');
 const current=document.querySelector('meta[name="app-version"]')?.getAttribute('content')||'0.0.0';
 const check=useCallback(async()=>{
  setBusy(true);setError('');
  try{
   const res=await fetch('https://api.github.com/repos/'+REPO+'/releases?per_page=15',{headers:{Accept:'application/vnd.github+json'}});
   if(!res.ok)throw new Error('دریافت نسخه‌ها از GitHub ممکن نشد.');
   const releases=await res.json() as Release[];
   const latest=releases.find(x=>x.prerelease&&x.tag_name.startsWith('dev-v')&&x.assets?.some(a=>a.name.endsWith('.apk')));
   setRelease(latest||null);setChecked(true);
   if(latest&&newer(latest.tag_name,current)&&typeof Notification!=='undefined'&&Notification.permission==='granted'){
    const last=localStorage.getItem('hamseda_notified_release');
    if(last!==latest.tag_name){new Notification('نسخه جدید رفیقو آماده است',{body:'برای مشاهده و دریافت به‌روزرسانی وارد برنامه شوید.'});localStorage.setItem('hamseda_notified_release',latest.tag_name);}
   }
  }catch(e){setError(e instanceof Error?e.message:'خطا در بررسی نسخه');}
  finally{setBusy(false);}
 },[current]);
 useEffect(()=>{const last=Number(localStorage.getItem('hamseda_update_check_at')||0);if(Date.now()-last>6*60*60*1000){void check();localStorage.setItem('hamseda_update_check_at',String(Date.now()));}},[check]);
 const askPermission=async()=>{if(typeof Notification==='undefined'){setPermission('unsupported');return;}const p=await Notification.requestPermission();setPermission(p);};
 const asset=release?.assets?.find(a=>a.name.endsWith('.apk'));
 const available=Boolean(release&&newer(release.tag_name,current)&&asset);
 return <section className="rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/30 p-4 space-y-3" dir="rtl">
  <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Bell className="w-5 h-5 text-emerald-800 dark:text-amber-300"/><div><b className="text-sm">مرکز به‌روزرسانی رفیقو</b><p className="text-[11px] text-slate-500">نسخه نصب‌شده: {current}</p></div></div><button onClick={()=>void check()} disabled={busy} className="rounded-lg p-2 hover:bg-white/70 dark:hover:bg-black/20" aria-label="بررسی مجدد"><RefreshCw className={'w-4 h-4 '+(busy?'animate-spin':'')}/></button></div>
  {busy?<p className="text-xs text-slate-500">در حال بررسی نسخه جدید…</p>:available?<div className="space-y-2"><p className="text-sm font-bold text-emerald-800 dark:text-emerald-200">نسخه جدید {release?.tag_name.replace('dev-v','')} آماده دریافت است.</p><a className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 text-white px-4 py-2.5 text-sm font-bold" href={asset?.browser_download_url} target="_blank" rel="noreferrer"><Download className="w-4 h-4"/> دریافت فایل به‌روزرسانی</a><p className="text-[11px] text-slate-500">پس از دانلود، فایل APK را باز کنید و نصب را تأیید کنید. نسخه جدید باید با همان امضای نسخه قبلی منتشر شده باشد.</p></div>:checked?<p className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-700"/> {release?'رفیقو به‌روز است.':'هنوز نسخه آزمایشی جدیدی منتشر نشده است.'}</p>:null}
  {error&&<p className="text-xs text-rose-600">{error}</p>}
  <div className="flex flex-wrap items-center gap-3"><button onClick={()=>void askPermission()} className="text-xs underline underline-offset-4 text-emerald-800 dark:text-emerald-200">فعال‌کردن اعلان مرورگر</button><span className="text-[10px] text-slate-500">{permission==='granted'?'اعلان مرورگر فعال است':permission==='denied'?'اعلان مرورگر مسدود شده':'اعلان فقط در محیط‌های پشتیبانی‌شده در دسترس است'}</span></div>
  <p className="text-[10px] text-slate-500">بررسی خودکار هنگام بازبودن برنامه و ورود به این بخش انجام می‌شود؛ اعلان پس‌زمینه در حالت بسته‌بودن برنامه هنوز به سرویس Push/FCM نیاز دارد. APK کامل دریافت می‌شود و وصله چندمگابایتی کد اندروید در این مرحله فعال نیست.</p>
 </section>;
};
