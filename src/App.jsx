import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowDown,
  ArrowUpRight,
  Heart,
  Pause,
  Play,
  Sparkles,
  X,
} from "lucide-react";
import { Analytics } from "@vercel/analytics/react";

import { photos } from "./data/photos";
import { compliments as defaultCompliments } from "./data/compliments";
import { consent, track } from "./lib/analytics";
import ConsentBanner from "./components/ConsentBanner";
import OwnerDashboard from "./components/OwnerDashboard";

function LineText({ value }) {
  return (
    <>
      {String(value || "")
        .split("\\n")
        .map((line, i) => (
          <span key={i}>
            {i > 0 && <br />}
            {line}
          </span>
        ))}
    </>
  );
}

const reveal = {
  hidden: { opacity: 0, y: 28 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.75,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

function PhotoCard({ photo, index, onOpen, onFavorite }) {
  return (
    <motion.article
      className={`photo-card card-${index % 6}`}
      variants={reveal}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.12 }}
      whileHover={{ y: -7, scale: 1.015 }}
    >
      <button
        className="photo-open"
        onClick={() => onOpen(photo)}
        aria-label={`View ${photo.title}`}
      >
        <div className="photo-wrap">
          <img src={photo.src} alt={photo.alt || photo.title} loading="lazy" />
          <span className="photo-number">
            {String(index + 1).padStart(2, "0")}
          </span>
        </div>

        <div className="photo-meta">
          <span>{photo.kind}</span>
          <h3>{photo.title}</h3>
          <p>{photo.caption}</p>
        </div>
      </button>

      <button
        className="photo-favourite"
        onClick={() => onFavorite(photo)}
        aria-label={`Favourite ${photo.title}`}
      >
        <Heart size={14} />
        {photo.favoriteLabel || "My favourite"}
      </button>
    </motion.article>
  );
}

