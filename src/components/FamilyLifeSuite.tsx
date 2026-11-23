import React, {useState} from 'react';
import {Activity, AlertCircle, CalendarDays, HeartPulse, Plus, Trash2} from 'lucide-react';
import {UpdateCenter} from './UpdateCenter';

type HealthRecord = {id: string; name: string; detail: string; date: string};

const fieldClass = 'w-full min-h-12 rounded-2xl border border-[#E6E2D8] dark:border-emerald-900/70 bg-white/90 dark:bg-[#0B1512] px-4 py-3 text-sm text-slate-900 dark:text-white outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10';
const cardClass = 'rounded-3xl border border-[#E6E2D8] dark:border-emerald-950/80 bg-white/90 dark:bg-[#0E1816] shadow-[0_18px_50px_-34px_rgba(11,70,54,.3)]';

export const FamilyLifeSuite: React.FC = () => {
  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [name, setName] = useState('');
  const [detail, setDetail] = useState('');
  const [date, setDate] = useState('');

  const addRecord = () => {
    if (!name.trim()) return;
    setRecords((items) => [{id: String(Date.now()) + Math.random().toString(16).slice(2), name: name.trim(), detail: detail.trim(), date}, ...items]);
    setName('');
    setDetail('');
    setDate('');
  };

  return (
    <div dir="rtl" className="space-y-6">
      <section className="relative overflow-hidden rounded-[2rem] border border-emerald-900/15 dark:border-emerald-400/15 bg-gradient-to-br from-[#102F27] via-[#0D4938] to-[#10251F] p-6 sm:p-9 text-white shadow-[0_28px_70px_-35px_rgba(5,55,39,.65)]">
        <div className="absolute -left-16 -top-20 h-64 w-64 rounded-full bg-amber-300/10 blur-3xl" />
        <div className="absolute -right-16 -bottom-24 h-64 w-64 rounded-full bg-emerald-300/10 blur-3xl" />
        <div className="relative flex flex-col sm:flex-row sm:items-end justify-between gap-5">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/25 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-amber-100">
              <HeartPulse className="h-4 w-4" /> مراقبت و سلامت خانواده
            </div>
            <h1 className="mt-4 text-2xl sm:text-4xl font-black tracking-tight">پرونده سلامت</h1>
            <p className="mt-3 max-w-xl text-sm leading-7 text-emerald-50/80">
              یادداشت سوابق، داروها و حساسیت‌های مهم اعضای خانواده در یک فضای ساده و مرتب.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur">
            <Activity className="h-6 w-6 text-amber-200" />
            <div><div className="text-2xl font-black tabular-nums">{records.length.toLocaleString('fa-IR')}</div><div className="text-[11px] text-emerald-50/70">یادداشت این نشست</div></div>
          </div>
        </div>
      </section>

      <UpdateCenter />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,.72fr)]">
        <section className={cardClass + ' p-5 sm:p-7 space-y-5'}>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300"><Plus className="h-5 w-5" /></div>
            <div><h2 className="font-extrabold text-lg">ثبت یادداشت سلامت</h2><p className="text-xs text-slate-500 mt-1">اطلاعات ضروری را کوتاه و دقیق وارد کن</p></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2 text-xs font-semibold text-slate-600 dark:text-slate-300">نام عضو خانواده<input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً نام عضو خانواده" /></label>
            <label className="space-y-2 text-xs font-semibold text-slate-600 dark:text-slate-300">تاریخ<input className={fieldClass} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          </div>
          <label className="block space-y-2 text-xs font-semibold text-slate-600 dark:text-slate-300">سابقه، دارو یا حساسیت<textarea className={fieldClass + ' min-h-28 resize-y'} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="توضیح کوتاه و کاربردی..." /></label>
          <button type="button" onClick={addRecord} disabled={!name.trim()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-emerald-800 to-emerald-700 px-6 text-sm font-bold text-white shadow-lg shadow-emerald-900/15 transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-40"><Plus className="h-4 w-4" /> ثبت یادداشت</button>
        </section>

        <aside className={cardClass + ' p-5 sm:p-6 space-y-4'}>
          <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"><AlertCircle className="h-5 w-5" /></div><h2 className="font-extrabold">نکته مهم درباره حریم خصوصی</h2></div>
          <p className="text-sm leading-7 text-slate-600 dark:text-slate-300">این نسخه یادداشت‌ها را فقط تا زمان باز بودن همین صفحه نگه می‌دارد و آن‌ها را در فضای ابری یا حافظه دائمی ذخیره نمی‌کند. اطلاعات حساس پزشکی را فقط در محیط امن و مورد اعتماد ثبت کن.</p>
          <div className="rounded-2xl bg-[#F7F6F2] dark:bg-[#09110F] p-4 text-xs leading-6 text-slate-500 dark:text-slate-400">این ابزار برای یادداشت‌برداری است و جایگزین تشخیص، نسخه یا توصیه پزشک نیست.</div>
        </aside>
      </div>

      <section className={cardClass + ' p-5 sm:p-7 space-y-4'}>
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-extrabold">یادداشت‌های ثبت‌شده</h2><p className="mt-1 text-xs text-slate-500">مرتب‌شده از جدید به قدیم</p></div><span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">{records.length.toLocaleString('fa-IR')} مورد</span></div>
        {records.length === 0 ? <div className="rounded-2xl border border-dashed border-[#D9D4C8] dark:border-emerald-900/70 px-4 py-10 text-center"><CalendarDays className="mx-auto h-7 w-7 text-slate-400" /><p className="mt-3 text-sm font-semibold text-slate-600 dark:text-slate-300">هنوز یادداشتی ثبت نشده</p><p className="mt-1 text-xs text-slate-500">اولین یادداشت سلامت را از فرم بالا اضافه کن.</p></div> : <div className="space-y-3">{records.map((record) => <article key={record.id} className="flex items-start gap-3 rounded-2xl bg-[#F7F6F2] dark:bg-[#09110F] p-4"><div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-800 dark:bg-[#14231E] dark:text-emerald-300"><HeartPulse className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold">{record.name}</h3>{record.date && <span className="text-[11px] text-slate-500">{record.date}</span>}</div><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">{record.detail || 'بدون توضیحات تکمیلی'}</p></div><button type="button" onClick={() => setRecords((items) => items.filter((x) => x.id !== record.id))} aria-label="حذف یادداشت" className="rounded-xl p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"><Trash2 className="h-4 w-4" /></button></article>)}</div>}
      </section>
    </div>
  );
};
