// lib/downloaders.js — .dl <url> for video/audio links.
// Uses yt-dlp. If no yt-dlp binary is found, it downloads the official
// standalone Linux binary into ./bin on first use (no install step needed).
// Files are capped at ~50 MB (config.maxDownloadBytes) and deleted after sending.
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { execFile } = require('child_process');
const config = require('../config');

const BIN_DIR = path.join(__dirname, '..', 'bin');
const BIN_PATH = path.join(BIN_DIR, 'yt-dlp');
const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

function run(cmd, args, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message || '').trim().slice(0, 500)));
      else resolve(stdout);
    });
  });
}

function which(cmd) {
  return run('which', [cmd]).then((out) => out.trim()).catch(() => '');
}

/** Locate yt-dlp: system binary first, then ./bin/yt-dlp, else download it. */
async function ensureYtDlp() {
  const system = await which('yt-dlp');
  if (system) return system;
  if (fs.existsSync(BIN_PATH)) return BIN_PATH;

  console.log('[dl] yt-dlp not found — downloading the standalone binary...');
  fs.mkdirSync(BIN_DIR, { recursive: true });
  const res = await axios.get(YTDLP_URL, { responseType: 'stream', timeout: 120000 });
  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(BIN_PATH);
    res.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
  fs.chmodSync(BIN_PATH, 0o755);
  console.log('[dl] yt-dlp downloaded to', BIN_PATH);
  return BIN_PATH;
}

function isUrl(text) {
  return /^https?:\/\/\S+$/i.test(text || '');
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Download a link with yt-dlp.
 * @param {string} url the link to download
 * @param {boolean} audioOnly true = extract mp3 audio instead of video
 * @returns {Promise<{file:string, title:string, isAudio:boolean, size:number}>}
 */
async function download(url, audioOnly = false) {
  if (!isUrl(url)) throw new Error('Usage: .dl <url>\nExample: .dl https://www.youtube.com/watch?v=...');

  const ytdlp = await ensureYtDlp();
  fs.mkdirSync(config.tmpDir, { recursive: true });
  const base = path.join(config.tmpDir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const outTemplate = `${base}.%(ext)s`;

  const args = [
    '--no-playlist',
    '--max-filesize', String(config.maxDownloadBytes),
    '--no-warnings',
    '-o', outTemplate
  ];
  if (audioOnly) {
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
  } else {
    args.push('-f', 'mp4[filesize<=50M]/mp4/best[filesize<=50M]/best');
  }
  args.push(url);

  let stdout = '';
  try {
    stdout = await run(ytdlp, args);
  } catch (err) {
    const msg = err.message || '';
    if (/file is larger than/i.test(msg) || /max-filesize/i.test(msg)) {
      throw new Error(`That file is larger than the ${humanSize(config.maxDownloadBytes)} limit.`);
    }
    throw new Error(`Download failed: ${msg || 'unknown error'}`);
  }

  // Find the file yt-dlp actually wrote.
  const files = fs.readdirSync(config.tmpDir)
    .filter((f) => f.startsWith(path.basename(base)))
    .map((f) => path.join(config.tmpDir, f));
  if (files.length === 0) throw new Error('Download finished but no file was produced.');
  const file = files.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
  const size = fs.statSync(file).size;
  if (size > config.maxDownloadBytes) {
    fs.unlinkSync(file);
    throw new Error(`That file is ${humanSize(size)} — over the ${humanSize(config.maxDownloadBytes)} limit.`);
  }

  const titleMatch = stdout.match(/\[download\] Destination: .+\n/) || [];
  const title = path.basename(file);
  void titleMatch;
  return { file, title, isAudio: audioOnly, size };
}

function cleanupFile(file) {
  try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch { /* gone */ }
}

module.exports = { download, cleanupFile, ensureYtDlp, isUrl, humanSize };
