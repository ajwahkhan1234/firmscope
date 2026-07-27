"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Scale } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Lightning } from "@/components/ui/hero-odyssey";

/**
 * The hero's thesis is the product itself: a URL field that starts a real
 * teardown, with one genuine finding shown as evidence beside it. The example
 * finding is anonymized — publishing a named firm's failures as marketing
 * would be unfair to that firm.
 */
export function Hero() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [url, setUrl] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    router.push(trimmed ? `/app?url=${encodeURIComponent(trimmed)}` : "/app");
  };

  const rise = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 18 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <section className="relative isolate overflow-hidden bg-ink">
      {/* Atmosphere */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        {/* Negative xOffset pushes the bolt right so it frames the headline
            instead of striking through it. */}
        <div className="absolute inset-x-0 top-0 h-[96vh]">
          <Lightning hue={218} speed={1.1} intensity={0.85} size={2.1} xOffset={-0.58} />
        </div>

        {/* Directional scrim: opaque under the type so it stays legible,
            clear over the bolt so it keeps its contrast. A flat overlay
            washed the whole effect out. */}
        <div className="absolute inset-0 bg-[linear-gradient(100deg,var(--color-ink)_0%,var(--color-ink)_34%,rgba(5,7,11,0.72)_52%,rgba(5,7,11,0.18)_78%,rgba(5,7,11,0.45)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-b from-transparent to-ink" />
        <div className="absolute right-[18%] top-[42%] h-[620px] w-[620px] -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(110,155,255,0.13),transparent_66%)] blur-2xl" />
      </div>

      {/* Nav */}
      <header className="relative z-20 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Scale className="h-4 w-4 text-brass" strokeWidth={1.5} />
          <span className="font-display text-lg tracking-tight text-vellum">FirmScope</span>
        </Link>
        <nav className="flex items-center gap-6">
          <a
            href="#harness"
            className="eyebrow hidden transition-colors hover:text-vellum sm:block"
          >
            The harness
          </a>
          <Link
            href="/app"
            className="rounded-sm border border-ink-line-bright bg-ink-raised/80 px-4 py-2 text-sm text-vellum backdrop-blur transition-colors hover:border-brass/60 hover:text-brass"
          >
            Run a teardown
          </Link>
        </nav>
      </header>

      {/* Hero body */}
      <div className="relative z-10 mx-auto max-w-6xl px-6 pb-28 pt-16 sm:pt-24">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.09 } } }}
          className="max-w-3xl"
        >
          <motion.p variants={rise} className="eyebrow mb-7">
            LangGraph Deep Agent · US law firm SEO
          </motion.p>

          <motion.h1
            variants={rise}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="font-display text-[clamp(2.6rem,7vw,5.2rem)] leading-[0.98] tracking-[-0.02em] text-vellum"
          >
            The evidence is
            <br />
            already on their
            <br />
            <span className="text-brass">website.</span>
          </motion.h1>

          <motion.p
            variants={rise}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="mt-8 max-w-xl text-[1.0625rem] leading-relaxed text-slate-soft"
          >
            FirmScope crawls a US law firm&apos;s site, measures it against
            legal-specific criteria, scores what it finds, and drafts the one email
            worth sending to the managing partner.
          </motion.p>

          {/* The product input, in the hero. */}
          <motion.form
            variants={rise}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            onSubmit={submit}
            className="mt-10 flex w-full max-w-xl flex-col gap-3 sm:flex-row"
          >
            <label htmlFor="hero-url" className="sr-only">
              Law firm website URL
            </label>
            <input
              id="hero-url"
              type="text"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="lawfirm.com"
              className="measure min-w-0 flex-1 rounded-sm border border-ink-line-bright bg-ink-raised/70 px-4 py-3.5 text-sm text-vellum placeholder:text-slate-dim backdrop-blur transition-colors focus:border-brass focus:outline-none"
            />
            <button
              type="submit"
              className="group inline-flex items-center justify-center gap-2 rounded-sm bg-brass px-6 py-3.5 text-sm font-medium text-ink transition-colors hover:bg-[#d9b56d]"
            >
              Run the teardown
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                strokeWidth={2}
              />
            </button>
          </motion.form>

          <motion.p variants={rise} className="mt-4 text-xs text-slate-dim">
            Takes about 60–90 seconds. Nothing is sent to the firm.
          </motion.p>
        </motion.div>

        {/* One real finding, as evidence. */}
        <motion.figure
          initial={{ opacity: 0, y: reduceMotion ? 0 : 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="mt-20 max-w-2xl rounded-sm border border-ink-line bg-ink-raised/70 p-6 backdrop-blur-sm sm:mt-24"
        >
          <figcaption className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-ink-line pb-3">
            <span className="eyebrow">Exhibit 01 — sample finding</span>
            <span className="measure rounded-sm bg-critical/12 px-2 py-0.5 text-[0.6875rem] uppercase tracking-wider text-critical">
              Critical
            </span>
          </figcaption>
          <blockquote className="font-display text-xl leading-snug text-vellum">
            &ldquo;Nine different phone numbers appear across the site.&rdquo;
          </blockquote>
          <p className="mt-3 text-sm leading-relaxed text-slate-soft">
            Measured on a Dallas personal-injury firm. Every call-tracking number
            that never made it back to the footer splits the firm&apos;s identity
            across directories — one of the most common causes of weak local pack
            placement in legal, and one of the cheapest to fix.
          </p>
        </motion.figure>
      </div>
    </section>
  );
}
