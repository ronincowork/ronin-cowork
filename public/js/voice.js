/* part of the ronin-cowork client — see js/README.md */
import { S } from './state.js';
import { t } from './lexicon.js';

/**
 * DICTATION — one engine, ours, on both surfaces.
 *
 * It used to be two. Touch ran Apple's Web Speech (`webkitSpeechRecognition`) into a
 * compose overlay; desktop recorded a clip and posted it to the host. Web Speech is gone,
 * and the reason is not tidiness:
 *
 *   It cannot be taught a word. The spec's one vocabulary hook (SpeechGrammarList,
 *   JSGF) is deprecated and not meaningfully implemented, so `ctx` came back as
 *   CHIZU and TEGAMI as "the gummy", every time, with no way to fix it.
 *   It sent the audio to Apple.
 *   It was Safari-only, so every other browser showed no mic at all.
 *   And it was a worse copy of a control already on screen — the iPhone keyboard's
 *   own 🎤 is the same engine, streams the same way, and cannot be taken away.
 *
 * Recording to the host loses the live transcript and buys the glossary
 * (ronin_catalogs/HOTWORDS.md, edited in the commons's ▥ Hotwords) and audio that never leaves the
 * building. Keeping both means the two dictations on a phone now differ in something
 * other than which button you press — which is the comparison worth having.
 * See co-working/user_repo/README/DICTATION.md.
 */

/** Can this browser record at all? Needs a secure context for getUserMedia — which
 *  over the tailnet means the https URL, not the bare IP. */
export const CAN_RECORD =
  typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

/**
 * Tap on, tap off, one clip. `onState` gets 'idle' | 'rec' | 'busy' so a caller can
 * dress its own button; `onText` gets the transcript, and is not called for an empty
 * one. Errors arrive through `onError` as a sentence fit to show a person.
 *
 * The clip goes to Ronin's /api/transcribe, which attaches the glossary and proxies to
 * a host Whisper service (faster-whisper, open weights). Safari records audio/mp4
 * rather than webm; the endpoint runs the bytes through ffmpeg, which probes the
 * container, so the format is not our problem.
 */
export function makeClipRecorder({ onState, onText, onError }) {
  let recording = false;
  let busy = false;
  let media = null; // { recorder, stream }

  const state = (s) => {
    busy = s === 'busy';
    onState && onState(s);
  };

  const transcribe = async (blob) => {
    state('busy');
    try {
      const r = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': blob.type || 'audio/webm' },
        body: blob,
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) onError && onError(`Dictation failed (${data.error || r.status})`);
      else if (data.text) onText && onText(data.text);
    } catch {
      onError && onError('Dictation failed (network)');
    }
    state('idle');
  };

  const start = async () => {
    if (recording || busy) return;
    recording = true;
    state('rec');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!recording) {
        // stopped before the mic opened — drop it
        stream.getTracks().forEach((t) => t.stop());
        state('idle');
        return;
      }
      const chunks = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size) transcribe(blob);
        else state('idle');
      };
      media = { recorder, stream };
      recorder.start();
    } catch {
      // no mic / not a secure context (needs the https url) / permission denied
      recording = false;
      state('idle');
      onError && onError('Mic blocked — open Ronin over the https url and allow the microphone');
    }
  };

  const stop = () => {
    if (!recording) return;
    recording = false;
    if (media && media.recorder && media.recorder.state !== 'inactive') media.recorder.stop();
    else state('idle');
    media = null;
  };

  return {
    get listening() {
      return recording;
    },
    stop,
    toggle() {
      if (busy) return; // a clip is already being transcribed
      if (recording) stop();
      else start();
    },
  };
}

/**
 * TOUCH: the 🎤 on the composer. Tap to record, tap to stop; the transcript is APPENDED
 * to whatever is already in the box, so you can type half a sentence and speak the rest.
 * It never sends — ↵ does, the same key that sends anything else you typed.
 *
 * The box is not focused when text lands, so no keyboard pops up: dictating exists so
 * you do not have to open one.
 */
export function wireDictation(ta, micBtn) {
  if (!CAN_RECORD) return null;

  // The clip goes off for transcription AFTER the second tap, so there is a `busy`
  // beat where the box is still empty. An Enter in that beat used to hit the empty
  // box and do nothing, and the transcript then landed a moment later looking
  // ignored. The composer checks `busy` and queues the send via `afterText`.
  let busyState = false;

  const rec = makeClipRecorder({
    onState: (s) => {
      busyState = s === 'busy';
      micBtn.classList.toggle('listening', s === 'rec');
      micBtn.classList.toggle('busy', s === 'busy');
      micBtn.textContent = s === 'busy' ? '…' : '🎤';
      if (s !== 'busy') micBtn.title = t('composer.mic_title', 'Dictate into this box — tap again to stop, then ↵ to send');
    },
    onText: (text) => {
      const had = ta.value.trim();
      ta.value = (had ? had + ' ' : '') + text;
      ta.dispatchEvent(new Event('input')); // the composer grows itself on input
      ctl.afterText && ctl.afterText();
    },
    onError: (msg) => {
      micBtn.title = msg;
    },
  });

  const ctl = {
    get listening() {
      return rec.listening;
    },
    get busy() {
      return busyState;
    },
    /** The composer hangs its queued-send here; called after a transcript lands. */
    afterText: null,
    stop: () => rec.stop(),
  };

  // Don't steal focus: a pointerdown that moves the caret pops the keyboard, which is
  // the whole thing dictation is for avoiding.
  micBtn.addEventListener('pointerdown', (e) => e.preventDefault());
  micBtn.addEventListener('click', (e) => {
    e.preventDefault();
    // One microphone at a time across the page, whichever tile it belongs to.
    if (S.dictation && S.dictation !== ctl) S.dictation.stop();
    S.dictation = rec.listening ? null : ctl;
    rec.toggle();
  });
  return ctl;
}

/** All visible terminal text (the alt-screen buffer under tmux), trailing blanks trimmed. */
