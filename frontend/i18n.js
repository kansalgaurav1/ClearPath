/*
 * i18n.js
 * -------
 * All translated text for the app lives in one place: the TRANSLATIONS
 * object below. Loaded FIRST (before script.js/alerts.js/etc.) so that
 * t() and CLEARPATH_LANG already exist by the time any other file's code
 * actually runs.
 *
 * How other files use this:
 *   - Static HTML text: add a data-i18n="key" attribute to the element;
 *     applyStaticTranslations() fills in its textContent automatically.
 *   - Dynamic text built in JS (e.g. "3 hazards found"): call t("key", {vars})
 *     directly, e.g. t("hazards_found_intro", { n: hazards.length }).
 *   - Anything that needs to refresh when the language changes (a button
 *     whose label depends on app state, like Reference's Upload/Replace
 *     label) should listen for the "clearpath:languagechange" event.
 */

const LANGUAGE_STORAGE_KEY = "clearpath-language";
const SPEECH_LANG_CODES = { en: "en-US", ja: "ja-JP" };

const TRANSLATIONS = {
  en: {
    tagline: "A photo-based walkway safety check for aging-in-place seniors",
    language_label: "🌐 Language",
    install_button: "📲 Install App",
    ios_install_hint: 'To install: tap the Share icon ⬆️ in Safari, then "Add to Home Screen."',

    disclaimer_bold: "Please note:",
    disclaimer_text:
      "ClearPath is not a medical device and does not diagnose anything. It's a simple " +
      "self-check tool to help spot physical fall hazards — it does not replace a " +
      "professional home safety assessment.",

    reference_title: "🖼️ Reference Photo",
    reference_optional_tag: "(optional)",
    reference_explainer:
      "Upload a photo of this space when it's clear of hazards. Future checks will " +
      "compare against it, which helps spot what's new or changed.",
    remove_reference_button: "🗑 Remove Reference",
    reference_status_saving: "Saving reference photo...",
    reference_status_saved: "✅ Reference photo saved. Future checks will compare against it.",
    reference_status_removed: "Reference photo removed.",
    reference_status_remove_error: "⚠️ Couldn't remove the reference photo. Try again.",

    take_photo_button: "📷 Take Photo",
    choose_gallery_button: "🖼️ Choose from Gallery",
    upload_text: "No photo selected yet",
    analyze_button: "Check for Hazards",
    replay_alert_button: "🔊 Replay Alert",
    status_text: "Analyzing photo... this can take a few seconds.",

    monitoring_title: "Live Monitoring",
    monitoring_explainer:
      "Automatically checks for hazards using your camera — only while this app stays " +
      "open and on screen. Locking your phone or switching apps will stop it (phones " +
      "don't allow background camera access), so this works best propped up somewhere " +
      "while you keep the app open.",
    check_every_label: "Check every:",
    interval_now: "Now (continuous)",
    interval_1min: "1 minute",
    interval_2min: "2 minutes",
    interval_5min: "5 minutes",
    interval_10min: "10 minutes",
    interval_15min: "15 minutes",
    interval_30min: "30 minutes",
    interval_voice: '🎤 Voice command ("Is my path clear?")',
    start_monitoring_button: "▶ Start Monitoring",
    stop_monitoring_button: "⏹ Stop Monitoring",
    monitoring_cost_note:
      "Each check calls the Claude API, so shorter intervals (especially \"Now\") mean " +
      "many more calls, and a little more cost on your Anthropic account.",
    monitoring_status_active: "Monitoring active — next check in {time}",
    monitoring_status_checking: "Checking now...",
    monitoring_status_continuous: "Continuous monitoring — checking again...",
    monitoring_status_voice_listening: 'Listening for "Is my path clear?"...',
    monitoring_status_stopped_default: "Monitoring stopped.",
    monitoring_status_stopped_background:
      "Monitoring stopped because the app was backgrounded. Reopen and tap Start to resume.",
    monitoring_status_failed: "Last check failed ({error}). Will retry.",
    camera_error:
      "Couldn't access the camera. Make sure you allowed camera permission, and that the " +
      "page is loaded over HTTPS (or localhost) — phones block camera access on plain " +
      "http:// addresses.",

    history_heading: "History",
    history_no_hazards: "✅ No hazards found",
    history_hazards_found: "{n} hazard(s) found",
    history_worst: "worst:",
    history_view_button: "View",

    all_clear_message: "✅ All clear. No hazards found.",
    all_clear_speech: "All clear. No hazards found.",
    hazards_found_intro: "{n} hazard{s} found.",
    hazard_of: "Hazard {i} of {n}: {name}.",
    fix_label: "Fix: {fix}.",

    voice_command_mic_error: "Microphone access was blocked. Voice command needs microphone permission.",

    dashboard_link: "🖥️ Open Dashboard (view on another device)",
    dashboard_title: "🖥️ ClearPath Dashboard",
    dashboard_explainer:
      "A read-only view of results captured elsewhere — open this page on a laptop while " +
      "a phone runs Live Monitoring in another room to see results here as they come in.",
    dashboard_no_results: "No results yet. Start Live Monitoring on the phone to see results here.",
    dashboard_latest_heading: "Latest Result",
    dashboard_sound_toggle: "🔊 Play sound for new results",
    dashboard_clear_button: "🗑 Clear History",
    dashboard_clear_confirm: "Clear all history? This can't be undone.",
    dashboard_connection_lost: "⚠️ Can't reach the server. Retrying...",
    dashboard_connection_restored: "✅ Connected.",

    footer_text: "Built for a school AI-for-good project. Powered by Claude Sonnet 5 (Anthropic).",
  },

  ja: {
    tagline: "在宅高齢者のための、写真で行う転倒リスクチェック",
    language_label: "🌐 言語",
    install_button: "📲 アプリをインストール",
    ios_install_hint: "インストール方法: Safariの共有アイコン⬆️をタップし、「ホーム画面に追加」を選択してください。",

    disclaimer_bold: "ご注意:",
    disclaimer_text:
      "ClearPathは医療機器ではなく、診断は行いません。転倒の危険を見つけるための簡単なセルフ" +
      "チェックツールであり、専門家による住宅安全評価に代わるものではありません。",

    reference_title: "🖼️ 基準となる写真",
    reference_optional_tag: "(任意)",
    reference_explainer:
      "危険のない状態のこの空間の写真をアップロードしてください。今後のチェックはこの写真と" +
      "比較され、新しい変化を見つけやすくなります。",
    remove_reference_button: "🗑 基準写真を削除",
    reference_status_saving: "基準写真を保存しています...",
    reference_status_saved: "✅ 基準写真を保存しました。今後のチェックはこの写真と比較されます。",
    reference_status_removed: "基準写真を削除しました。",
    reference_status_remove_error: "⚠️ 基準写真を削除できませんでした。もう一度お試しください。",

    take_photo_button: "📷 写真を撮る",
    choose_gallery_button: "🖼️ ギャラリーから選ぶ",
    upload_text: "まだ写真が選択されていません",
    analyze_button: "危険をチェック",
    replay_alert_button: "🔊 音声をもう一度再生",
    status_text: "写真を分析しています...数秒かかります。",

    monitoring_title: "ライブモニタリング",
    monitoring_explainer:
      "カメラを使って自動的に危険をチェックします — このアプリが画面に表示されている間のみ" +
      "動作します。画面をロックしたり他のアプリに切り替えると停止します(スマートフォンは" +
      "バックグラウンドでのカメラ使用を許可していません)。アプリを開いたまま、どこかに" +
      "立てかけて使うのがおすすめです。",
    check_every_label: "チェック間隔:",
    interval_now: "今すぐ(連続)",
    interval_1min: "1分ごと",
    interval_2min: "2分ごと",
    interval_5min: "5分ごと",
    interval_10min: "10分ごと",
    interval_15min: "15分ごと",
    interval_30min: "30分ごと",
    interval_voice: "🎤 音声コマンド(「道は安全ですか」)",
    start_monitoring_button: "▶ モニタリング開始",
    stop_monitoring_button: "⏹ モニタリング停止",
    monitoring_cost_note:
      "チェックのたびにClaude APIが呼び出されるため、間隔を短くするほど(特に「今すぐ」は)" +
      "呼び出し回数と費用が増えます。",
    monitoring_status_active: "モニタリング中 — 次のチェックまで {time}",
    monitoring_status_checking: "チェック中...",
    monitoring_status_continuous: "連続モニタリング中 — 再チェックしています...",
    monitoring_status_voice_listening: "「道は安全ですか」を待っています...",
    monitoring_status_stopped_default: "モニタリングを停止しました。",
    monitoring_status_stopped_background:
      "アプリがバックグラウンドになったためモニタリングを停止しました。再度開いて「開始」を" +
      "タップしてください。",
    monitoring_status_failed: "前回のチェックに失敗しました({error})。再試行します。",
    camera_error:
      "カメラにアクセスできませんでした。カメラの権限を許可しているか、ページがHTTPS" +
      "(またはlocalhost)で読み込まれているかご確認ください — スマートフォンはhttp://接続" +
      "でのカメラアクセスをブロックします。",

    history_heading: "履歴",
    history_no_hazards: "✅ 危険は見つかりませんでした",
    history_hazards_found: "{n}件の危険が見つかりました",
    history_worst: "最大:",
    history_view_button: "表示",

    all_clear_message: "✅ 問題ありません。危険は見つかりませんでした。",
    all_clear_speech: "問題ありません。危険は見つかりませんでした。",
    hazards_found_intro: "{n}件の危険が見つかりました。",
    hazard_of: "危険 {i}/{n}: {name}。",
    fix_label: "対処法: {fix}。",

    voice_command_mic_error: "マイクへのアクセスがブロックされました。音声コマンドにはマイクの許可が必要です。",

    dashboard_link: "🖥️ ダッシュボードを開く(別の端末で見る)",
    dashboard_title: "🖥️ ClearPath ダッシュボード",
    dashboard_explainer:
      "他の端末で撮影された結果を確認できる読み取り専用の画面です — スマートフォンが別の" +
      "部屋でライブモニタリングを行っている間、このページをノートパソコンで開くと結果が" +
      "届き次第ここに表示されます。",
    dashboard_no_results: "まだ結果がありません。スマートフォンでライブモニタリングを開始してください。",
    dashboard_latest_heading: "最新の結果",
    dashboard_sound_toggle: "🔊 新しい結果が届いたら音を鳴らす",
    dashboard_clear_button: "🗑 履歴を削除",
    dashboard_clear_confirm: "すべての履歴を削除しますか?元に戻せません。",
    dashboard_connection_lost: "⚠️ サーバーに接続できません。再試行しています...",
    dashboard_connection_restored: "✅ 接続しました。",

    footer_text: "学校のAI社会貢献プロジェクトとして制作。Claude Sonnet 5 (Anthropic) 搭載。",
  },
};