function PublicSite() {
  const [entered, setEntered] = useState(false);
  const [active, setActive] = useState(null);
  const [letter, setLetter] = useState(false);
  const [compliment, setCompliment] = useState("");
  const [musicOn, setMusicOn] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState("");
  const [zoom, setZoom] = useState(1);

  const galleryRef = useRef(null);
  const audio = useRef(null);

  // Audio analyser references
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const animationFrameRef = useRef(null);

  const [siteContent, setSiteContent] = useState({
    photos,
    quotes: defaultCompliments,
    keepsakeImages: [
      "/keepsakes/birthday-artwork.jpg",
      "/keepsakes/film-poster-artwork.jpg",
    ],
    copy: {},
    qualities: [],
    pollOptions: [],
    keepsakeDetails: [],
  });

  const [musicLevel, setMusicLevel] = useState(0);

  const copy = siteContent.copy || {};
  const t = (key, fallback = "") => copy[key] || fallback;

  // Load website content
  useEffect(() => {
    let cancelled = false;

    fetch("/api/content")
      .then((r) => (r.ok ? r.json() : null))
      .then((content) => {
        if (!cancelled && content) {
          setSiteContent((previous) => ({
            ...previous,
            ...content,
          }));

          if (content.copy?.siteName) {
            document.title = content.copy.siteName;
          }
        }
      })
      .catch((error) => {
        console.error("Content loading failed:", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Analytics and consent observer
  useEffect(() => {
    let observer;

    const start = () => {
      if (!consent() || observer) return;

      const seen = new Set();

      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;

            const section = entry.target.getAttribute("data-track-section");

            if (section && !seen.has(section)) {
              seen.add(section);
              track("section_view", section);
            }
          });
        },
        { threshold: 0.35 },
      );

      document
        .querySelectorAll("[data-track-section]")
        .forEach((node) => observer.observe(node));
    };

    start();

    const changed = () => {
      if (consent()) {
        start();
      } else if (observer) {
        observer.disconnect();
        observer = null;
      }
    };

    window.addEventListener("nidhi-consent-changed", changed);

    return () => {
      observer?.disconnect();
      window.removeEventListener("nidhi-consent-changed", changed);
    };
  }, []);

  // Gallery auto movement
  useEffect(() => {
    const rail = galleryRef.current;

    if (
      !rail ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      if (document.hidden || active) return;

      const max = rail.scrollWidth - rail.clientWidth;

      if (max <= 0) return;

      if (rail.scrollLeft >= max - 8) {
        rail.scrollTo({
          left: 0,
          behavior: "smooth",
        });
      } else {
        rail.scrollBy({
          left: Math.min(rail.clientWidth * 0.72, 340),
          behavior: "smooth",
        });
      }
    }, 5200);

    return () => window.clearInterval(timer);
  }, [active]);

  // Escape key
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") {
        setActive(null);
        setLetter(false);
        setZoom(1);
      }
    };

    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // Stop music when component unmounts
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      if (audio.current) {
        audio.current.pause();
      }

      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }

      document.documentElement.style.setProperty("--music-pulse", "0");
    };
  }, []);

  // Actual audio frequency analysis
  useEffect(() => {
    if (!musicOn || !analyserRef.current) {
      setMusicLevel(0);

      document.documentElement.style.setProperty("--music-pulse", "0");

      return;
    }

    const analyser = analyserRef.current;
    const data = new Uint8Array(analyser.frequencyBinCount);

    let energy = 0;
    let frame;

    const animate = () => {
      analyser.getByteFrequencyData(data);

      let bass = 0;
      let mids = 0;

      for (let i = 0; i < 14; i++) {
        bass += data[i];
      }

      for (let i = 14; i < 35; i++) {
        mids += data[i];
      }

      bass /= 14;
      mids /= 21;

      const target = Math.min(
        1,
        Math.max(0, (bass * 0.75 + mids * 0.25 - 35) / 150),
      );

      energy += (target - energy) * 0.16;

      const level = Number(energy.toFixed(3));

      setMusicLevel(level);

      document.documentElement.style.setProperty(
        "--music-pulse",
        String(level),
      );

      frame = requestAnimationFrame(animate);
      animationFrameRef.current = frame;
    };

    animate();

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [musicOn]);

  // Gallery navigation
  const slideGallery = (direction) => {
    if (!galleryRef.current) return;

    galleryRef.current.scrollBy({
      left: direction * Math.min(galleryRef.current.clientWidth * 0.82, 420),
      behavior: "smooth",
    });
  };

  // Music playback
  const toggleMusic = async () => {
    const player = audio.current;

    if (!player) return;

    if (musicOn) {
      player.pause();
      setMusicOn(false);
      return;
    }

    try {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

      if (!AudioContextClass) {
        await player.play();
        setMusicOn(true);
        return;
      }

      if (!audioContextRef.current) {
        const context = new AudioContextClass();
        const analyser = context.createAnalyser();

        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.82;

        const source = context.createMediaElementSource(player);

        source.connect(analyser);
        analyser.connect(context.destination);

        audioContextRef.current = context;
        analyserRef.current = analyser;
        sourceRef.current = source;
      }

      if (audioContextRef.current.state === "suspended") {
        await audioContextRef.current.resume();
      }

      await player.play();
      setMusicOn(true);
    } catch (error) {
      console.error("Music playback failed:", error);
      setMusicOn(false);
    }
  };

  // Compliment generator
  const newCompliment = () => {
    track("compliment_refresh");

    const quotes = siteContent.quotes || defaultCompliments;

    const pool = quotes.filter((item) => item !== compliment);
    const choices = pool.length ? pool : quotes;

    setCompliment(choices[Math.floor(Math.random() * choices.length)] || "");
  };

  const closePhoto = () => {
    setActive(null);
    setZoom(1);
  };

  return (
    <main
      className={musicOn ? "music-active" : ""}
      style={{ "--local-music-level": musicLevel }}
    >
      {/* Floating atmosphere */}
      <div className="ambient" aria-hidden="true">
        <i>✿</i>
        <i>✧</i>
        <i>❀</i>
        <i>✳</i>
      </div>

      {/* Welcome screen */}
      <AnimatePresence>
        {!entered && (
          <motion.div
            className="welcome"
            initial={{ opacity: 1 }}
            exit={{
              opacity: 0,
              scale: 1.04,
              filter: "blur(8px)",
            }}
            transition={{ duration: 0.8 }}
          >
            <motion.div
              className="welcome-frame"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9 }}
            >
              <span className="tiny-label">
                {t("welcomeEyebrow", "A LITTLE SOMETHING, JUST FOR YOU")}
              </span>

              <motion.div
                className="welcome-flower"
                animate={{ rotate: [0, 12, -12, 0], scale: [1, 1.1, 1] }}
                transition={{
                  duration: 5,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                ✿
              </motion.div>

              <p className="script">
                {t("welcomeScript", "a little world for")}
              </p>

              <h1>
                {t("welcomeName", "Nidhi")}
                <span>.</span>
              </h1>

              <p className="welcome-copy">
                {t(
                  "welcomeDescription",
                  "A small collection of lovely moments, kind thoughts, and a little appreciation.",
                )}
              </p>

              <button className="pill-btn" onClick={() => setEntered(true)}>
                {t("welcomeButton", "Step inside")}
                <ArrowUpRight size={16} />
              </button>

              <small>{t("welcomeFooter", "MADE WITH CARE · 2026")}</small>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <audio ref={audio} src="/music/tu-hain-toh.mp3" loop preload="none" />

      {/* Navigation */}
      <header className="topbar">
        <a className="wordmark" href="#home">
          {t("siteName", "Nidhi Little World")}
          <span>✿</span>
        </a>

        <nav>
          <a href="#gallery">{t("navGallery", "Gallery")}</a>
          <a href="#little-things">{t("navAppreciation", "Appreciation")}</a>
          <a href="#note">{t("navNote", "A note")}</a>
        </nav>

        <button
          className={`music-btn ${musicOn ? "playing" : ""}`}
          onClick={toggleMusic}
          aria-label={musicOn ? "Pause music" : "Play music"}
        >
          {musicOn ? <Pause size={15} /> : <Play size={15} />}

          <span>
            {musicOn ? t("musicPause", "Pause") : t("musicButton", "Music")}
          </span>

          {musicOn && <span className="music-indicator">♫</span>}
        </button>
      </header>

      {/* Hero */}
      <section className="hero" id="home" data-track-section="home">
        <motion.div
          className="hero-copy"
          initial={{ opacity: 0, x: -35 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1 }}
        >
          <p className="eyebrow">
            <span />
            {t("heroEyebrow", "A LITTLE PAGE, MADE WITH APPRECIATION")}
          </p>

          <h2>
            <LineText
              value={t(
                "heroTitle",
                "Some people make\\nordinary days feel\\na little brighter.",
              )}
            />
          </h2>

          <p className="hero-text">
            {t(
              "heroDescription",
              "This is a tiny corner of the internet to celebrate the lovely things that make you, you. No big occasion needed.",
            )}
          </p>

          <a className="under-link" href="#gallery">
            {t("heroLink", "TAKE A LITTLE LOOK")}
            <ArrowDown size={14} />
          </a>
        </motion.div>

        <div className="hero-visual">
          <motion.div
            className="orbit o1"
            animate={{ rotate: 360 }}
            transition={{
              duration: 45,
              repeat: Infinity,
              ease: "linear",
            }}
          />

          <motion.div
            className="orbit o2"
            animate={{ rotate: -360 }}
            transition={{
              duration: 55,
              repeat: Infinity,
              ease: "linear",
            }}
          />

          <motion.div
            className="hero-photo"
            animate={{
              y: [0, -10, 0],
              rotate: [3, 1.5, 3],
            }}
            transition={{
              duration: 7,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            style={{
              scale: 1 + musicLevel * 0.035,
              boxShadow: `0 22px ${50 + musicLevel * 30}px rgba(152,118,129,0.18)`,
            }}
          >
            <img
              src={siteContent.photos[0]?.src || "/images/nidhi-original.jpg"}
              alt={
                siteContent.photos[0]?.alt ||
                siteContent.photos[0]?.title ||
                "Original portrait"
              }
              fetchPriority="high"
            />

            <div className="photo-stamp">
              <LineText value={t("heroStamp", "a lovely\\nmoment")} />
            </div>
          </motion.div>

          <motion.span
            className="float-note note-a"
            animate={{ y: [0, -9, 0], rotate: [6, 2, 6] }}
            transition={{ duration: 6, repeat: Infinity }}
          >
            {t("heroFloatOne", "a little sunshine ✿")}
          </motion.span>

          <motion.span
            className="float-note note-b"
            animate={{ y: [0, 8, 0], rotate: [-7, -3, -7] }}
            transition={{ duration: 7, repeat: Infinity }}
          >
            {t("heroFloatTwo", "simply you")}
          </motion.span>

          <span className="hero-spark">✧</span>
        </div>

        <div className="hero-index">
          01 <span /> {t("heroIndex", "A LITTLE INTRO")}
        </div>
      </section>

      {/* Gallery */}
      <section
        className="gallery section-pad"
        id="gallery"
        data-track-section="gallery"
      >
        <div className="section-title">
          <p className="eyebrow centered">
            {t("galleryEyebrow", "THE PHOTO CORNER · 01")}
          </p>

          <h2>
            <LineText
              value={t("galleryTitle", "A gallery of little\\nlovely things.")}
            />
          </h2>

          <p>
            {t(
              "galleryDescription",
              "Different looks, different moods — one little collection made to feel warm, thoughtful, and full of colour.",
            )}
          </p>
        </div>

        <div className="gallery-toolbar">
          <span>{t("gallerySliderLabel", "15 MOMENTS · DRAG TO EXPLORE")}</span>

          <div>
            <button
              onClick={() => slideGallery(-1)}
              aria-label="Previous photos"
            >
              ←
            </button>

            <button onClick={() => slideGallery(1)} aria-label="Next photos">
              →
            </button>
          </div>
        </div>

        <div className="gallery-grid" ref={galleryRef}>
          {(siteContent.photos || photos).map((photo, index) => (
            <PhotoCard
              key={photo.src || index}
              photo={{
                ...photo,
                favoriteLabel: t("favoriteButton", "My favourite"),
              }}
              index={index}
              onOpen={(item) => {
                setActive(item);
                setZoom(1);
              }}
              onFavorite={(item) =>
                track(
                  "photo_favorite",
                  `slot-${siteContent.photos.indexOf(item) + 1}`,
                )
              }
            />
          ))}
        </div>

        <p className="gallery-note">
          {t(
            "galleryNote",
            "A CREATIVE COLLECTION · ORIGINAL PHOTO IS IDENTIFIED SEPARATELY",
          )}
        </p>
      </section>

      {/* Appreciation */}
      <section
        className="appreciation"
        id="little-things"
        data-track-section="appreciation"
      >
        <div className="appreciation-inner section-pad">
          <p className="eyebrow centered">
            {t("appreciationEyebrow", "A FEW THINGS WORTH CELEBRATING · 02")}
          </p>

          <h2>
            <LineText
              value={t(
                "appreciationTitle",
                "Never forget how lovely\\nit is to be you.",
              )}
            />
          </h2>

          <div className="qualities">
            {(siteContent.qualities?.length
              ? siteContent.qualities
              : [
                  {
                    number: "01 /",
                    title: "Your individuality",
                    description:
                      "There is no one else quite like you. That's a pretty wonderful thing.",
                  },
                  {
                    number: "02 /",
                    title: "Your smile",
                    description:
                      "A small reminder that simple things can brighten an ordinary day.",
                  },
                  {
                    number: "03 /",
                    title: "Your own pace",
                    description:
                      "Keep becoming who you want to be. Your journey is yours alone.",
                  },
                ]
            ).map((quality, index) => (
              <motion.article
                key={index}
                initial={{ opacity: 0, y: 25 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.14 }}
              >
                <span>{quality.number}</span>
                <h3>{quality.title}</h3>
                <p>{quality.description}</p>
              </motion.article>
            ))}
          </div>

          <motion.div className="compliment" whileHover={{ scale: 1.015 }}>
            <Sparkles size={19} />

            <p>
              {compliment ||
                t(
                  "complimentFallback",
                  "Tap below for a little reminder you deserve to hear.",
                )}
            </p>

            <button onClick={newCompliment}>
              {t("complimentButton", "A little reminder")}
              <ArrowUpRight size={15} />
            </button>
          </motion.div>
        </div>
      </section>

      {/* Style poll */}
      <section
        className="style-poll section-pad"
        data-track-section="appreciation"
      >
        <p className="eyebrow centered">
          {t("pollEyebrow", "A TINY OPTIONAL QUESTION")}
        </p>

        <h2>{t("pollTitle", "Which style do you like most?")}</h2>

        <p className="poll-copy">
          {t(
            "pollDescription",
            "Pick a favourite if you feel like it. Your choice is counted only if you opted into anonymous analytics.",
          )}
        </p>

        <div className="style-options">
          {(siteContent.pollOptions?.length
            ? siteContent.pollOptions
            : [
                { key: "indian", label: "Indian traditional" },
                { key: "western", label: "Western looks" },
                { key: "floral", label: "Floral aesthetic" },
                { key: "minimal", label: "Minimal & elegant" },
                { key: "all", label: "A mix of everything" },
              ]
          ).map(({ key, label }) => (
            <button
              className={selectedStyle === key ? "chosen" : ""}
              key={key}
              onClick={() => {
                setSelectedStyle(key);
                track("style_preference", key);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* Keepsakes */}
      <section className="keepsake section-pad" data-track-section="keepsakes">
        <div className="keepsake-copy">
          <p className="eyebrow">
            {t("keepsakeEyebrow", "LITTLE KEEPSAKES · 03")}
          </p>

          <h2>
            <LineText
              value={t("keepsakeTitle", "Some things are\\nworth keeping.")}
            />
          </h2>

          <p>
            {t(
              "keepsakeDescription",
              "A couple of creative poster-style keepsakes from the collection. A little colour, a little nostalgia, and a lot of care.",
            )}
          </p>
        </div>

        <div className="keepsake-art">
          {[0, 1].map((index) => (
            <motion.figure
              key={index}
              initial={{ opacity: 0, y: 35 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.2 }}
            >
              <img
                src={
                  siteContent.keepsakeImages?.[index] ||
                  (index === 0
                    ? "/keepsakes/birthday-artwork.jpg"
                    : "/keepsakes/film-poster-artwork.jpg")
                }
                alt={
                  siteContent.keepsakeDetails?.[index]?.alt ||
                  (index === 0
                    ? "Birthday poster artwork"
                    : "Film poster artwork")
                }
              />

              <figcaption>
                <strong>
                  {siteContent.keepsakeDetails?.[index]?.title ||
                    (index === 0 ? "Birthday keepsake" : "Film poster")}
                </strong>

                <span>
                  {siteContent.keepsakeDetails?.[index]?.description ||
                    "A little keepsake from the collection."}
                </span>
              </figcaption>
            </motion.figure>
          ))}
        </div>
      </section>

      {/* Letter section */}
      <section
        className="letter-section section-pad"
        id="note"
        data-track-section="note"
      >
        <motion.div
          className="letter-flower"
          animate={{ rotate: [0, 12, -12, 0] }}
          transition={{ duration: 8, repeat: Infinity }}
        >
          ❀
        </motion.div>

        <p className="eyebrow centered">
          {t("letterEyebrow", "A NOTE, JUST BECAUSE · 04")}
        </p>

        <h2>
          <LineText
            value={t("letterTitle", "A little note\\nfor you, Nidhi.")}
          />
        </h2>

        <p>
          {t(
            "letterDescription",
            "Not a big speech. Just a few genuine words, wrapped up with care.",
          )}
        </p>

        <button
          className="pill-btn"
          onClick={() => {
            setLetter(true);
            track("letter_open");
          }}
        >
          {t("letterButton", "Open your little letter")}
          <ArrowUpRight size={16} />
        </button>
      </section>

      {/* Feedback */}
      <section className="feedback-strip">
        <p>
          {t("feedbackPrompt", "Before you go, how did this little page feel?")}
        </p>

        <div>
          {[
            ["beautiful", t("feedbackBeautiful", "Beautiful")],
            ["liked_photos", t("feedbackPhotos", "Loved the photos")],
            ["liked_letter", t("feedbackLetter", "The note was my favourite")],
            ["liked_design", t("feedbackDesign", "Loved the design")],
            ["not_for_me", t("feedbackNotForMe", "Not quite my style")],
          ].map(([key, label]) => (
            <button key={key} onClick={() => track("feedback_choice", key)}>
              {label}
            </button>
          ))}
        </div>

        <small>
          {t(
            "feedbackDisclaimer",
            "Optional · No message or personal details are collected.",
          )}
        </small>
      </section>

      {/* Footer */}
      <footer className="footer">
        <motion.div
          className="footer-flower"
          animate={{ rotate: 360 }}
          transition={{
            duration: 35,
            repeat: Infinity,
            ease: "linear",
          }}
        >
          ✿
        </motion.div>

        <p className="eyebrow centered">
          {t("footerEyebrow", "A LITTLE REMINDER TO TAKE WITH YOU")}
        </p>

        <h2>
          <LineText value={t("footerTitle", "Keep being\\nwonderfully you.")} />
        </h2>

        <p>
          {t(
            "footerDescription",
            "Wishing you more reasons to smile, more moments to cherish, and all the good things you deserve.",
          )}
        </p>

        <div className="signature">
          {t("footerSignature", "made with appreciation")}
          <Heart size={13} fill="currentColor" />
        </div>

        <button
          className="privacy-settings"
          onClick={() => window.dispatchEvent(new Event("nidhi-open-consent"))}
        >
          {t("privacyButton", "Privacy settings")}
        </button>

        <small>{t("footerCopyright", "A LITTLE WORLD FOR NIDHI · 2026")}</small>
      </footer>

      {/* Photo lightbox */}
      <AnimatePresence>
        {active && (
          <motion.div
            className="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closePhoto}
          >
            <button className="close" aria-label="Close" onClick={closePhoto}>
              <X />
            </button>

            <motion.div
              className="lightbox"
              initial={{ scale: 0.9, y: 25, filter: "blur(5px)" }}
              animate={{ scale: 1, y: 0, filter: "blur(0px)" }}
              exit={{ scale: 0.95, y: 15 }}
              transition={{ duration: 0.35 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="lightbox-image-stage">
                <img
                  src={active.src}
                  alt={active.alt || active.title}
                  style={{
                    transform: `scale(${zoom})`,
                  }}
                />
              </div>

              <div className="zoom-tools">
                <button
                  onClick={() => setZoom((value) => Math.max(0.8, value - 0.2))}
                  aria-label="Zoom out"
                >
                  −
                </button>

                <span>{Math.round(zoom * 100)}%</span>

                <button
                  onClick={() => setZoom((value) => Math.min(2.2, value + 0.2))}
                  aria-label="Zoom in"
                >
                  +
                </button>

                <button onClick={() => setZoom(1)}>Reset</button>
              </div>

              <div>
                <span>{active.kind}</span>
                <h3>{active.title}</h3>
                <p>{active.caption}</p>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Letter modal */}
        {letter && (
          <motion.div
            className="overlay paper-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLetter(false)}
          >
            <button
              className="close"
              aria-label="Close"
              onClick={() => setLetter(false)}
            >
              <X />
            </button>

            <motion.article
              className="paper"
              initial={{ y: 45, scale: 0.94, rotateX: 8 }}
              animate={{ y: 0, scale: 1, rotateX: 0 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ duration: 0.55 }}
              onClick={(event) => event.stopPropagation()}
            >
              <span className="paper-flower">✿</span>

              <p className="eyebrow centered">
                {t("letterModalEyebrow", "A SMALL NOTE FOR YOU")}
              </p>

              <h2>{t("letterGreeting", "Hey Nidhi,")}</h2>

              <p>
                {t(
                  "letterParagraphOne",
                  "I wanted to make something a little different instead of sending an ordinary message.",
                )}
              </p>

              <p>
                {t(
                  "letterParagraphTwo",
                  "This is simply a small way of appreciating you. Your individuality and the little things that make you who you are deserve to be celebrated.",
                )}
              </p>

              <p>
                {t(
                  "letterParagraphThree",
                  "I hope this little surprise brings a smile to your face. Keep being yourself, keep growing, and never forget that you deserve kindness and happiness.",
                )}
              </p>

              <p className="signoff">
                {t("letterSignoff", "With appreciation,")}
                <br />
                <em>
                  {t(
                    "letterSignature",
                    "someone who thinks you're pretty wonderful.",
                  )}
                </em>
              </p>

              <button className="paper-close" onClick={() => setLetter(false)}>
                {t("letterClose", "Close this note")}
              </button>
            </motion.article>
          </motion.div>
        )}
      </AnimatePresence>

      <ConsentBanner />

      <div className="mobile-footer-mark">
        ✿ {t("footerCopyright", "A LITTLE WORLD FOR NIDHI · 2026")} ✿
      </div>
    </main>
  );
}

export default function App() {
  return (
    <>
      {window.location.pathname.startsWith("/owner-dashboard") ? (
        <OwnerDashboard />
      ) : (
        <PublicSite />
      )}
      <Analytics />
    </>
  );
}
