"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ChevronDown,
  Globe2,
  MessageCircle,
  Search,
  Video,
  X,
} from "lucide-react";

import { useSession } from "@/lib/session";

const PRODUCTS = [
  ["Meetings", "Reliable HD video meetings for teams of every size.", "bg-blue-100 text-blue-700"],
  ["Team Chat", "Keep conversations moving before and after meetings.", "bg-emerald-100 text-emerald-700"],
  ["Scheduler", "Share availability and remove calendar back-and-forth.", "bg-violet-100 text-violet-700"],
  ["Whiteboard", "Turn ideas into plans on a collaborative canvas.", "bg-orange-100 text-orange-700"],
] as const;

export function MarketingLanding() {
  const router = useRouter();
  const { user, signIn } = useSession();
  const [announcement, setAnnouncement] = useState(true);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    if (user) router.replace("/home");
  }, [router, user]);

  if (user) {
    return <main className="min-h-screen bg-white" aria-label="Redirecting to Home" />;
  }

  async function startSignIn() {
    setSigningIn(true);
    try {
      await signIn();
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-white text-zm-ink-900">
      <div className="flex h-9 items-center justify-end gap-5 bg-black px-5 text-[12px] text-white sm:px-10">
        <button className="hover:underline" type="button">Request a Demo</button>
        <button className="hover:underline" type="button">1.888.799.9666</button>
        <button className="hover:underline" type="button">Support</button>
      </div>

      <nav className="flex h-20 items-center justify-between gap-6 border-b border-zm-line-200 px-5 sm:px-10" aria-label="Marketing">
        <button type="button" onClick={() => router.push("/")} className="flex items-center gap-2 text-xl font-bold text-zm-blue-600">
          <span className="grid size-9 place-items-center rounded-xl bg-zm-blue-600 text-white"><Video size={20} /></span>
          zoom
        </button>
        <div className="hidden items-center gap-7 text-[14px] font-medium lg:flex">
          {["Products", "AI", "Solutions"].map((item) => (
            <button key={item} type="button" className="flex items-center gap-1 hover:text-zm-blue-600">{item}<ChevronDown size={14} /></button>
          ))}
          <button type="button" className="hover:text-zm-blue-600">Pricing</button>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <button type="button" aria-label="Search" className="hidden rounded-full p-2 hover:bg-zm-surface-100 sm:block"><Search size={19} /></button>
          <button type="button" aria-label="Language" className="hidden rounded-full p-2 hover:bg-zm-surface-100 md:block"><Globe2 size={19} /></button>
          <button type="button" onClick={() => router.push("/join")} className="hidden text-[14px] font-medium hover:text-zm-blue-600 md:block">Meet</button>
          <button type="button" onClick={startSignIn} disabled={signingIn} className="text-[14px] font-medium text-zm-blue-600">Sign In</button>
          <button type="button" className="hidden rounded-full border border-zm-blue-600 px-4 py-2 text-[13px] font-semibold text-zm-blue-600 xl:block">Contact Sales</button>
          <button type="button" onClick={startSignIn} disabled={signingIn} className="rounded-full bg-zm-blue-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-zm-blue-700">{signingIn ? "Opening…" : "Sign Up Free"}</button>
        </div>
      </nav>

      {announcement ? (
        <div className="relative flex items-center justify-center gap-3 bg-gradient-to-r from-indigo-700 via-blue-600 to-violet-600 px-12 py-3 text-center text-[13px] text-white">
          <span>Zoom Workplace brings meetings, team chat, scheduling, and more into one AI-first platform.</span>
          <button type="button" className="font-semibold underline underline-offset-2">Explore Zoom Workplace</button>
          <button type="button" aria-label="Dismiss announcement" onClick={() => setAnnouncement(false)} className="absolute right-4 rounded-full p-1 hover:bg-white/15"><X size={17} /></button>
        </div>
      ) : null}

      <section className="zm-hero-gradient relative overflow-hidden px-5 py-20 text-white sm:px-10 lg:py-28">
        <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1.08fr_.92fr]">
          <div>
            <p className="mb-5 text-[14px] font-semibold tracking-[.16em] text-blue-200 uppercase">Zoom Workplace</p>
            <h1 className="max-w-3xl text-[44px]/[1.06] font-bold tracking-[-.03em] sm:text-[60px]">Reimagine how your teams work together</h1>
            <p className="mt-7 max-w-2xl text-[18px]/8 text-blue-100">Connect people, share ideas, and get more done with one platform for meetings, chat, scheduling, and collaboration.</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <button type="button" onClick={startSignIn} className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-7 font-semibold text-zm-blue-700 hover:bg-blue-50">Get started free <ArrowRight size={18} /></button>
              <button type="button" className="h-12 rounded-full border border-white/60 bg-black/25 px-7 font-semibold text-white hover:bg-black/40">Explore plans</button>
            </div>
          </div>
          <div className="relative mx-auto aspect-square w-full max-w-[520px] rounded-[42px] border border-white/20 bg-white/10 p-6 shadow-2xl backdrop-blur-sm">
            <div className="grid h-full grid-cols-2 gap-3 rounded-[30px] bg-[#101b4d] p-4">
              {["PK", "AM", "SL", "DO"].map((initials, index) => (
                <div key={initials} className="relative grid place-items-center rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900">
                  <span className={`grid size-16 place-items-center rounded-full text-xl font-semibold ${index === 0 ? "bg-blue-500" : index === 1 ? "bg-emerald-500" : index === 2 ? "bg-violet-500" : "bg-orange-500"}`}>{initials}</span>
                  <span className="absolute bottom-3 left-3 rounded bg-black/50 px-2 py-1 text-[11px]">{["Pinak", "Arjun", "Sara", "Daniel"][index]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-10">
          <p className="text-[14px] font-semibold text-zm-blue-600">ONE PLATFORM</p>
          <h2 className="mt-3 max-w-3xl text-[34px]/tight font-semibold tracking-[-.02em] sm:text-[44px]">Everything you need to connect and collaborate</h2>
        </div>
        <div className="mt-10 flex snap-x gap-5 overflow-x-auto px-[max(20px,calc((100vw-1280px)/2))] pb-5 [scrollbar-width:none]">
          {PRODUCTS.map(([title, description, color]) => (
            <article key={title} className="min-w-[290px] snap-start rounded-3xl border border-zm-line-200 bg-white p-7 shadow-[var(--shadow-card)] sm:min-w-[360px]">
              <span className={`grid size-12 place-items-center rounded-2xl ${color}`}><Video size={22} /></span>
              <h3 className="mt-7 text-2xl font-semibold">{title}</h3>
              <p className="mt-3 min-h-14 text-[15px]/6 text-zm-ink-500">{description}</p>
              <button type="button" className="mt-8 inline-flex items-center gap-2 font-semibold text-zm-blue-600">Learn more <ArrowRight size={16} /></button>
            </article>
          ))}
        </div>
      </section>

      <button type="button" aria-label="Chat with Zoom" className="fixed right-5 bottom-5 grid size-14 place-items-center rounded-full bg-zm-blue-600 text-white shadow-lg hover:bg-zm-blue-700"><MessageCircle size={24} /></button>
    </main>
  );
}