let CLEARPATH_LANG = "en";

/**
 * Looks up a translated string and fills in {placeholders} from `vars`.
 * Falls back to English, then to the raw key, if something's missing —
 * so a typo never causes a blank UI, just slightly wrong-language text.
 */
function t(key, vars) {
  const table = TRANSLATIONS[CLEARPATH_LANG] || TRANSLATIONS.en;
  let text = table[key] || TRANSLATIONS.en[key] || key;

  if (vars) {
    Object.keys(vars).forEach((varName) => {
      text = text.replace(new RegExp(`\\{${varName}\\}`, "g"), vars[varName]);
    });
  }
  return text;
}

/** The BCP-47 code to use for SpeechSynthesisUtterance.lang / SpeechRecognition.lang. */
function speechLangCode() {
  return SPEECH_LANG_CODES[CLEARPATH_LANG] || SPEECH_LANG_CODES.en;
}

function applyStaticTranslations() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  document.documentElement.lang = CLEARPATH_LANG;
}

function setLanguage(lang) {
  CLEARPATH_LANG = TRANSLATIONS[lang] ? lang : "en";
  localStorage.setItem(LANGUAGE_STORAGE_KEY, CLEARPATH_LANG);
  applyStaticTranslations();

  const languageSelect = document.getElementById("language-select");
  if (languageSelect) {
    languageSelect.value = CLEARPATH_LANG;
  }

  // Lets other files (reference.js, monitoring.js, voice-command.js) refresh
  // any dynamically-built text that isn't covered by a plain data-i18n tag.
  document.dispatchEvent(new CustomEvent("clearpath:languagechange", { detail: { language: CLEARPATH_LANG } }));
}

// --- Initialize on load: restore saved preference, or default to English ---
//
// This script is loaded at the bottom of <body>, so the whole page has
// already been parsed by the time this runs — no need to wait for
// DOMContentLoaded.

const savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY) || "en";
setLanguage(savedLanguage);

const languageSelectEl = document.getElementById("language-select");
if (languageSelectEl) {
  languageSelectEl.addEventListener("change", () => setLanguage(languageSelectEl.value));
}
