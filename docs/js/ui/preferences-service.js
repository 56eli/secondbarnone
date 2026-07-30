/**
 * PreferencesService
 * Manages player settings: high contrast, reduced motion, sound, and volume.
 * Persists settings to storage and applies visual/audio classes to the document.
 */
export class PreferencesService {
  constructor(storage, doc = globalThis.document) {
    this.storage = storage;
    this.doc = doc;
    this.preferences = {
      highContrast: false,
      reducedMotion: false,
      sound: false,
      volume: 0.35,
    };
    this.musicEl = null;
    this.musicUrl = 'assets/music/comfy_piano.wav';
    this.load();
  }

  load() {
    try {
      const raw = JSON.parse(this.storage?.getItem('secondbarnone.settings.v1') ?? '{}');
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return this.preferences;

      this.preferences.highContrast = raw.highContrast === true;
      this.preferences.reducedMotion = raw.reducedMotion === true;
      if (typeof raw.sound === 'boolean') {
        this.preferences.sound = raw.sound;
      } else if ('musicOn' in raw || 'muted' in raw) {
        this.preferences.sound = raw.musicOn === true || raw.muted === false;
      }
      const volume = Number(raw.volume);
      this.preferences.volume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.35;
    } catch {
      /* storage is optional or unparseable; defaults remain safe */
    }
    return this.preferences;
  }

  save() {
    try {
      this.storage?.setItem('secondbarnone.settings.v1', JSON.stringify(this.preferences));
    } catch {
      /* best effort */
    }
  }

  applyPreferences() {
    if (this.doc?.documentElement) {
      this.doc.documentElement.classList.toggle(
        'high-contrast',
        Boolean(this.preferences.highContrast),
      );
      this.doc.documentElement.classList.toggle(
        'reduce-motion',
        Boolean(this.preferences.reducedMotion),
      );
    }
    this.applySound();
    this.save();
  }

  toggleContrast() {
    this.preferences.highContrast = !this.preferences.highContrast;
    this.applyPreferences();
    return this.preferences.highContrast;
  }

  toggleMotion() {
    this.preferences.reducedMotion = !this.preferences.reducedMotion;
    this.applyPreferences();
    return this.preferences.reducedMotion;
  }

  toggleSound() {
    this.preferences.sound = !this.preferences.sound;
    this.applySound();
    this.save();
    return this.preferences.sound;
  }

  ensureMusic() {
    if (this.musicEl) return this.musicEl;
    if (!this.doc) return null;
    const el = this.doc.createElement('audio');
    el.id = 'bgm';
    el.src = this.musicUrl;
    el.loop = true;
    el.setAttribute('aria-hidden', 'true');
    el.volume = this.preferences.volume;
    this.doc.body?.append(el);
    this.musicEl = el;
    return el;
  }

  applySound() {
    if (!this.musicEl) {
      if (this.preferences.sound) this.ensureMusic();
      else return;
    }
    if (!this.musicEl) return;
    this.musicEl.volume = this.preferences.volume;
    if (this.preferences.sound) {
      try {
        const p = this.musicEl.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {
            this.preferences.sound = false;
            this.save();
          });
        }
      } catch {
        this.preferences.sound = false;
        this.save();
      }
    } else {
      this.musicEl.pause();
    }
  }
}
